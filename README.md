# LifeTime Financial Exchange

A responsive landing page and Express backend for LifeTime — India's Financial Exchange. Registration data is saved in SQLite, and new registrations receive a welcome email through Gmail SMTP.

## Run locally

1. Install Node.js.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` (for example, in PowerShell: `Copy-Item .env.example .env`).
4. Configure the Gmail App Password and replace the sample admin password and session secret, as described below.
5. Start the app:

   ```bash
   npm start
   ```

6. Open the website at `http://localhost:3000` and the registration dashboard at `http://localhost:3000/admin`.

The Express app serves the website, API, and dashboard together. Live Server and `python -m http.server` do not provide the registration API or persistent database.

## Gmail welcome email setup

The signup form already asks the registrant for their email address. To send messages, the backend also needs an email account that it can send from. A custom website-domain email is not required; the existing site contact Gmail address can be used if you control it.

1. Sign in to the sender Gmail account and enable 2-Step Verification.
2. Create a Google App Password for this app.
3. Set `SMTP_USER` to the sender Gmail address and `SMTP_PASS` to the 16-character App Password in `.env`.
4. Keep `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, and `SMTP_SECURE=false`.
5. Set `SMTP_FROM` to a sender name and that same Gmail address.

Do not use your normal Gmail password. Never commit `.env` or share the App Password. If SMTP is unavailable, registrations are still saved and the dashboard lets you retry failed welcome emails after fixing SMTP settings.

## Admin dashboard setup

Set the following in `.env`:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-this-with-a-long-unique-password
SESSION_SECRET=replace-this-with-a-random-secret-at-least-32-characters-long
```

Use a unique, strong admin password. Generate a random session secret in PowerShell with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The private `/admin` dashboard requires sign-in and supports searching, CSV export, retrying welcome emails, and deleting registrations. The admin API is protected by a signed, expiring, HTTP-only cookie, and login attempts are rate-limited. Do not expose the dashboard with default/example credentials.

## Storage and deployment

Registrations are stored in `data/lifetime.sqlite`. SQLite is suitable for local use and small deployments with a persistent disk. For production, deploy the Node.js app to a host that provides persistent storage, set `DATABASE_FILE` to a path on that persistent disk, configure all SMTP and admin secrets as host environment variables, and use HTTPS. If deploying multiple server instances or expecting high write traffic, use a managed database such as PostgreSQL instead of a local SQLite file.

The server imports existing entries from `data/registrations.json` once, on first database initialization. The SQLite database files are excluded from Git.

## API

- `GET /api/health` — health check.
- `POST /api/register` — register a user with `name`, `email`, `mobile`, `interest`, and `city`.
- `POST /api/admin/login` — sign in to the admin dashboard.
- `GET /api/admin/registrations` — list registrations; requires admin authentication.
- `POST /api/admin/registrations/:id/retry-email` — retry a welcome email; requires admin authentication.
- `DELETE /api/admin/registrations/:id` — delete a registration; requires admin authentication.

## Notes

The landing page uses CSS-generated shapes and gradients to mimic the visual reference without requiring external image assets.
