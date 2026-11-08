// ── PAYPAL ORDERS REST API (in-app checkout) ──────────────────────────────
// Billing decision 2026-08-29: PayPal Client ID + Secret live in Secrets and
// are read from process.env at runtime. They are NEVER hardcoded, never
// logged, never returned to the browser, and never included in an error
// message. If you are editing this file, keep it that way.
//
// Flow (PayPal Orders v2, intent=CAPTURE):
//   1. POST /api/paypal/create-order  → create an order, record it in our DB
//      with status=PENDING, return the PayPal approve URL.
//   2. Buyer approves on paypal.com and is sent back to
//      /pricing?checkout=return&token=<paypal_order_id>
//   3. POST /api/paypal/capture-order → capture the approved order, mark the
//      DB row status=CAPTURED. CAPTURED is the unlock signal for tier access.
//
// HONEST LIMITATION — this is a ONE-OFF PAYMENT PER MONTH, not a recurring
// PayPal Subscription. The Orders API captures a single payment; nothing
// auto-renews and nothing auto-charges the buyer next month. A true recurring
// subscription needs the PayPal Subscriptions API (billing plans), which is
// not implemented here.
//
// HONEST LIMITATION 2 — the platform's finance tooling reads Stripe only.
// The authoritative money view is the owner's PayPal dashboard. This DB is
// for unlock logic, not accounting.
// ───────────────────────────────────────────────────────────────────────────

import { ensureDb } from "../db/init";
import { getTier } from "./tiers";

/** PayPal REST host. PAYPAL_MODE=live → production; anything else → sandbox. */
export function paypalBaseUrl(): string {
  const mode = (process.env.PAYPAL_MODE || "sandbox").trim().toLowerCase();
  return mode === "live" || mode === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function paypalMode(): "sandbox" | "live" {
  return paypalBaseUrl() === "https://api-m.paypal.com" ? "live" : "sandbox";
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
}

/**
 * OAuth2 client-credentials token. Throws a message that names the HTTP status
 * and PayPal's error code only — never the credentials or the auth header.
 */
async function paypalToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) {
    throw new Error(
      "PayPal is not configured: PAYPAL_CLIENT_ID and PAYPAL_SECRET must be set in the environment."
    );
  }

  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const code = await paypalErrorCode(res);
    // invalid_client almost always means the credentials belong to the other
    // PayPal environment than PAYPAL_MODE points at. Say so — it is the single
    // most common misconfiguration and it costs an hour to diagnose cold.
    const hint =
      code === "invalid_client"
        ? ` PayPal rejected these credentials for the ${paypalMode()} environment — if they are ${paypalMode() === "live" ? "sandbox" : "live"} credentials, set PAYPAL_MODE=${paypalMode() === "live" ? "sandbox" : "live"}.`
        : "";
    throw new Error(`PayPal auth failed (HTTP ${res.status} ${code}).${hint}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("PayPal auth returned no access token.");
  return json.access_token;
}

/** Pull PayPal's machine-readable error code out of a failed response body. */
async function paypalErrorCode(res: Response): Promise<string> {
  try {
    const text = await res.text();
    const json = JSON.parse(text) as {
      name?: string;
      error?: string;
      message?: string;
      details?: Array<{ issue?: string; description?: string }>;
    };
    // PayPal puts the useful, actionable code in details[].issue — e.g.
    // ORDER_NOT_APPROVED when a capture is attempted before the buyer pays.
    const issue = json.details?.[0]?.issue;
    const base = json.name || json.error || json.message || "no error code";
    return issue ? `${base} ${issue}` : base;
  } catch {
    return "unparseable error body";
  }
}

export interface CreatedOrder {
  /** PayPal order id, e.g. "5O190127TN364715T" (17 alphanumeric chars). */
  orderId: string;
  /** Hosted PayPal approval URL the buyer must be sent to. */
  approveUrl: string;
  /** Our own DB row id. */
  localOrderId: string;
  tier: string;
  amount: number;
  currency: "GBP";
  mode: "sandbox" | "live";
}

/**
 * Create a PayPal order for a tier and record it locally as PENDING.
 * @param tierId one of the ids in services/tiers.ts
 * @param origin absolute site origin used for the PayPal return/cancel URLs,
 *               e.g. "https://example.cto.site" (no trailing slash).
 */
export async function createPayPalOrder(tierId: string, origin: string): Promise<CreatedOrder> {
  const tier = getTier(tierId);
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);

  const token = await paypalToken();
  const base = paypalBaseUrl();

  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: `tier-${tier.id}`,
        description: `LondonRE DataVault — ${tier.name} (1 month)`,
        custom_id: tier.id,
        amount: {
          currency_code: "GBP",
          value: tier.price.toFixed(2),
        },
      },
    ],
    application_context: {
      brand_name: "LondonRE DataVault",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
      return_url: `${origin}/pricing?checkout=return`,
      cancel_url: `${origin}/pricing?checkout=cancel`,
    },
  };

  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`PayPal create-order failed (HTTP ${res.status} ${await paypalErrorCode(res)}).`);
  }

  const json = (await res.json()) as {
    id?: string;
    links?: Array<{ rel: string; href: string }>;
  };
  const orderId = json.id;
  const approveUrl = (json.links || []).find((l) => l.rel === "approve")?.href;
  if (!orderId || !approveUrl) {
    throw new Error("PayPal create-order returned no order id or no approval link.");
  }

  // Record for unlock logic. The authoritative money view is PayPal itself.
  const localOrderId = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = ensureDb();
  db.run(
    `INSERT INTO orders (id, tier, amount_gbp, currency, status, paypal_order_id, paypal_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [localOrderId, tier.id, tier.price, "GBP", "PENDING", orderId, paypalMode(), now, now]
  );

  return {
    orderId,
    approveUrl,
    localOrderId,
    tier: tier.id,
    amount: tier.price,
    currency: "GBP",
    mode: paypalMode(),
  };
}

export interface CapturedOrder {
  /** PayPal order status — "COMPLETED" on a successful capture. */
  status: string;
  /** Our tier id, if we had a local row for this PayPal order. */
  tier: string | null;
  /** PayPal capture id (e.g. "3C679366HH908993F") when the capture succeeded. */
  captureId: string | null;
  amount: number | null;
  currency: string | null;
  localOrderId: string | null;
}

/**
 * Capture a buyer-approved order and flip the local row to CAPTURED.
 * Throws if PayPal refuses the capture (e.g. the buyer never approved it —
 * PayPal answers 422 ORDER_NOT_APPROVED in that case).
 */
export async function capturePayPalOrder(paypalOrderId: string): Promise<CapturedOrder> {
  const token = await paypalToken();
  const base = paypalBaseUrl();

  const res = await fetch(
    `${base}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`PayPal capture failed (HTTP ${res.status} ${await paypalErrorCode(res)}).`);
  }

  const json = (await res.json()) as {
    status?: string;
    purchase_units?: Array<{
      payments?: {
        captures?: Array<{
          id?: string;
          status?: string;
          amount?: { value?: string; currency_code?: string };
        }>;
      };
    }>;
  };

  const status = json.status || "UNKNOWN";
  const capture = json.purchase_units?.[0]?.payments?.captures?.[0];
  const captureId = capture?.id ?? null;
  const amount = capture?.amount?.value ? Number(capture.amount.value) : null;
  const currency = capture?.amount?.currency_code ?? null;

  const db = ensureDb();
  const row = db
    .query("SELECT id, tier FROM orders WHERE paypal_order_id = ?")
    .get(paypalOrderId) as { id: string; tier: string } | null;

  const now = new Date().toISOString();
  if (row) {
    db.run(
      `UPDATE orders
          SET status = ?, paypal_capture_id = ?, captured_amount_gbp = ?, updated_at = ?
        WHERE paypal_order_id = ?`,
      [status, captureId, amount, now, paypalOrderId]
    );
  } else {
    // Buyer approved an order we have no record of (e.g. DB was reset between
    // create and capture). Record the truth rather than silently dropping it.
    db.run(
      `INSERT INTO orders (id, tier, amount_gbp, currency, status, paypal_order_id, paypal_capture_id, captured_amount_gbp, paypal_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        null,
        amount,
        currency || "GBP",
        status,
        paypalOrderId,
        captureId,
        amount,
        paypalMode(),
        now,
        now,
      ]
    );
  }

  return {
    status,
    tier: row?.tier ?? null,
    captureId,
    amount,
    currency,
    localOrderId: row?.id ?? null,
  };
}

export interface OrderRow {
  id: string;
  tier: string | null;
  amount_gbp: number | null;
  currency: string | null;
  status: string;
  paypal_order_id: string;
  paypal_capture_id: string | null;
  captured_amount_gbp: number | null;
  paypal_mode: string | null;
  created_at: string;
  updated_at: string | null;
}

/** Local order log, newest first. Used by the unlock logic and the ops view. */
export function listOrders(limit = 50): OrderRow[] {
  const db = ensureDb();
  return db
    .query("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?")
    .all(limit) as OrderRow[];
}

/** Tiers this installation has actually been paid for (status=CAPTURED). */
export function capturedTiers(): string[] {
  const db = ensureDb();
  const rows = db
    .query("SELECT DISTINCT tier FROM orders WHERE status = 'CAPTURED' AND tier IS NOT NULL")
    .all() as Array<{ tier: string }>;
  return rows.map((r) => r.tier);
}
