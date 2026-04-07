const express = require('express');
const router = express.Router();
const { constructWebhookEvent } = require('../services/stripe');
const { subscribers } = require('../database');
const { sendWelcomeEmail, sendPaymentFailedEmail } = require('../services/sendgrid');

// POST /webhooks/stripe
// NOTE: raw body is applied in server.js BEFORE json parser for this path
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = constructWebhookEvent(req.body, sig);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {

      // Checkout completed → activate subscriber
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') break;

        const email        = session.customer_email || session.customer_details?.email;
        const customerId   = session.customer;
        const subscriptionId = session.subscription;

        if (email) {
          const sub = subscribers.findByEmail(email);
          if (sub) {
            subscribers.activate(email, customerId, subscriptionId);
            // Reload to get unsubscribe_token
            const updated = subscribers.findByEmail(email);
            await sendWelcomeEmail(email, sub.name, updated.unsubscribe_token)
              .catch(err => console.error('Welcome email failed:', err.message));
          } else {
            console.warn('Checkout completed but no subscriber found for:', email);
          }
        }
        break;
      }

      // Subscription deleted → mark cancelled
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        subscribers.updateStatus(sub.id, 'cancelled');
        break;
      }

      // Subscription updated (e.g. cancel_at_period_end flipped)
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        if (sub.cancel_at_period_end) {
          // Will cancel at end of period — keep active for now
        } else if (sub.status === 'active') {
          subscribers.updateStatus(sub.id, 'active');
        } else if (sub.status === 'canceled' || sub.status === 'unpaid') {
          subscribers.updateStatus(sub.id, 'cancelled');
        }
        break;
      }

      // Payment failed → mark past_due and notify
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const subscriber = subscribers.findByStripeCustomerId(customerId);
        if (subscriber) {
          subscribers.updateStatusById(subscriber.id, 'past_due');
          await sendPaymentFailedEmail(subscriber.email, subscriber.name)
            .catch(err => console.error('Payment failed email error:', err.message));
        }
        break;
      }

      // Payment succeeded → ensure active
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.billing_reason === 'subscription_cycle') {
          const subscriber = subscribers.findByStripeCustomerId(invoice.customer);
          if (subscriber && subscriber.status === 'past_due') {
            subscribers.updateStatusById(subscriber.id, 'active');
          }
        }
        break;
      }

      default:
        // Unhandled event type — that's fine
        break;
    }
  } catch (err) {
    console.error('Error processing webhook event:', err);
    // Still return 200 so Stripe doesn't retry
  }

  res.json({ received: true });
});

module.exports = router;
