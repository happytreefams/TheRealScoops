const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_ID = process.env.STRIPE_PRICE_ID;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Create a Stripe Checkout session for $9.99/month
async function createCheckoutSession(name, email, subscriberId) {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    success_url: `${BASE_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${BASE_URL}/subscribe/cancel`,
    metadata: { subscriber_name: name, subscriber_id: String(subscriberId) },
    subscription_data: {
      metadata: { subscriber_id: String(subscriberId) },
    },
  });
}

// Cancel a subscription at period end
async function cancelSubscription(stripeSubscriptionId) {
  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

// Reactivate a subscription that was set to cancel
async function reactivateSubscription(stripeSubscriptionId) {
  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: false,
  });
}

// Retrieve a checkout session
async function getCheckoutSession(sessionId) {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer'],
  });
}

// Construct and verify a Stripe webhook event
function constructWebhookEvent(payload, sig) {
  return stripe.webhooks.constructEvent(
    payload,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

module.exports = {
  stripe,
  createCheckoutSession,
  cancelSubscription,
  reactivateSubscription,
  getCheckoutSession,
  constructWebhookEvent,
};
