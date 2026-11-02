// POST /api/paypal/create-order
//   body: { "tierId": "starter" | "pro" | "enterprise" }
//   200:  { orderId, approveUrl, tier, amount, currency, mode }
//
// Server-side PayPal Orders create. The browser never sees a credential.
// The order is recorded locally as PENDING; see src/services/paypal.ts.
import { createFileRoute } from "@tanstack/react-router";
import { getRequestUrl } from "@tanstack/react-start/server";
import { createPayPalOrder, paypalMode } from "~/services/paypal";

function siteOrigin(request: Request): string {
  const pinned = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (pinned) return pinned;
  try {
    return getRequestUrl({ xForwardedHost: true, xForwardedProto: true }).origin;
  } catch {
    return new URL(request.url).origin;
  }
}

export const Route = createFileRoute("/api/paypal/create-order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let tierId: unknown;
        try {
          const body = (await request.json()) as { tierId?: unknown };
          tierId = body?.tierId;
        } catch {
          return Response.json({ error: "Body must be JSON: {\"tierId\":\"pro\"}." }, { status: 400 });
        }
        if (typeof tierId !== "string" || !tierId) {
          return Response.json({ error: "tierId is required." }, { status: 400 });
        }

        try {
          const created = await createPayPalOrder(tierId, siteOrigin(request));
          return Response.json({
            orderId: created.orderId,
            approveUrl: created.approveUrl,
            tier: created.tier,
            amount: created.amount,
            currency: created.currency,
            mode: paypalMode(),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Checkout could not be started.";
          // 400 for a bad tier, 502 for an upstream PayPal problem.
          const status = message.startsWith("Unknown tier") ? 400 : 502;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
