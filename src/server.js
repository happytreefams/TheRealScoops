require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path    = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

// ─── Trust proxy (needed on Railway/Render behind load balancer) ──────────────
app.set('trust proxy', 1);

// ─── Stripe webhook — MUST receive raw body before any JSON parsers ───────────
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));

// ─── General middleware ───────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// ─── View engine ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// ─── Sessions ─────────────────────────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave:            false,
  saveUninitialized: false,
  name:              'trs.sid',
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// ─── Global rate limiter ──────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ─── Inject common locals ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.isAdmin      = !!(req.session && req.session.isAdmin);
  res.locals.subscriberId = req.session && req.session.subscriberId;
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/webhooks', require('./routes/webhook'));
app.use('/',         require('./routes/newsletter'));
app.use('/',         require('./routes/auth'));
app.use('/',         require('./routes/subscribe'));
app.use('/admin',    require('./routes/admin'));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found.' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('error', { message: 'Something went wrong. Please try again.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`The Real Scoops running on http://localhost:${PORT}`);
});
