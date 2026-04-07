const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dbPath = process.env.DATABASE_PATH ||
  path.join(__dirname, '../database/therealscoops.db');

// Ensure directory exists
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);

// Performance tuning
db.exec('PRAGMA foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────

db.exec(`CREATE TABLE IF NOT EXISTS subscribers (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL,
  email                 TEXT UNIQUE NOT NULL COLLATE NOCASE,
  stripe_customer_id    TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  status                TEXT NOT NULL DEFAULT 'pending',
  unsubscribe_token     TEXT UNIQUE NOT NULL,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS magic_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL COLLATE NOCASE,
  token      TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS newsletters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_number    INTEGER NOT NULL,
  subject         TEXT NOT NULL,
  html_content    TEXT NOT NULL,
  preview_text    TEXT,
  published_at    TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at         TEXT,
  recipient_count INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
)`);

db.exec('CREATE INDEX IF NOT EXISTS idx_subscribers_email  ON subscribers(email)');
db.exec('CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status)');
db.exec('CREATE INDEX IF NOT EXISTS idx_magic_links_token  ON magic_links(token)');
db.exec('CREATE INDEX IF NOT EXISTS idx_newsletters_pub    ON newsletters(published_at DESC)');

// ─── Subscriber helpers ───────────────────────────────────────────────────────

const subscribers = {
  create(name, email) {
    const token = crypto.randomBytes(32).toString('hex');
    return db.prepare(`
      INSERT INTO subscribers (name, email, unsubscribe_token)
      VALUES (?, ?, ?)
    `).run(name, email, token);
  },

  findByEmail(email) {
    return db.prepare('SELECT * FROM subscribers WHERE email = ?').get(email);
  },

  findById(id) {
    return db.prepare('SELECT * FROM subscribers WHERE id = ?').get(id);
  },

  findByStripeCustomerId(customerId) {
    return db.prepare('SELECT * FROM subscribers WHERE stripe_customer_id = ?').get(customerId);
  },

  findByStripeSubscriptionId(subId) {
    return db.prepare('SELECT * FROM subscribers WHERE stripe_subscription_id = ?').get(subId);
  },

  findByUnsubscribeToken(token) {
    return db.prepare('SELECT * FROM subscribers WHERE unsubscribe_token = ?').get(token);
  },

  activate(email, stripeCustomerId, stripeSubscriptionId) {
    return db.prepare(`
      UPDATE subscribers
      SET status = 'active',
          stripe_customer_id = ?,
          stripe_subscription_id = ?,
          updated_at = datetime('now')
      WHERE email = ?
    `).run(stripeCustomerId, stripeSubscriptionId, email);
  },

  updateStatus(stripeSubscriptionId, status) {
    return db.prepare(`
      UPDATE subscribers
      SET status = ?, updated_at = datetime('now')
      WHERE stripe_subscription_id = ?
    `).run(status, stripeSubscriptionId);
  },

  updateStatusById(id, status) {
    return db.prepare(`
      UPDATE subscribers
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, id);
  },

  getAll() {
    return db.prepare(`
      SELECT * FROM subscribers ORDER BY created_at DESC
    `).all();
  },

  getActive() {
    return db.prepare(`
      SELECT * FROM subscribers WHERE status = 'active' ORDER BY created_at DESC
    `).all();
  },

  countByStatus(status) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM subscribers WHERE status = ?
    `).get(status).count;
  },

  countRecentSignups(days = 7) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM subscribers
      WHERE status = 'active'
        AND created_at >= datetime('now', '-' || ? || ' days')
    `).get(days).count;
  },

  countChurnedThisMonth() {
    return db.prepare(`
      SELECT COUNT(*) as count FROM subscribers
      WHERE status = 'cancelled'
        AND updated_at >= datetime('now', 'start of month')
    `).get().count;
  },
};

// ─── Magic link helpers ───────────────────────────────────────────────────────

const magicLinks = {
  create(email) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO magic_links (email, token, expires_at) VALUES (?, ?, ?)
    `).run(email, token, expiresAt);
    return token;
  },

  verify(token) {
    const link = db.prepare(`
      SELECT * FROM magic_links
      WHERE token = ? AND used = 0 AND expires_at > datetime('now')
    `).get(token);
    if (link) {
      db.prepare('UPDATE magic_links SET used = 1 WHERE id = ?').run(link.id);
    }
    return link;
  },

  cleanup() {
    db.prepare(`
      DELETE FROM magic_links WHERE expires_at < datetime('now', '-1 hour')
    `).run();
  },
};

// ─── Newsletter helpers ───────────────────────────────────────────────────────

const newsletters = {
  create(issueNumber, subject, htmlContent, previewText) {
    return db.prepare(`
      INSERT INTO newsletters (issue_number, subject, html_content, preview_text)
      VALUES (?, ?, ?, ?)
    `).run(issueNumber, subject, htmlContent, previewText || null);
  },

  findById(id) {
    return db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
  },

  getAll() {
    return db.prepare(`
      SELECT id, issue_number, subject, preview_text, published_at, sent_at, recipient_count
      FROM newsletters ORDER BY published_at DESC
    `).all();
  },

  getRecent(limit = 3) {
    return db.prepare(`
      SELECT id, issue_number, subject, preview_text, published_at, sent_at, recipient_count
      FROM newsletters ORDER BY published_at DESC LIMIT ?
    `).all(limit);
  },

  markSent(id, recipientCount) {
    return db.prepare(`
      UPDATE newsletters
      SET sent_at = datetime('now'), recipient_count = ?
      WHERE id = ?
    `).run(recipientCount, id);
  },

  nextIssueNumber() {
    const row = db.prepare('SELECT MAX(issue_number) as max FROM newsletters').get();
    return (row.max || 0) + 1;
  },
};

module.exports = { db, subscribers, magicLinks, newsletters };
