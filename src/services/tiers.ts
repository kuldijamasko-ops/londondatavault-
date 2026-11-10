// ── SUBSCRIPTION TIERS ─────────────────────────────────────────────────────
// Final tier prices RATIFIED BY THE OWNER on 2026-08-29. This file is the
// single source of truth for both the offer page (client) and the PayPal
// checkout (server), so price and tier id can never drift between the two.
//
// Changing a price here changes what PayPal is asked to charge. Do not edit
// without an owner decision.
// ───────────────────────────────────────────────────────────────────────────

export interface Tier {
  id: string;
  name: string;
  tagline: string;
  /** GBP charged per payment. */
  price: number;
  /** Display label, e.g. "£199" or "From £1,250". */
  priceLabel: string;
  /** Display suffix, e.g. "/mo". */
  intervalLabel: string;
  features: string[];
  cta: string;
  /** The flagship tier, highlighted on the offer page. */
  featured?: boolean;
}

export const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Distressed-property flags for one London borough",
    price: 199,
    priceLabel: "£199",
    intervalLabel: "/mo",
    features: [
      "Government-sourced distress flags from published council business-rates data, for one borough",
      "Planning intelligence for that borough",
      "Real address, ratepayer & rateable value on every record",
    ],
    cta: "Start with Starter",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "All London boroughs plus qualified international buyer leads",
    price: 499,
    priceLabel: "£499",
    intervalLabel: "/mo",
    featured: true,
    features: [
      "All London boroughs",
      "Everything in Starter",
      "International buyer lead access",
      "Borough filtering & saved searches",
      "Weekly distress-signal digest",
    ],
    cta: "Go Pro",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "White-label data feed, API access & a dedicated watch report",
    price: 1250,
    priceLabel: "From £1,250",
    intervalLabel: "/mo",
    features: [
      "White-label data feed",
      "Custom borough filtering",
      "API access",
      "Dedicated distress-signal watch report",
    ],
    cta: "Get Enterprise",
  },
];

export function getTier(id: string): Tier | undefined {
  return TIERS.find((t) => t.id === id);
}

/** Public, non-sensitive shape of a tier — safe to send to the browser. */
export type PublicTier = Omit<Tier, never>;

export function publicTiers(): Tier[] {
  return TIERS.map((t) => ({ ...t }));
}
