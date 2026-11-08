// POST /api/paypal/capture-order
//   body: { "orderId": "<paypal order id returned by create-order>" }
//   200:  { status, tier, captureId, amount, currency }
//
// Captures a buyer-approved order and flips the local row to CAPTURED. PayPal
// rejects the capture with 422 ORDER_NOT_APPROVED until a human has actually
// approved the payment on paypal.com — that is expected and is reported as an
// error, never as a fake success.
import { createFileRoute } from "@tanstack/react-router";
import { capturePayPalOrder } from "~/services/paypal";

export const Route = createFileRoute("/api/paypal/capture-order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let orderId: unknown;
        try {
          const body = (await request.json()) as { orderId?: unknown };
          orderId = body?.orderId;
        } catch {
          return Response.json({ error: "Body must be JSON: {\"orderId\":\"...\"}." }, { status: 400 });
        }
        if (typeof orderId !== "string" || !orderId) {
          return Response.json({ error: "orderId is required." }, { status: 400 });
        }

        try {
          const captured = await capturePayPalOrder(orderId);
          return Response.json(captured);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Capture failed.";
          return Response.json({ error: message }, { status: 502 });
        }
      },
    },
  },
});
