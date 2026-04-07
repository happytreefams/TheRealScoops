# The Real Scoop

Weekly GTA real estate market newsletter platform — $9.99/month subscription with Stripe, SendGrid email delivery, and a full admin dashboard.

---

## Tech stack

- **Backend**: Node.js + Express
- **Database**: SQLite (via `better-sqlite3`)
- **Payments**: Stripe (hosted Checkout + webhooks)
- **Email**: SendGrid
- **Templates**: EJS
- **Hosting**: Railway

---

## Quick start (local development)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your real values (see [Environment variables](#environment-variables) below).

### 3. Run the dev server

```bash
npm run dev
```

App runs at `http://localhost:3000`.

Admin dashboard: `http://localhost:3000/admin`

---

## Environment variables

| Variable | Description |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `PORT` | Server port (Railway sets this automatically) |
| `BASE_URL` | Full URL of your site, e.g. `https://therealscoops.com` |
| `SESSION_SECRET` | Random string ≥ 32 chars — run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_PASSWORD` | Password to log into `/admin` |
| `DATABASE_PATH` | Path to SQLite file. Leave blank locally. Set to `/data/therealscoops.db` on Railway. |
| `STRIPE_SECRET_KEY` | From Stripe dashboard → Developers → API keys |
| `STRIPE_PUBLISHABLE_KEY` | Same location (used client-side, stored for completeness) |
| `STRIPE_WEBHOOK_SECRET` | Generated when you create a webhook endpoint in Stripe |
| `STRIPE_PRICE_ID` | The `price_...` ID of your $9.99/month recurring price |
| `SENDGRID_API_KEY` | From SendGrid → Settings → API Keys |
| `SENDGRID_FROM_EMAIL` | Verified sender email in SendGrid |
| `SENDGRID_FROM_NAME` | Display name, e.g. `The Real Scoop` |
| `ADMIN_EMAIL` | Your email — where test newsletters are sent |

---

## Stripe setup

### 1. Create a product and price

1. Stripe Dashboard → **Products** → **Add product**
2. Name: `The Real Scoop`
3. Pricing: **Recurring**, `$9.99 CAD` (or USD), **Monthly**
4. Copy the `price_...` ID → set as `STRIPE_PRICE_ID`

### 2. Create a webhook endpoint

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. URL: `https://therealscoops.com/webhooks/stripe`
3. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
4. Copy the **Signing secret** (`whsec_...`) → set as `STRIPE_WEBHOOK_SECRET`

### 3. Test locally with Stripe CLI

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

This gives you a local `whsec_...` to use during development.

---

## SendGrid setup

1. Create a **Sender Identity** (Settings → Sender Authentication) and verify your sending domain or email.
2. Create an API key (Settings → API Keys → Create API Key → Full Access or restricted to Mail Send).
3. Set `SENDGRID_FROM_EMAIL` to the verified sender address.

---

## Deploying to Railway

### 1. Create a Railway project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and init
railway login
railway init
```

Or use the Railway web UI: [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.

### 2. Add a persistent volume (required for SQLite)

Railway's filesystem is ephemeral — the SQLite database must live on a persistent volume.

1. Railway dashboard → your service → **Volumes** tab
2. **Add volume** → mount path: `/data`
3. Set `DATABASE_PATH=/data/therealscoops.db` in your Railway environment variables

### 3. Set environment variables

Railway dashboard → your service → **Variables** tab. Add every variable from `.env.example` with your production values.

Key differences from local `.env`:
```
NODE_ENV=production
BASE_URL=https://therealscoops.com
DATABASE_PATH=/data/therealscoops.db
STRIPE_SECRET_KEY=sk_live_...   ← use live keys, not test
STRIPE_WEBHOOK_SECRET=whsec_... ← from your production webhook endpoint
```

### 4. Deploy

```bash
railway up
```

Or push to GitHub — Railway auto-deploys on every push if connected.

### 5. Health check

Railway uses `GET /health` as the health check endpoint (configured in `railway.json`).

---

## Custom domain (therealscoops.com)

1. Railway dashboard → your service → **Settings** → **Domains** → **Add custom domain**
2. Enter `therealscoops.com`
3. Railway shows you a `CNAME` record to add to your DNS provider
4. Add the CNAME at your registrar (Cloudflare, Namecheap, etc.)
5. Also add `www` → redirect to apex or add a second CNAME
6. SSL is provisioned automatically by Railway

---

## Your weekly workflow

### Adding and sending a new issue

1. Log into the admin dashboard: `https://therealscoops.com/admin`
2. Click **Upload Issue** in the sidebar
3. Fill in the issue number, subject line, and optional preview text
4. Either upload your `.html` file or paste the HTML directly
5. Click **Upload issue** — it's saved to the archive immediately
6. You'll be redirected to the newsletter list. Click **Manage →** on your new issue.
7. Click **Send test email** — review it in your inbox
8. If it looks good, click **Send to all subscribers**
9. Done. The issue is marked as sent with a recipient count.

### Viewing subscriber data

- **Dashboard** (`/admin`): MRR, active count, weekly growth, churn, recent issues
- **Subscribers** (`/admin/subscribers`): Full list with search + status filter
- **Export CSV**: Button on the subscribers page → downloads `subscribers.csv`

---

## Subscriber experience

| Action | URL |
|---|---|
| Subscribe | `/#subscribe` (landing page form) |
| Login (magic link) | `/login` |
| View archive | `/archive` (requires active subscription) |
| Manage account | `/account` |
| Unsubscribe | `/unsubscribe?token=TOKEN` (in every email footer) |

---

## Adding your first newsletter issue

You can seed the database directly via the admin UI, or use SQLite if you want to import existing issues in bulk:

```bash
# Open the database
sqlite3 database/therealscoops.db

# Insert an issue
INSERT INTO newsletters (issue_number, subject, html_content, preview_text, published_at)
VALUES (1, 'GTA Market Brief — Week of April 7, 2026', '<p>Your HTML here</p>', 'Short teaser text', datetime('now'));
```

---

## Project structure

```
src/
  server.js              # Express app entry point
  database.js            # SQLite schema + query helpers
  routes/
    auth.js              # Magic link login / logout
    subscribe.js         # Stripe checkout + unsubscribe
    newsletter.js        # Landing page, archive, issue viewer
    admin.js             # Admin dashboard, subscribers, newsletters
    webhook.js           # Stripe webhook handler
  middleware/
    requireAuth.js       # Subscriber session guard
    requireAdmin.js      # Admin session guard
  services/
    stripe.js            # Stripe API helpers
    sendgrid.js          # SendGrid email helpers

views/
  partials/              # Shared head, nav, footer
  admin/
    partials/            # Admin sidebar layout
    dashboard.ejs
    subscribers.ejs
    newsletters.ejs
    upload.ejs
    view.ejs
  landing.ejs            # Public homepage
  issue.ejs              # Single issue viewer (paywall-aware)
  archive.ejs            # Full archive (subscribers only)
  login.ejs / login-sent.ejs
  account.ejs
  unsubscribe.ejs

public/
  css/styles.css         # Full design system
  js/main.js
  favicon.svg
```

---

## Security notes

- Stripe webhook signature is verified on every request
- Sessions use `httpOnly` + `secure` cookies in production
- Magic links expire after 15 minutes and are single-use
- Admin password is stored only in environment variables (never in DB)
- Newsletter HTML is rendered in sandboxed iframes (`sandbox="allow-same-origin"`)
- Rate limiting on login and signup endpoints
- SQLite runs with WAL mode for concurrent reads

---

## GDPR / CAN-SPAM compliance

- Every email includes a one-click unsubscribe link
- Unsubscribe cancels Stripe billing and removes email access
- Subscriber data export available via CSV
- No tracking pixels are added by default (your newsletter HTML controls this)
