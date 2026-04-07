// The Real Scoop — main.js

(function () {
  'use strict';

  // ─── Smooth scroll for anchor links ────────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var href = this.getAttribute('href');
      if (href === '#') return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      var offset = 80;
      var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
    });
  });

  // ─── Subscribe form — validation + loading state ────────────────────────────
  var subscribeForm = document.querySelector('.subscribe-form');
  if (subscribeForm) {
    var nameInput  = subscribeForm.querySelector('input[name="name"]');
    var emailInput = subscribeForm.querySelector('input[name="email"]');
    var submitBtn  = subscribeForm.querySelector('button[type="submit"]');
    var errorBox   = document.getElementById('subscribe-error');

    console.log('[Subscribe] Form found, attaching validation handler');

    subscribeForm.addEventListener('submit', function (e) {
      console.log('[Subscribe] Form submitted');

      // Clear previous errors
      if (errorBox) { errorBox.style.display = 'none'; errorBox.textContent = ''; }
      submitBtn.disabled = false;

      var name  = (nameInput  ? nameInput.value  : '').trim();
      var email = (emailInput ? emailInput.value : '').trim();

      console.log('[Subscribe] name="' + name + '" email="' + email + '"');

      // Client-side validation
      if (!name || name.length < 2) {
        e.preventDefault();
        showSubscribeError('Name is required.');
        console.warn('[Subscribe] Validation failed: name empty');
        if (nameInput) nameInput.focus();
        return;
      }

      var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        e.preventDefault();
        showSubscribeError('Please enter a valid email address.');
        console.warn('[Subscribe] Validation failed: invalid email');
        if (emailInput) emailInput.focus();
        return;
      }

      // Validation passed — show loading state
      console.log('[Subscribe] Validation passed, redirecting to Stripe checkout...');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Redirecting to checkout…';
    });
  }

  function showSubscribeError(msg) {
    var errorBox = document.getElementById('subscribe-error');
    if (errorBox) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ─── Auth form loading state ─────────────────────────────────────────────────
  document.querySelectorAll('.auth-form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type="submit"]');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = 'Please wait…';
    });
  });

  // ─── Alert auto-dismiss ──────────────────────────────────────────────────────
  document.querySelectorAll('.alert:not(#subscribe-error)').forEach(function (alert) {
    setTimeout(function () {
      alert.style.transition = 'opacity 0.4s';
      alert.style.opacity = '0';
      setTimeout(function () { alert.remove(); }, 400);
    }, 6000);
  });

})();
