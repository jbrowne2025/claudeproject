import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getSupabaseClient, ORDERS_TABLE } from './supabaseClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

function load(file) {
  return JSON.parse(readFileSync(path.join(dataDir, file), 'utf-8'));
}

const customers = load('customers.json');
const orders = load('orders.json');
const policies = load('policies.json');

// In-memory mutable store for returns created during a demo session.
// Resets whenever the server restarts - this is a mock, not a real DB.
const returns = [];
let returnSeq = 1;

const RETURN_WINDOW_DAYS = 30;
const HIGH_VALUE_REVIEW_THRESHOLD = 1000;

export function findCustomerByEmail(email) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return customers.find((c) => c.email.toLowerCase() === normalized) || null;
}

export function findOrder(orderId) {
  if (!orderId) return null;
  const normalized = orderId.trim().toUpperCase();
  return orders.find((o) => o.orderId.toUpperCase() === normalized) || null;
}

export function ordersForEmail(email) {
  const customer = findCustomerByEmail(email);
  if (!customer) return [];
  return customer.orderIds.map(findOrder).filter(Boolean);
}

// live order-status lookups, sourced from the customer's real Supabase 'orders'
// table. Deliberately kept separate from the mock findOrder/ordersForEmail
// above: this table only carries order_number/status/amount/date - it has no
// item lines, delivery date, or payment method, so it can't drive the
// returns/refund flow (which still reads the local mock store).
function mapSupabaseOrder(row) {
  return {
    orderId: row.order_number,
    status: (row.order_status || '').toLowerCase(),
    orderDate: row.order_date_time ? String(row.order_date_time).slice(0, 10) : null,
    amount: row.order_amount,
  };
}

export async function fetchSupabaseOrdersForEmail(email) {
  const { data, error } = await getSupabaseClient()
    .from(ORDERS_TABLE)
    .select('*')
    .eq('order_primary_email', email)
    .order('order_date_time', { ascending: false });
  if (error) throw new Error(`Supabase order lookup failed: ${error.message}`);
  return (data || []).map(mapSupabaseOrder);
}

export function daysBetween(dateA, dateB) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((dateB.getTime() - dateA.getTime()) / msPerDay);
}

export function checkReturnEligibility(order) {
  if (!order) return { eligible: false, reason: 'Order not found.' };
  if (order.status !== 'delivered') {
    return {
      eligible: false,
      reason: `Order ${order.orderId} is currently "${order.status}" and hasn't been delivered yet, so it isn't eligible for a return until it arrives.`,
    };
  }
  const delivered = new Date(order.deliveredOn);
  const elapsed = daysBetween(delivered, new Date());
  if (elapsed > RETURN_WINDOW_DAYS) {
    return {
      eligible: false,
      reason: `Order ${order.orderId} was delivered on ${order.deliveredOn}, which is ${elapsed} days ago. That's past our ${RETURN_WINDOW_DAYS}-day return window, so it's no longer eligible for a return.`,
      suggestions: [
        'Resell it on an online marketplace (e.g. eBay, Facebook Marketplace, a used-book site like PangoBooks or ThriftBooks trade-in)',
        'Donate it to a local library, school, or literacy charity - some offer a tax-deduction receipt',
      ],
    };
  }
  return { eligible: true, reason: null, daysRemaining: RETURN_WINDOW_DAYS - elapsed };
}

export function refundRequiresHumanReview(refundAmount) {
  return refundAmount >= HIGH_VALUE_REVIEW_THRESHOLD;
}

export function createReturn({ order, item, reason, refundMethod, requiresReview }) {
  const refundAmount = item.price * item.qty;
  const record = {
    returnId: `RET-${String(returnSeq++).padStart(5, '0')}`,
    orderId: order.orderId,
    itemId: item.itemId,
    itemTitle: item.title,
    reason,
    refundMethod,
    refundToCardLast4: refundMethod === 'original_payment' ? order.paymentMethod?.last4 : null,
    refundAmount,
    createdAt: new Date().toISOString(),
    status: requiresReview
      ? 'pending_human_review'
      : refundMethod === 'store_credit'
        ? 'refunded'
        : 'pending_item_receipt',
  };
  returns.push(record);
  return record;
}

export function searchPolicies(query, topic) {
  const terms = (query || '')
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 3);

  const scored = policies
    .filter((p) => !topic || p.topic === topic)
    .map((p) => {
      const haystack = `${p.title} ${p.text} ${p.topic}`.toLowerCase();
      const score = terms.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
      return { policy: p, score };
    })
    .filter((s) => s.score > 0 || topic)
    .sort((a, b) => b.score - a.score);

  const results = (scored.length ? scored : policies.map((p) => ({ policy: p, score: 0 })))
    .slice(0, 3)
    .map((s) => s.policy);

  return results;
}
