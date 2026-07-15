import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getSupabaseClient, ORDERS_TABLE } from './supabaseClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');

function load(file) {
  return JSON.parse(readFileSync(path.join(dataDir, file), 'utf-8'));
}

const policies = load('policies.json');

// In-memory mutable store for returns created during a demo session.
// Resets whenever the server restarts - this is a mock, not a real DB.
const returns = [];
let returnSeq = 1;

const RETURN_WINDOW_DAYS = 30;

// Single source of truth for order data: the Supabase `orders` table. Both
// lookup_order and initiate_return read from here - lookup_order narrows the
// result to status-only once a specific order is confirmed (see tools.js),
// while initiate_return uses the full row (items, delivered date, payment)
// that only it needs.
function mapSupabaseOrder(row) {
  return {
    orderId: row.order_number,
    status: (row.order_status || '').toLowerCase(),
    orderDate: row.order_date_time ? String(row.order_date_time).slice(0, 10) : null,
    amount: row.order_amount,
    deliveredOn: row.delivered_on,
    paymentMethod: row.payment_last4 ? { last4: row.payment_last4 } : null,
    items: (row.items || []).map((i) => ({
      itemId: i.item_id,
      title: i.title,
      qty: i.qty,
      price: i.price,
    })),
    customerName: row.customer_name || null,
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

// Every eligible, confirmed return is routed to a human specialist - there is
// no auto-approved instant refund at any amount.
export function createReturn({ order, item, reason, refundMethod }) {
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
    status: 'pending_human_review',
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
