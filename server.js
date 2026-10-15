const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'registrations.json');
const DATABASE_FILE = process.env.DATABASE_FILE
  ? path.resolve(process.env.DATABASE_FILE)
  : path.join(DATA_DIR, 'lifetime.sqlite');
const ADMIN_PAGE = path.join(__dirname, 'admin.html');
const INTERESTS = new Set(['Loans', 'Insurance', 'Investments', 'Wealth Solutions']);
const ADMIN_SESSION_COOKIE = 'lifetime_admin';
const ADMIN_SESSION_DURATION = 4 * 60 * 60 * 1000;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.dirname(DATABASE_FILE), { recursive: true });
const db = new Database(DATABASE_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS registrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    mobile TEXT NOT NULL,
    interest TEXT NOT NULL,
    city TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    emailStatus TEXT NOT NULL
  )
`);

const hasImportedLegacyData = db.prepare(
  "SELECT value FROM app_metadata WHERE key = 'legacy_json_imported'"
).get();
if (!hasImportedLegacyData) {
  const legacyRegistrations = fs.existsSync(DATA_FILE)
    ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    : [];
  if (!Array.isArray(legacyRegistrations)) {
    throw new Error('Existing registrations.json must contain a JSON array.');
  }
  const importRegistration = db.prepare(`
    INSERT OR IGNORE INTO registrations
      (id, name, email, mobile, interest, city, createdAt, emailStatus)
    VALUES
      (@id, @name, @email, @mobile, @interest, @city, @createdAt, @emailStatus)
  `);
  const importLegacyData = db.transaction((registrations) => {
    for (const registration of registrations) {
      if (
        registration &&
        typeof registration.name === 'string' &&
        typeof registration.email === 'string' &&
        typeof registration.mobile === 'string' &&
        typeof registration.interest === 'string' &&
        typeof registration.city === 'string'
      ) {
        importRegistration.run({
          id: registration.id || crypto.randomUUID(),
          name: registration.name,
          email: registration.email.toLowerCase(),
          mobile: registration.mobile,
          interest: registration.interest,
          city: registration.city,
          createdAt: registration.createdAt || new Date().toISOString(),
          emailStatus: registration.emailStatus || 'unknown',
        });
      }
    }
    db.prepare("INSERT INTO app_metadata (key, value) VALUES ('legacy_json_imported', 'true')").run();
  });
  importLegacyData(legacyRegistrations);
}

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

function validateRegistration(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'Please submit registration details.';
  }

  const { name, email, mobile, interest, city } = payload;

  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    return 'Name is required and must be under 100 characters.';
  }

  if (
    typeof email !== 'string' ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return 'A valid email is required.';
  }

  if (typeof mobile !== 'string' || !/^\d{10}$/.test(mobile.trim())) {
    return 'Mobile number must contain 10 digits.';
  }

  if (typeof interest !== 'string' || !INTERESTS.has(interest.trim())) {
    return 'Please select a valid interest.';
  }

  if (typeof city !== 'string' || !city.trim() || city.trim().length > 100) {
    return 'City is required and must be under 100 characters.';
  }

  return null;
}

function escapeHtml(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

async function sendWelcomeEmail({ name, email }) {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || SMTP_USER,
    to: email,
    subject: 'Welcome to LifeTime — Your Early Access Is Confirmed',
    text: `Welcome, ${name}! Thank you for joining the LifeTime early access list. We will reach out soon with product updates and launch news.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="color: #0f172a;">Welcome, ${escapeHtml(name)}!</h2>
        <p>Thank you for joining the LifeTime early access list.</p>
        <p>We are excited to keep you informed about our financial solutions, product updates, and launch news.</p>
        <p>We will reach out soon with the next steps.</p>
        <p>Best regards,<br />The LifeTime Team</p>
      </div>
    `,
  });
  return true;
}

function configuredAdmin() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD && process.env.SESSION_SECRET);
}

function constantTimeEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function createAdminToken(username) {
  const payload = Buffer.from(JSON.stringify({
    username,
    expiresAt: Date.now() + ADMIN_SESSION_DURATION,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function getCookie(req, cookieName) {
  const cookies = (req.headers.cookie || '').split(';');
  const cookie = cookies.find((entry) => entry.trim().startsWith(`${cookieName}=`));
  return cookie ? cookie.trim().slice(cookieName.length + 1) : '';
}

function isAdminAuthenticated(req) {
  if (!configuredAdmin()) {
    return false;
  }

  const token = getCookie(req, ADMIN_SESSION_COOKIE);
  const [payload, providedSignature] = token.split('.');
  if (!payload || !providedSignature) {
    return false;
  }

  const expectedSignature = crypto.createHmac('sha256', process.env.SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  if (!constantTimeEqual(providedSignature, expectedSignature)) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.username === process.env.ADMIN_USERNAME && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!configuredAdmin()) {
    return res.status(503).json({
      success: false,
      message: 'Admin login is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD, and SESSION_SECRET in .env.',
    });
  }
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ success: false, message: 'Please sign in to continue.' });
  }
  return next();
}

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LifeTime backend is running.' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(ADMIN_PAGE);
});

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/admin-assets', express.static(path.join(__dirname, 'admin-assets')));

app.post('/api/register', async (req, res) => {
  const validationError = validateRegistration(req.body);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }

  const registration = {
    id: crypto.randomUUID(),
    name: req.body.name.trim(),
    email: req.body.email.trim().toLowerCase(),
    mobile: req.body.mobile.trim(),
    interest: req.body.interest.trim(),
    city: req.body.city.trim(),
    createdAt: new Date().toISOString(),
    emailStatus: 'pending',
  };

  try {
    db.prepare(`
      INSERT INTO registrations
        (id, name, email, mobile, interest, city, createdAt, emailStatus)
      VALUES
        (@id, @name, @email, @mobile, @interest, @city, @createdAt, @emailStatus)
    `).run(registration);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ success: false, message: 'This email is already registered.' });
    }
    console.error('Registration storage failed:', error);
    return res.status(500).json({
      success: false,
      message: 'We could not save your registration. Please try again later.',
    });
  }

  let emailSent = false;
  let emailStatus = 'configuration_required';
  try {
    emailSent = await sendWelcomeEmail(registration);
    if (emailSent) {
      emailStatus = 'sent';
    }
  } catch (error) {
    emailStatus = 'failed';
    console.error('Welcome email sending failed:', error);
  }

  try {
    db.prepare('UPDATE registrations SET emailStatus = ? WHERE id = ?').run(emailStatus, registration.id);
  } catch (error) {
    console.error('Could not update registration email status:', error);
  }

  return res.status(201).json({
    success: true,
    emailSent,
    message: emailSent
      ? 'Registration successful. A welcome email has been sent.'
      : 'Registration saved, but the welcome email could not be sent. Please check email setup and try again.',
  });
});

app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  if (!configuredAdmin()) {
    return res.status(503).json({
      success: false,
      message: 'Admin login is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD, and SESSION_SECRET in .env.',
    });
  }

  const { username, password } = req.body || {};
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !constantTimeEqual(username, process.env.ADMIN_USERNAME) ||
    !constantTimeEqual(password, process.env.ADMIN_PASSWORD)
  ) {
    return res.status(401).json({ success: false, message: 'The username or password is incorrect.' });
  }

  const secureCookie = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=${createAdminToken(username)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_DURATION / 1000};${secureCookie}`);
  return res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  return res.json({ success: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ success: true, username: process.env.ADMIN_USERNAME });
});

app.get('/api/admin/registrations', requireAdmin, (req, res) => {
  try {
    const registrations = db.prepare(`
      SELECT id, name, email, mobile, interest, city, createdAt, emailStatus
      FROM registrations
      ORDER BY createdAt DESC
    `).all();
    return res.json({ success: true, registrations });
  } catch (error) {
    console.error('Could not load registrations:', error);
    return res.status(500).json({ success: false, message: 'Could not load registrations.' });
  }
});

app.post('/api/admin/registrations/:id/retry-email', requireAdmin, async (req, res) => {
  const registration = db.prepare(`
    SELECT id, name, email
    FROM registrations
    WHERE id = ?
  `).get(req.params.id);
  if (!registration) {
    return res.status(404).json({ success: false, message: 'Registration not found.' });
  }

  try {
    const emailSent = await sendWelcomeEmail(registration);
    const emailStatus = emailSent ? 'sent' : 'configuration_required';
    db.prepare('UPDATE registrations SET emailStatus = ? WHERE id = ?').run(emailStatus, registration.id);
    return res.json({
      success: true,
      emailSent,
      message: emailSent
        ? 'Welcome email sent.'
        : 'Email is not configured. Set SMTP credentials in .env and try again.',
    });
  } catch (error) {
    console.error('Welcome email retry failed:', error);
    try {
      db.prepare('UPDATE registrations SET emailStatus = ? WHERE id = ?').run('failed', registration.id);
    } catch (storageError) {
      console.error('Could not update registration email status after retry failure:', storageError);
    }
    return res.status(502).json({ success: false, message: 'The welcome email could not be sent. Check SMTP settings and try again.' });
  }
});

app.delete('/api/admin/registrations/:id', requireAdmin, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM registrations WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found.' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Could not delete registration:', error);
    return res.status(500).json({ success: false, message: 'Could not delete this registration.' });
  }
});

app.listen(PORT, () => {
  console.log(`LifeTime backend listening on http://localhost:${PORT}`);
});
