import crypto from 'node:crypto';
import fetch from 'node-fetch';
import { config } from '../config.js';
import { savePaymentOrder, getPaymentOrder, updatePaymentOrderStatus, TIER_PRICES, TIERS, hasAccess, grantAccess } from './entitlements.js';

const API_BASE = 'https://api.paymento.io/v1';

export async function createPayment(userId, tier, returnUrl) {
  if (!config.paymentoApiKey) {
    throw new Error('Paymento API key not configured');
  }

  const price = TIER_PRICES[tier];
  if (!price) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  const orderId = `void_${userId}_${Date.now()}`;
  const body = {
    fiatAmount: price.fiatAmount,
    fiatCurrency: price.fiatCurrency,
    orderId,
    riskSpeed: 0,
  };

  if (returnUrl) {
    body.returnUrl = returnUrl;
  }

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

  let token = text.trim();
  let parsedOrderId = orderId;
  
  try {
    const data = JSON.parse(text);
    // Paymento returns token in body field: {"body":"TOKEN","success":true,...}
    token = data.body || data.token || token;
    parsedOrderId = data.orderId || parsedOrderId;
  } catch {
    // text is the token itself
  }

  if (!token) {
    console.error('[paymento] No token in response:', text);
    throw new Error('Paymento did not return a token');
  }

  await savePaymentOrder(parsedOrderId, userId, tier);

  return {
    orderId: parsedOrderId,
    token,
    paymentUrl: `https://app.paymento.io/gateway?token=${token}`,
  };
}

export async function verifyPayment(token) {
  if (!config.paymentoApiKey) {
    throw new Error('Paymento API key not configured');
  }

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
  if (!config.paymentoSecret || !signature) {
    return false;
  }

  try {
    const expected = crypto
      .createHmac('sha256', config.paymentoSecret)
      .update(rawBody, 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
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