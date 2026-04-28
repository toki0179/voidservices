import crypto from 'node:crypto';
import fetch from 'node-fetch';
import { config } from '../config.js';
import { savePaymentOrder, getPaymentOrder, updatePaymentOrderStatus, TIER_PRICES, TIER_FEATURES, TIERS, hasAccess, grantAccess } from './entitlements.js';

const API_BASE = 'https://api.paymento.io/v1';

export async function createPayment(userId, tier, returnUrl) {
  const price = TIER_PRICES[tier];
  if (!price) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  const orderId = `void_${userId}_${Date.now()}`;
  const body = {
    fiatAmount: price.fiatAmount,
    fiatCurrency: price.fiatCurrency,
    returnUrl: returnUrl || `${returnUrl}?orderId=${orderId}&status=complete`,
    orderId,
    riskSpeed: 0,
  };

  const response = await fetch(`${API_BASE}/payment/request`, {
    method: 'POST',
    headers: {
      'Api-Key': config.paymentoApiKey,
      'Content-Type': 'application/json',
      'Accept': 'text/plain',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error('[paymento] Create payment failed:', text);
    throw new Error(`Payment creation failed: ${text}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { token: text.trim() };
  }

  await savePaymentOrder(orderId, userId, tier);

  return {
    orderId: data.orderId || orderId,
    token: data.token,
    paymentUrl: `https://app.paymento.io/gateway?token=${data.token}`,
  };
}

export async function verifyPayment(token) {
  const response = await fetch(`${API_BASE}/payment/verify`, {
    method: 'POST',
    headers: {
      'Api-Key': config.paymentoApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[paymento] Verify payment failed:', text);
    throw new Error(`Payment verification failed: ${text}`);
  }

  const data = await response.json();
  return data;
}

export function verifyHmac(rawBody, signature) {
  const expected = crypto
    .createHmac('sha256', config.paymentoSecret)
    .update(rawBody, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function processCallback(orderId, status) {
  const order = await getPaymentOrder(orderId);
  if (!order) {
    console.error('[paymento] Unknown order:', orderId);
    return false;
  }

  if (status === 'Paid' || status === 'Approve') {
    const tierPrice = TIER_PRICES[order.tier];
    let expiresAt = null;
    
    if (tierPrice?.period === 'monthly') {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      expiresAt = nextMonth;
    }
    
    await grantAccess(order.user_id, order.tier, expiresAt);
    await updatePaymentOrderStatus(orderId, 'completed');
    console.log(`[paymento] Granted ${order.tier} to user ${order.user_id}${expiresAt ? ` until ${expiresAt.toISOString()}` : ' (lifetime)'}`);
    return true;
  }

  if (status === 'Reject') {
    await updatePaymentOrderStatus(orderId, 'rejected');
    return true;
  }

  return false;
}