const express = require('express');
const router = express.Router();
const { newsletters, subscribers } = require('../database');
const { requireAuth, optionalAuth } = require('../middleware/requireAuth');

// GET / — landing page
router.get('/', optionalAuth, (req, res) => {
  const recentIssues = newsletters.getRecent(3);
  const totalSubscribers = subscribers.countByStatus('active');
  res.render('landing', {
    recentIssues,
    totalSubscribers,
    subscriber: req.subscriber || null,
    error: req.query.error || null,
    cancelled: req.query.cancelled || null,
  });
});

// GET /health — Railway health check
router.get('/health', (req, res) => res.json({ status: 'ok' }));

// GET /archive — subscriber-only full archive
router.get('/archive', requireAuth, (req, res) => {
  const allIssues = newsletters.getAll();
  res.render('archive', { issues: allIssues, subscriber: req.subscriber });
});

// GET /issues/:id — view a single issue
router.get('/issues/:id', optionalAuth, (req, res) => {
  const issue = newsletters.findById(req.params.id);
  if (!issue) return res.status(404).render('error', { message: 'Issue not found.' });

  const isSubscriber = !!req.subscriber;
  res.render('issue', { issue, isSubscriber, subscriber: req.subscriber || null });
});

// GET /issues/:id/render — serve raw newsletter HTML (used in iframes)
router.get('/issues/:id/render', optionalAuth, (req, res) => {
  const issue = newsletters.findById(req.params.id);
  if (!issue) return res.status(404).send('<p>Issue not found.</p>');

  const isSubscriber = !!req.subscriber;
  const isPreview    = req.query.preview === 'true';

  // Build the HTML to serve
  let html = issue.html_content;

  // For non-subscribers, inject a height cap via a wrapper style — the
  // parent page's CSS overlay handles the paywall presentation.
  // We do NOT truncate HTML string-side (would break tags).
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  if (!isSubscriber && !isPreview) {
    // Serve a teaser-flagged version
    res.send(buildIframeHtml(html, false));
  } else if (isPreview) {
    res.send(buildIframeHtml(html, false));
  } else {
    res.send(buildIframeHtml(html, true));
  }
});

// GET /account — subscriber account management
router.get('/account', requireAuth, (req, res) => {
  res.render('account', { subscriber: req.subscriber, message: null, error: null });
});

// POST /account/cancel
router.post('/account/cancel', requireAuth, async (req, res) => {
  const subscriber = req.subscriber;
  try {
    if (subscriber.stripe_subscription_id) {
      const { cancelSubscription } = require('../services/stripe');
      await cancelSubscription(subscriber.stripe_subscription_id);
    }
    res.render('account', {
      subscriber,
      message: 'Your subscription has been cancelled and will end at the close of your current billing period.',
      error: null,
    });
  } catch (err) {
    console.error('Cancel error:', err);
    res.render('account', { subscriber, message: null, error: 'Unable to cancel at this time. Please try again.' });
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildIframeHtml(content, fullAccess) {
  const style = fullAccess
    ? `body{margin:0;padding:16px;font-family:Inter,Arial,sans-serif}`
    : `body{margin:0;padding:16px;font-family:Inter,Arial,sans-serif;overflow:hidden;max-height:420px}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${style}</style>
</head>
<body>${content}</body>
</html>`;
}

module.exports = router;
