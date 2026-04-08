const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAdmin } = require('../middleware/requireAdmin');
const { subscribers, newsletters } = require('../database');
const { sendNewsletterBatch, sendTestEmail } = require('../services/sendgrid');

// Multer — memory storage (newsletter HTML stored in DB, not on disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(req, file, cb) {
    if (file.mimetype === 'text/html' || file.originalname.endsWith('.html')) {
      cb(null, true);
    } else {
      cb(new Error('Only HTML files are accepted.'));
    }
  },
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.regenerate(err => {
      if (err) return res.render('admin/login', { error: 'Session error. Please try again.' });
      req.session.isAdmin = true;
      const returnTo = req.session.adminReturnTo || '/admin';
      delete req.session.adminReturnTo;
      res.redirect(returnTo);
    });
  } else {
    res.render('admin/login', { error: 'Incorrect password.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/', requireAdmin, (req, res) => {
  const active      = subscribers.countByStatus('active');
  const cancelled   = subscribers.countByStatus('cancelled');
  const pastDue     = subscribers.countByStatus('past_due');
  const newThisWeek = subscribers.countRecentSignups(7);
  const churnedThisMonth = subscribers.countChurnedThisMonth();
  const recentNewsletters = newsletters.getRecent(5);
  const mrr = (active * 9.99).toFixed(2);

  const growthRate = active > 0
    ? ((newThisWeek / Math.max(active - newThisWeek, 1)) * 100).toFixed(1)
    : '0.0';

  res.render('admin/dashboard', {
    active, cancelled, pastDue, newThisWeek, churnedThisMonth,
    recentNewsletters, mrr, growthRate,
  });
});

// ─── Subscribers ─────────────────────────────────────────────────────────────

router.get('/subscribers', requireAdmin, (req, res) => {
  const allSubs = subscribers.getAll();
  res.render('admin/subscribers', { subscribers: allSubs });
});

// Export subscribers as CSV
router.get('/subscribers/export', requireAdmin, (req, res) => {
  const allSubs = subscribers.getAll();
  const header = 'id,name,email,status,created_at,stripe_customer_id\n';
  const rows = allSubs.map(s =>
    `${s.id},"${s.name.replace(/"/g, '""')}","${s.email}","${s.status}","${s.created_at}","${s.stripe_customer_id || ''}"`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
  res.send(header + rows);
});

// Cancel subscriber
router.post('/subscribers/:id/cancel', requireAdmin, async (req, res) => {
  const subscriber = subscribers.findById(req.params.id);
  if (!subscriber) return res.redirect('/admin/subscribers');

  try {
    if (subscriber.stripe_subscription_id) {
      const { cancelSubscription } = require('../services/stripe');
      await cancelSubscription(subscriber.stripe_subscription_id);
    }
    subscribers.updateStatusById(subscriber.id, 'cancelled');
  } catch (err) {
    console.error('Admin cancel error:', err);
  }
  res.redirect('/admin/subscribers');
});

// Manually activate a pending subscriber (bypass Stripe — use when webhook missed)
router.post('/subscribers/:id/activate', requireAdmin, (req, res) => {
  subscribers.updateStatusById(req.params.id, 'active');
  res.redirect('/admin/subscribers');
});

// Reactivate subscriber (un-cancel in Stripe)
router.post('/subscribers/:id/reactivate', requireAdmin, async (req, res) => {
  const subscriber = subscribers.findById(req.params.id);
  if (!subscriber) return res.redirect('/admin/subscribers');

  try {
    if (subscriber.stripe_subscription_id) {
      const { reactivateSubscription } = require('../services/stripe');
      await reactivateSubscription(subscriber.stripe_subscription_id);
    }
    subscribers.updateStatusById(subscriber.id, 'active');
  } catch (err) {
    console.error('Admin reactivate error:', err);
  }
  res.redirect('/admin/subscribers');
});

// ─── Newsletters ──────────────────────────────────────────────────────────────

router.get('/newsletters', requireAdmin, (req, res) => {
  const allIssues = newsletters.getAll();
  res.render('admin/newsletters', { newsletters: allIssues, message: req.query.message || null });
});

// Upload form
router.get('/newsletters/upload', requireAdmin, (req, res) => {
  const nextNumber = newsletters.nextIssueNumber();
  res.render('admin/upload', { nextNumber, error: null });
});

// Handle upload
router.post('/newsletters/upload', requireAdmin, upload.single('html_file'), (req, res) => {
  try {
    const { subject, issue_number, preview_text } = req.body;

    if (!subject || !subject.trim()) {
      const nextNumber = newsletters.nextIssueNumber();
      return res.render('admin/upload', { nextNumber, error: 'Subject line is required.' });
    }

    let htmlContent = '';

    if (req.file) {
      // Uploaded file
      htmlContent = req.file.buffer.toString('utf8');
    } else if (req.body.html_content) {
      // Pasted HTML
      htmlContent = req.body.html_content;
    } else {
      const nextNumber = newsletters.nextIssueNumber();
      return res.render('admin/upload', { nextNumber, error: 'Please upload an HTML file or paste HTML content.' });
    }

    const issueNum = parseInt(issue_number, 10) || newsletters.nextIssueNumber();
    newsletters.create(issueNum, subject.trim(), htmlContent, (preview_text || '').trim() || null);

    res.redirect('/admin/newsletters?message=uploaded');
  } catch (err) {
    console.error('Upload error:', err);
    const nextNumber = newsletters.nextIssueNumber();
    res.render('admin/upload', { nextNumber, error: err.message || 'Upload failed.' });
  }
});

// View a newsletter in admin
router.get('/newsletters/:id', requireAdmin, (req, res) => {
  const issue = newsletters.findById(req.params.id);
  if (!issue) return res.redirect('/admin/newsletters');
  res.render('admin/view', {
    issue,
    message:    req.query.message || null,
    error:      req.query.error   || null,
    sentCount:  req.query.count   ? parseInt(req.query.count, 10) : null,
    adminEmail: process.env.ADMIN_EMAIL || 'your admin email',
  });
});

// Edit newsletter metadata (subject, preview text, issue number — NOT the HTML)
router.get('/newsletters/:id/edit', requireAdmin, (req, res) => {
  const issue = newsletters.findById(req.params.id);
  if (!issue) return res.redirect('/admin/newsletters');
  res.render('admin/edit', { issue, error: null });
});

router.post('/newsletters/:id/edit', requireAdmin, (req, res) => {
  const issue = newsletters.findById(req.params.id);
  if (!issue) return res.redirect('/admin/newsletters');

  const { subject, preview_text, issue_number } = req.body;
  if (!subject || !subject.trim()) {
    return res.render('admin/edit', { issue, error: 'Subject line is required.' });
  }

  const issueNum = parseInt(issue_number, 10) || issue.issue_number;
  newsletters.update(issue.id, subject.trim(), (preview_text || '').trim() || null, issueNum);
  res.redirect(`/admin/newsletters/${issue.id}?message=updated`);
});

// Delete newsletter
router.post('/newsletters/:id/delete', requireAdmin, (req, res) => {
  newsletters.deleteById(req.params.id);
  res.redirect('/admin/newsletters?message=deleted');
});

// Send test email
router.post('/newsletters/:id/send-test', requireAdmin, async (req, res) => {
  const issue = newsletters.findById(req.params.id);
  if (!issue) return res.redirect('/admin/newsletters');

  try {
    await sendTestEmail(issue.subject, issue.html_content);
    res.redirect(`/admin/newsletters/${issue.id}?message=test_sent`);
  } catch (err) {
    console.error('Test send error:', err);
    res.redirect(`/admin/newsletters/${issue.id}?error=${encodeURIComponent(err.message)}`);
  }
});

// Send to all active subscribers
router.post('/newsletters/:id/send', requireAdmin, async (req, res) => {
  const issue = newsletters.findById(req.params.id);
  if (!issue) return res.redirect('/admin/newsletters');

  if (issue.sent_at) {
    return res.redirect(`/admin/newsletters/${issue.id}?error=already_sent`);
  }

  const activeSubscribers = subscribers.getActive();

  if (activeSubscribers.length === 0) {
    return res.redirect(`/admin/newsletters/${issue.id}?error=no_subscribers`);
  }

  try {
    await sendNewsletterBatch(activeSubscribers, issue.subject, issue.html_content);
    newsletters.markSent(issue.id, activeSubscribers.length);
    res.redirect(`/admin/newsletters/${issue.id}?message=sent&count=${activeSubscribers.length}`);
  } catch (err) {
    console.error('Newsletter send error:', err);
    res.redirect(`/admin/newsletters/${issue.id}?error=${encodeURIComponent(err.message)}`);
  }
});

module.exports = router;
