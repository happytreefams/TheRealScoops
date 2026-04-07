// The Real Scoop — main.js
// Lightweight vanilla JS. No frameworks.

(function () {
  'use strict';

  // ─── Smooth scroll for anchor links ────────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      var offset = 80; // nav height
      var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });

  // ─── Subscribe form loading state ──────────────────────────────────────────
  var subscribeForms = document.querySelectorAll('.subscribe-form, .auth-form');
  subscribeForms.forEach(function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type="submit"]');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = 'Please wait…';
    });
  });

  // ─── Alert auto-dismiss ─────────────────────────────────────────────────────
  document.querySelectorAll('.alert').forEach(function (alert) {
    setTimeout(function () {
      alert.style.transition = 'opacity 0.4s';
      alert.style.opacity = '0';
      setTimeout(function () { alert.remove(); }, 400);
    }, 6000);
  });

  // ─── Admin: issue send confirmation ────────────────────────────────────────
  // Already handled inline with onsubmit confirm() in the view

})();
