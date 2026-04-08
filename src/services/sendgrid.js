const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM = {
  email: process.env.SENDGRID_FROM_EMAIL || 'newsletter@therealscoops.com',
  name:  process.env.SENDGRID_FROM_NAME  || 'The Real Scoops',
};
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ─── Magic link email ─────────────────────────────────────────────────────────

async function sendMagicLink(toEmail, token) {
  const link = `${BASE_URL}/auth/verify?token=${token}`;
  await sgMail.send({
    to:      toEmail,
    from:    FROM,
    subject: 'Your login link for The Real Scoops',
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;color:#1a1a1a">
        <div style="margin-bottom:32px">
          <span style="font-size:22px;font-weight:700;color:#1B365D;letter-spacing:-0.5px">The Real Scoops</span>
        </div>
        <h2 style="font-size:24px;font-weight:600;margin:0 0 12px">Your login link</h2>
        <p style="color:#4B5563;margin:0 0 28px;line-height:1.6">
          Click the button below to log in to your subscriber account. This link expires in 15 minutes.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#1B365D;color:#fff;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">
          Log in to The Real Scoops
        </a>
        <p style="margin:28px 0 0;font-size:13px;color:#9CA3AF;line-height:1.6">
          If you didn't request this link, you can safely ignore this email.<br>
          This link will expire in 15 minutes and can only be used once.
        </p>
      </div>
    `,
  });
}

// ─── Welcome email ────────────────────────────────────────────────────────────

async function sendWelcomeEmail(toEmail, name, unsubscribeToken) {
  const unsubLink = `${BASE_URL}/unsubscribe?token=${unsubscribeToken}`;
  await sgMail.send({
    to:      toEmail,
    from:    FROM,
    subject: 'Welcome to The Real Scoops',
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;color:#1a1a1a">
        <div style="margin-bottom:32px">
          <span style="font-size:22px;font-weight:700;color:#1B365D;letter-spacing:-0.5px">The Real Scoops</span>
        </div>
        <h2 style="font-size:26px;font-weight:600;margin:0 0 12px">Welcome, ${name}!</h2>
        <p style="color:#4B5563;margin:0 0 16px;line-height:1.6">
          You're now a subscriber to The Real Scoops — the weekly GTA real estate market brief trusted by agents across the 416 and 905.
        </p>
        <p style="color:#4B5563;margin:0 0 28px;line-height:1.6">
          Every Monday before 9 AM Eastern you'll receive a concise, data-driven snapshot of what's moving in the market — active listings, absorption rates, benchmark prices, and the key trends every serious agent needs to know.
        </p>
        <a href="${BASE_URL}/archive"
           style="display:inline-block;background:#1B365D;color:#fff;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">
          Browse the archive
        </a>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:40px 0 20px">
        <p style="font-size:12px;color:#9CA3AF;line-height:1.6">
          You're receiving this because you subscribed at therealscoops.com.<br>
          <a href="${unsubLink}" style="color:#9CA3AF">Unsubscribe</a>
        </p>
      </div>
    `,
  });
}

// ─── Newsletter send ──────────────────────────────────────────────────────────

async function sendNewsletter(subscriber, subject, htmlContent) {
  const unsubLink = `${BASE_URL}/unsubscribe?token=${subscriber.unsubscribe_token}`;
  const wrappedHtml = wrapNewsletterHtml(htmlContent, unsubLink);

  await sgMail.send({
    to:      subscriber.email,
    from:    FROM,
    subject,
    html:    wrappedHtml,
  });
}

async function sendNewsletterBatch(subscribers, subject, htmlContent) {
  const messages = subscribers.map(sub => {
    const unsubLink = `${BASE_URL}/unsubscribe?token=${sub.unsubscribe_token}`;
    return {
      to:      sub.email,
      from:    FROM,
      subject,
      html:    wrapNewsletterHtml(htmlContent, unsubLink),
    };
  });

  // SendGrid supports up to 1000 messages per batch
  const BATCH_SIZE = 1000;
  const results = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const res = await sgMail.send(batch);
    results.push(res);
  }
  return results;
}

// ─── Test email ───────────────────────────────────────────────────────────────

async function sendTestEmail(subject, htmlContent) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) throw new Error('ADMIN_EMAIL not set in environment');

  const wrapped = wrapNewsletterHtml(htmlContent, `${BASE_URL}/unsubscribe?token=TEST`);
  await sgMail.send({
    to:      adminEmail,
    from:    FROM,
    subject,
    html:    wrapped,
  });
}

// ─── Payment failed email ─────────────────────────────────────────────────────

async function sendPaymentFailedEmail(toEmail, name) {
  await sgMail.send({
    to:      toEmail,
    from:    FROM,
    subject: 'Action needed: Payment failed for The Real Scoops',
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;color:#1a1a1a">
        <div style="margin-bottom:32px">
          <span style="font-size:22px;font-weight:700;color:#1B365D;letter-spacing:-0.5px">The Real Scoops</span>
        </div>
        <h2 style="font-size:24px;font-weight:600;margin:0 0 12px">Payment failed</h2>
        <p style="color:#4B5563;margin:0 0 16px;line-height:1.6">Hi ${name},</p>
        <p style="color:#4B5563;margin:0 0 28px;line-height:1.6">
          We were unable to process your subscription payment. Please update your payment method to continue receiving The Real Scoops.
        </p>
        <a href="${BASE_URL}/account"
           style="display:inline-block;background:#C8973A;color:#fff;text-decoration:none;
                  padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">
          Update payment method
        </a>
        <p style="margin:28px 0 0;font-size:13px;color:#9CA3AF">
          If you have questions, reply to this email.
        </p>
      </div>
    `,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wrapNewsletterHtml(htmlContent, unsubscribeUrl) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:Inter,Arial,sans-serif">
  <div style="max-width:680px;margin:0 auto">
    <!-- Content -->
    <div style="background:#fff">
      ${htmlContent}
    </div>
    <!-- Footer -->
    <div style="padding:24px 32px;text-align:center">
      <p style="font-size:12px;color:#9CA3AF;line-height:1.8;margin:0">
        You're receiving this because you're a subscriber to The Real Scoops.<br>
        <a href="${unsubscribeUrl}" style="color:#9CA3AF;text-decoration:underline">Unsubscribe</a>
        &nbsp;·&nbsp;
        <a href="${process.env.BASE_URL || 'http://localhost:3000'}/account" style="color:#9CA3AF;text-decoration:underline">Manage subscription</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  sendMagicLink,
  sendWelcomeEmail,
  sendNewsletter,
  sendNewsletterBatch,
  sendTestEmail,
  sendPaymentFailedEmail,
};
