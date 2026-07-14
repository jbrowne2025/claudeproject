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
      'Start a return/refund for a specific item on a specific order. Only call this after the customer has confirmed the order ID, which item they want to return, and their reason. This tool enforces Bookly return policy in code: (1) the order must be delivered and within the 30-day return window - returns eligible:false with a reason otherwise, and no exceptions are made; when the window has passed, the response includes a suggestions list (e.g. reselling or donating the item) to offer the customer instead; (2) if refund_method is original_payment, the customer must have confirmed the last 4 digits of the card on file (see cardLast4Masked from lookup_order) - pass them as payment_confirmation_last4, or the tool returns confirmationRequired:true instead of processing; (3) refunds of $1000 or more are never auto-approved - the tool returns requiresReview:true and creates a pending case for a human specialist instead of an instant refund, even when eligible and confirmed.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: "Customer's account email address, used to verify order ownership." },
        order_id: { type: 'string', description: 'Order ID the item belongs to.' },
        item_id: { type: 'string', description: 'ID of the item within the order to return.' },
        reason: { type: 'string', description: "Customer's stated reason for the return." },
        refund_method: {
          type: 'string',
          enum: ['original_payment', 'store_credit'],
          description: 'How the customer wants to be refunded.',
        },
        payment_confirmation_last4: {
          type: 'string',
          description:
            'Required only when refund_method is original_payment. The last 4 digits of the card the customer explicitly confirmed the refund should return to, read back from the cardLast4Masked field on the order. Omit for store_credit.',
        },
      },
      required: ['email', 'order_id', 'item_id', 'reason', 'refund_method'],
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
      const item = order.items.find((i) => i.itemId === input.item_id);
      if (!item) {
        return { error: `Item ${input.item_id} was not found on order ${input.order_id}.` };
      }
      const eligibility = checkReturnEligibility(order);
      if (!eligibility.eligible) {
        return { eligible: false, reason: eligibility.reason, suggestions: eligibility.suggestions };
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
