const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { subscribers, magicLinks } = require('../database');
const { sendMagicLink } = require('../services/sendgrid');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts. Please wait 15 minutes and try again.',
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /login
router.get('/login', (req, res) => {
  if (req.session && req.session.subscriberId) return res.redirect('/archive');
  const reason = req.query.reason;
  res.render('login', { reason, error: null });
});

// POST /login — send magic link
router.post('/login', loginLimiter, async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.render('login', { reason: null, error: 'Please enter a valid email address.' });
  }

  const subscriber = subscribers.findByEmail(email);

  // Always show the same "check your email" response — don't reveal
  // whether the email is in the system
  if (subscriber && subscriber.status === 'active') {
    try {
      magicLinks.cleanup();
      const token = magicLinks.create(email);
      await sendMagicLink(email, token);
    } catch (err) {
      console.error('Magic link send error:', err);
      return res.render('login', {
        reason: null,
        error: 'Failed to send login email. Please try again in a moment.',
      });
    }
  }

  res.render('login-sent', { email });
});

// GET /auth/verify?token=xxx
router.get('/auth/verify', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/login?reason=invalid');

  const link = magicLinks.verify(token);
  if (!link) {
    return res.render('login', {
      reason: null,
      error: 'This login link has expired or already been used. Please request a new one.',
    });
  }

  const subscriber = subscribers.findByEmail(link.email);
  if (!subscriber || subscriber.status !== 'active') {
    return res.redirect('/login?reason=inactive');
  }

  req.session.regenerate(err => {
    if (err) {
      console.error('Session regeneration error:', err);
      return res.redirect('/login');
    }
    req.session.subscriberId = subscriber.id;
    const returnTo = req.session.returnTo || '/archive';
    delete req.session.returnTo;
    res.redirect(returnTo);
  });
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
