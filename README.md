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

## Production deployment

The backend is an Express application using SQLite (`better-sqlite3`) and Nodemailer. The included `render.yaml` deploys it as a Render Node web service and mounts a persistent disk at `/var/data`, so registrations survive service restarts and redeploys. The persistent disk requires a paid Render service plan. Cloudflare serves the static website and its Worker proxies `/api/*` requests to Render, keeping admin cookies same-origin in the browser.

### Deploy the backend to Render

1. Push this repository to GitHub, then in Render choose **New > Blueprint** and select the repository. Render reads `render.yaml` and creates the Node web service and persistent disk.
2. In the service environment settings, set the prompted secret values:
   - `FRONTEND_ORIGINS`: the exact HTTPS origin serving the Cloudflare site, such as `https://your-site.pages.dev` (no trailing slash). Include multiple exact origins separated by commas if needed. The Cloudflare Worker forwards the browser's origin to the backend, which checks it against this allowlist.
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`: your SMTP provider settings. For Gmail, use a Google App Password, not your normal account password.
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `SESSION_SECRET`: unique production credentials. Generate a session secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
3. Keep the blueprint's `DATABASE_FILE=/var/data/lifetime.sqlite`. The disk mount is required for persistence; the default ephemeral filesystem is not suitable for the SQLite database.
4. Deploy the service and check `https://<your-render-service>.onrender.com/api/health`.

Render stores the supplied values as service environment variables. Never put SMTP or admin credentials in HTML, JavaScript, Git, or the Cloudflare frontend build.

### Connect and deploy the Cloudflare frontend

By default, both the registration form and admin dashboard call same-origin `/api/*` URLs. The Cloudflare Worker in `worker.js` forwards those requests to the Render backend, avoiding third-party cookie restrictions. The Worker needs the backend origin as a Cloudflare secret; it is not exposed to the browser.

In PowerShell, build and deploy the Cloudflare site/Worker:

```powershell
npm run deploy
npx wrangler secret put API_ORIGIN
```

When prompted for `API_ORIGIN`, enter the Render service origin, for example `https://<your-render-service>.onrender.com` (no path or trailing slash). `npm run deploy` builds only the production frontend files into `dist` and deploys the Worker and assets using `wrangler.jsonc`. The Worker routes `/api/*` to the backend; other requests are served from `dist`. Do not run Wrangler with an assets directory pointing at the repository root.

After the first Cloudflare deployment, set `FRONTEND_ORIGINS` in Render to the exact Cloudflare site origin and redeploy/restart the backend. CORS allows only those configured origins and credentials. The admin login cookie is HTTP-only, Secure, and the browser sees it as same-origin because the Worker proxies the API. If you later set `LIFETIME_API_BASE_URL` during the frontend build to call Render directly instead of using the Worker proxy, set that exact Render origin in `FRONTEND_ORIGINS`; direct cross-site cookies may be blocked by browser privacy settings.

### Test production features

1. Open the deployed Cloudflare site, submit a unique registration, and confirm the success response.
2. Check the Render logs for `Registration storage failed` or `Welcome email sending failed`; email delivery also depends on valid SMTP provider credentials.
3. Open `<Cloudflare-site-origin>/admin`, sign in using the Render admin environment variables, and verify the registration is listed.
4. Test search, CSV export, retry email, delete, and sign out. Confirm email status reflects the SMTP result.
5. Check the Render health endpoint after deployment. Do not treat a successful frontend deploy as proof that the backend, database persistence, or SMTP delivery is working.

For an end-to-end SMTP test, use a real test recipient you control. A local/mock SMTP check can confirm the application sends a message to an SMTP server, but cannot verify delivery to the recipient's inbox.

The backend imports existing entries from `data/registrations.json` once, on first database initialization. The local SQLite database files are excluded from Git.

## API

- `GET /api/health` — health check.
- `POST /api/register` — register a user with `name`, `email`, `mobile`, `interest`, and `city`.
- `POST /api/admin/login` — sign in to the admin dashboard.
- `GET /api/admin/registrations` — list registrations; requires admin authentication.
- `POST /api/admin/registrations/:id/retry-email` — retry a welcome email; requires admin authentication.
- `DELETE /api/admin/registrations/:id` — delete a registration; requires admin authentication.

## Notes

The landing page uses CSS-generated shapes and gradients to mimic the visual reference without requiring external image assets.
