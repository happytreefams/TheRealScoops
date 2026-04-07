function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  req.session.adminReturnTo = req.originalUrl;
  res.redirect('/admin/login');
}

module.exports = { requireAdmin };
