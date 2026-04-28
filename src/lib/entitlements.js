import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || 'voiduser',
  password: process.env.DB_PASSWORD || 'voidpass',
  database: process.env.DB_NAME || 'voidservices',
});

export const TIERS = {
  FREE: 'free',
  PREMIUM: 'premium',
  PRO: 'pro',
};

export const TIER_PRICES = {
  [TIERS.PREMIUM]: { fiatAmount: '15', fiatCurrency: 'USD', period: 'monthly' },
  [TIERS.PRO]: { fiatAmount: '50', fiatCurrency: 'USD', period: 'lifetime' },
};

const TIER_FEATURES = {
  [TIERS.FREE]: [],
  [TIERS.PREMIUM]: ['selfbot', 'gen', 'boost', 'showcase'],
  [TIERS.PRO]: ['selfbot', 'gen', 'boost', 'showcase'],
};

async function initEntitlementsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_entitlements (
      id SERIAL PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL DEFAULT 'free',
      expires_at TIMESTAMP,
      purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_entitlements_user_id ON user_entitlements(user_id);`);
}

async function initPaymentOrdersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id SERIAL PRIMARY KEY,
      order_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_order_id ON payment_orders(order_id);`);
}

export async function getTier(userId) {
  await initEntitlementsTable();
  const res = await pool.query('SELECT tier, expires_at FROM user_entitlements WHERE user_id = $1', [userId]);
  if (res.rows.length === 0) return TIER_FREE;
  const { tier, expires_at } = res.rows[0];
  if (expires_at && new Date(expires_at) < new Date()) return TIERS.FREE;
  return tier;
}

export async function getEntitlement(userId) {
  await initEntitlementsTable();
  const res = await pool.query('SELECT * FROM user_entitlements WHERE user_id = $1', [userId]);
  return res.rows[0] || null;
}

export async function hasAccess(userId, feature) {
  const tier = await getTier(userId);
  const features = TIER_FEATURES[tier] || [];
  return features.includes(feature);
}

export async function grantAccess(userId, tier, expiresAt = null) {
  await initEntitlementsTable();
  await pool.query(
    `INSERT INTO user_entitlements (user_id, tier, expires_at, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       tier = EXCLUDED.tier,
       expires_at = EXCLUDED.expires_at,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, tier, expiresAt]
  );
}

export async function savePaymentOrder(orderId, userId, tier) {
  await initPaymentOrdersTable();
  await pool.query(
    `INSERT INTO payment_orders (order_id, user_id, tier, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT(order_id) DO UPDATE SET status = 'pending'`,
    [orderId, userId, tier]
  );
}

export async function updatePaymentOrderStatus(orderId, status) {
  await pool.query('UPDATE payment_orders SET status = $1 WHERE order_id = $2', [status, orderId]);
}

export async function getPaymentOrder(orderId) {
  await initPaymentOrdersTable();
  const res = await pool.query('SELECT * FROM payment_orders WHERE order_id = $1', [orderId]);
  return res.rows[0] || null;
}