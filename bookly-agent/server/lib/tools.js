import {
  checkReturnEligibility,
  refundRequiresHumanReview,
  createReturn,
  searchPolicies,
  fetchSupabaseOrdersForEmail,
} from './store.js';

// Tool schemas passed to the Anthropic Messages API. Keeping these tight and
// single-purpose (rather than one big "do_anything" tool) is what lets the
// model reliably pick the right one and lets us enforce business rules
// (identity check, return window) in code instead of trusting the prompt.
export const toolDefinitions = [
  {
    name: 'lookup_order',
    description:
      "Look up a customer's order(s) by account email against Bookly's live orders database, optionally narrowed to a single order number. Always confirm the customer's email before calling this - it acts as the identity check. The tool verifies the email has orders on file first, then (if given) checks the order number against that email's orders - order status is never shared until both checks pass. If order_id is omitted, returns all orders on the account (order number, status, order date, amount) so the customer can identify which one they mean. Once a specific order_id is confirmed (both email and order number validated), the tool returns status only - no amount, order date, tracking number, or carrier - so never state those for a confirmed single order even if you saw them earlier in the list.",
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "Customer's account email address." },
        order_id: { type: 'string', description: 'Specific order number, e.g. "BK-1002". Omit to list all orders on the account.' },
      },
      required: ['email'],
    },
  },
  {
    name: 'initiate_return',
    description:
      'Check return eligibility and, once confirmed eligible, process a return/refund. Call this in two phases: (1) as soon as the customer names the order, call it with just email and order_id to check eligibility - do NOT ask which item, the reason, or the refund method yet. The order must be delivered and within the 30-day return window - if not, this call returns eligible:false with a reason and no exceptions are made; the response also includes a suggestions list (e.g. reselling or donating the item) to offer the customer instead of asking for any return details. (2) Only once this first call returns eligible:true, ask the customer which item, their reason, and their refund method, then call initiate_return again with item_id/reason/refund_method included to actually process it. On this second call: if refund_method is original_payment, the customer must have confirmed the last 4 digits of the card on file (see cardLast4Masked from lookup_order) - pass them as payment_confirmation_last4, or the tool returns confirmationRequired:true instead of processing; refunds of $1000 or more are never auto-approved - the tool returns requiresReview:true and creates a pending case for a human specialist instead of an instant refund, even when eligible and confirmed.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "Customer's account email address, used to verify order ownership." },
        order_id: { type: 'string', description: 'Order ID the item belongs to.' },
        item_id: { type: 'string', description: 'Omit for the initial eligibility check. Once eligible, the item to return - its internal item ID if known (e.g. "ITM-1"), or otherwise the customer\'s own description of the item (e.g. "the Hobbit"); the tool matches on either.' },
        reason: { type: 'string', description: "Omit for the initial eligibility check. Once eligible, the customer's stated reason for the return." },
        refund_method: {
          type: 'string',
          enum: ['original_payment', 'store_credit'],
          description: 'Omit for the initial eligibility check. Once eligible, how the customer wants to be refunded.',
        },
        payment_confirmation_last4: {
          type: 'string',
          description:
            'Required only when refund_method is original_payment. The last 4 digits of the card the customer explicitly confirmed the refund should return to, read back from the cardLast4Masked field on the order. Omit for store_credit.',
        },
      },
      required: ['email', 'order_id'],
    },
  },
  {
    name: 'search_policies',
    description:
      'Search Bookly policy documentation for answers to general questions about shipping, returns, payments, account/password reset, and order cancellation. Use this instead of answering policy questions from memory.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "The customer's question or the key terms to search for." },
        topic: {
          type: 'string',
          enum: ['shipping', 'returns', 'account', 'payments', 'orders'],
          description: 'Optional topic filter if the category is obvious.',
        },
      },
      required: ['query'],
    },
  },
];

export async function executeTool(name, input) {
  switch (name) {
    case 'lookup_order': {
      try {
        // Step 1: verify identity - the email must have orders on file before
        // any order number is checked or any status is shared.
        const orders = await fetchSupabaseOrdersForEmail(input.email);
        if (orders.length === 0) {
          return { error: `No orders found for ${input.email}. Double-check the email on the account.` };
        }

        // Step 2: only now resolve a specific order number, scoped to that
        // email's own orders - a mismatched order number never confirms
        // whether it exists on someone else's account.
        if (input.order_id) {
          const normalized = input.order_id.trim().toLowerCase();
          const order = orders.find((o) => o.orderId.toLowerCase() === normalized);
          if (!order) {
            return { error: `Order ${input.order_id} was not found on the account for ${input.email}.` };
          }
          // Once both email and order number are confirmed, only status is
          // shared - amount and order date are withheld even from the
          // verified account holder.
          return { order: { orderId: order.orderId, status: order.status } };
        }

        return { orders };
      } catch (err) {
        return { error: err.message };
      }
    }

    case 'initiate_return': {
      let orders;
      try {
        orders = await fetchSupabaseOrdersForEmail(input.email);
      } catch (err) {
        return { error: err.message };
      }
      if (orders.length === 0) {
        return { error: `No Bookly account found for ${input.email}.` };
      }
      const normalizedOrderId = input.order_id.trim().toLowerCase();
      const order = orders.find((o) => o.orderId.toLowerCase() === normalizedOrderId);
      if (!order) {
        return { error: `Order ${input.order_id} was not found on the account for ${input.email}.` };
      }

      // Check the order-level return window before resolving the item - a
      // customer describing the item by name/typo shouldn't get a confusing
      // "item not found" error when the real answer is "outside the window"
      // regardless of which item they mean.
      const eligibility = checkReturnEligibility(order);
      if (!eligibility.eligible) {
        return { eligible: false, reason: eligibility.reason, suggestions: eligibility.suggestions };
      }

      // Phase 1 (eligibility-only check): item_id/reason/refund_method are
      // omitted until the order is confirmed eligible. Stop here and tell the
      // model to now collect those details, rather than asking for them
      // before eligibility was known.
      if (!input.item_id || !input.reason || !input.refund_method) {
        return {
          eligible: true,
          needsDetails: true,
          message: 'This order is eligible for a return. Now ask the customer which item, their reason, and their refund method (original payment or store credit), then call initiate_return again with those included.',
        };
      }

      // Match by item ID first, falling back to a title match - the model
      // often only has the customer's spoken description ("the Hobbit"), not
      // the internal item ID, to pass through here.
      const normalizedItemInput = input.item_id.trim().toLowerCase();
      const item =
        order.items.find((i) => i.itemId.toLowerCase() === normalizedItemInput) ||
        order.items.find((i) => i.title.toLowerCase().includes(normalizedItemInput));
      if (!item) {
        return { error: `Item "${input.item_id}" was not found on order ${input.order_id}. Items on this order: ${order.items.map((i) => `${i.title} (${i.itemId})`).join(', ') || 'none'}.` };
      }

      if (input.refund_method === 'original_payment') {
        const cardLast4 = order.paymentMethod?.last4;
        if (!cardLast4 || input.payment_confirmation_last4 !== cardLast4) {
          return {
            eligible: true,
            confirmationRequired: true,
            cardLast4Masked: cardLast4 ? `•••• ${cardLast4}` : null,
            message: cardLast4
              ? `Before processing, tell the customer the refund will go to the card ending in ${cardLast4} and get their explicit confirmation. Then call initiate_return again with payment_confirmation_last4 set to "${cardLast4}".`
              : `No card on file for this order - ask the customer to choose store_credit instead.`,
          };
        }
      }

      const refundAmount = item.price * item.qty;
      const requiresReview = refundRequiresHumanReview(refundAmount);
      const record = createReturn({
        order,
        item,
        reason: input.reason,
        refundMethod: input.refund_method,
        requiresReview,
      });
      return { eligible: true, requiresReview, return: record };
    }

    case 'search_policies': {
      const results = searchPolicies(input.query, input.topic);
      return { results: results.map((r) => ({ title: r.title, text: r.text })) };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
