const { subscribers } = require('../database');

// Require an active subscriber session.
// Attaches req.subscriber if valid.
function requireAuth(req, res, next) {
  const subId = req.session && req.session.subscriberId;
  if (!subId) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }

  const subscriber = subscribers.findById(subId);
  if (!subscriber || subscriber.status !== 'active') {
    req.session.destroy(() => {});
    return res.redirect('/login?reason=inactive');
  }

  req.subscriber = subscriber;
  next();
}

// Like requireAuth but only sets req.subscriber if logged in — doesn't redirect.
// Used on pages that change behaviour based on auth state (e.g. issue preview).
function optionalAuth(req, res, next) {
  const subId = req.session && req.session.subscriberId;
  if (subId) {
    const subscriber = subscribers.findById(subId);
    if (subscriber && subscriber.status === 'active') {
      req.subscriber = subscriber;
    }
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
