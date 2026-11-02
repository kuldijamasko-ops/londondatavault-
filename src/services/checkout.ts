// ── CHECKOUT SERVER FUNCTIONS ─────────────────────────────────────────────
// Thin server-function wrappers over the PayPal Orders REST client in
// src/services/paypal.ts, so the /pricing page can start and finish a
// checkout without ever seeing a credential.
//
// No secret ever crosses this boundary: the browser receives only the PayPal
// order id and the hosted approval URL.
// ───────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { createPayPalOrder, capturePayPalOrder, paypalMode, paypalConfigured } from "./paypal";
import { publicTiers } from "./tiers";

/**
 * Absolute origin of the current request, used for PayPal's return/cancel
 * URLs. Honours x-forwarded-host/proto because the live site sits behind a
 * reverse proxy. PUBLIC_SITE_URL overrides when set (e.g. a fixed canonical
 * domain), and a request Origin header is the last-resort fallback.
 */
function requestOrigin(): string {
  const pinned = process.env.PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (pinned) return pinned;
  try {
    return getRequestUrl({ xForwardedHost: true, xForwardedProto: true }).origin;
  } catch {
    // Outside a request context (shouldn't happen inside a server fn).
    return "http://localhost:3000";
  }
}

export const getTiers = createServerFn({ method: "GET" }).handler(async () => {
  return {
    tiers: publicTiers(),
    paypalMode: paypalMode(),
    paypalConfigured: paypalConfigured(),
  };
});

export const createOrder = createServerFn({ method: "POST" })
  .validator((data: { tierId: string }) => {
    if (!data || typeof data.tierId !== "string") {
      throw new Error("A tierId is required.");
    }
    return { tierId: data.tierId };
  })
  .handler(async ({ data }) => {
    const created = await createPayPalOrder(data.tierId, requestOrigin());
    return {
      orderId: created.orderId,
      approveUrl: created.approveUrl,
      tier: created.tier,
      amount: created.amount,
      currency: created.currency,
    };
  });

export const captureOrder = createServerFn({ method: "POST" })
  .validator((data: { orderId: string }) => {
    if (!data || typeof data.orderId !== "string" || !data.orderId) {
      throw new Error("A PayPal orderId is required.");
    }
    return { orderId: data.orderId };
  })
  .handler(async ({ data }) => {
    return await capturePayPalOrder(data.orderId);
  });
