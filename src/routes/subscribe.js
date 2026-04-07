const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { subscribers } = require('../database');
const { createCheckoutSession, getCheckoutSession } = require('../services/stripe');

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many signup attempts. Please try again later.',
});

// POST /subscribe — collect name + email, create subscriber record, redirect to Stripe
router.post('/subscribe', signupLimiter, async (req, res) => {
  const name  = (req.body.name  || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();

  if (!name || name.length < 2) {
    return res.redirect('/?error=name');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.redirect('/?error=email');
  }

  try {
    // Upsert subscriber record
    let subscriber = subscribers.findByEmail(email);

    if (subscriber && subscriber.status === 'active') {
      // Already subscribed — send them to login
      return res.redirect('/login?reason=already_subscribed');
    }

    if (!subscriber) {
      const result = subscribers.create(name, email);
      subscriber = subscribers.findById(result.lastInsertRowid);
    }

    // Create Stripe Checkout session
    const session = await createCheckoutSession(name, email, subscriber.id);
    res.redirect(303, session.url);

  } catch (err) {
    console.error('Subscribe error:', err);
    res.redirect('/?error=server');
  }
});

// GET /subscribe/success
router.get('/subscribe/success', async (req, res) => {
  const { session_id } = req.query;
  let subscriberName = 'there';

  if (session_id) {
    try {
      const session = await getCheckoutSession(session_id);
      subscriberName = session.metadata?.subscriber_name || 'there';
    } catch (err) {
      console.error('Error fetching checkout session:', err.message);
    }
  }

  res.render('subscribe-success', { name: subscriberName });
});

// GET /subscribe/cancel
router.get('/subscribe/cancel', (req, res) => {
  res.redirect('/?cancelled=1');
});

// GET /unsubscribe?token=xxx
router.get('/unsubscribe', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/');

  const subscriber = subscribers.findByUnsubscribeToken(token);
  if (!subscriber) {
    return res.render('unsubscribe', { success: false, error: 'Invalid unsubscribe link.' });
  }

  res.render('unsubscribe', { success: null, subscriber, token });
});

// POST /unsubscribe — confirm unsubscribe
router.post('/unsubscribe', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.redirect('/');

  const subscriber = subscribers.findByUnsubscribeToken(token);
  if (!subscriber) {
    return res.render('unsubscribe', { success: false, error: 'Invalid unsubscribe link.' });
  }

  try {
    // Cancel Stripe subscription at period end
    if (subscriber.stripe_subscription_id) {
      const { cancelSubscription } = require('../services/stripe');
      await cancelSubscription(subscriber.stripe_subscription_id);
    }
    // DB status stays 'active' until period ends — Stripe webhook will update it
    // But mark as cancelled right away for a clean UX
    subscribers.updateStatusById(subscriber.id, 'cancelled');

    // Destroy session if they were logged in
    if (req.session && req.session.subscriberId === subscriber.id) {
      req.session.destroy(() => {});
    }

    res.render('unsubscribe', { success: true, subscriber: null, token: null, error: null });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.render('unsubscribe', { success: false, error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
