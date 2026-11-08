// ── FREE SAMPLE FLAGS (pricing page proof) ────────────────────────────────
// Backs the "five real flags — free, before you pay" section on /pricing.
//
// Zero simulated data rule: this reads the live `distressed_properties` table
// and nothing else. There is no fallback list, no padding and no invented
// record — if the query returns nothing (e.g. a fresh deploy with an empty
// database) the caller renders an empty state.
//
// The distress signal is the `status` column ('empty' | 'exempt'). It is NOT
// the word "empty" inside `description` — that returns zero rows.
// ───────────────────────────────────────────────────────────────────────────

import { createServerFn } from "@tanstack/react-start";
import { ensureDb } from "../db/init";

export interface SampleFlag {
  address: string;
  borough: string;
  /** 'empty' or 'exempt' — the council's recorded relief status. */
  status: string;
  /** Parsed out of `description`: the ratepayer the dataset names. */
  ratepayer: string | null;
  /** Parsed out of `description`, e.g. "Shop And Premises". */
  propertyType: string | null;
  /** Parsed out of `description`, already formatted, e.g. "£21,750". */
  rateableValue: string | null;
  /** Council named in the description, e.g. "London Borough of Hounslow". */
  sourceName: string | null;
  /** The real council dataset this record came from. */
  sourceUrl: string | null;
}

export interface SampleFlagsResult {
  flags: SampleFlag[];
  /** Live COUNT of every empty/exempt record — never a typed-in number. */
  totalFlags: number;
  emptyCount: number;
  exemptCount: number;
  /** True when the table exists but holds no flags yet. */
  ok: boolean;
}

// Deterministic, self-updating: liquidation-named ratepayers first, then a
// stable borough/address order, so the same five rows show on every render.
const SAMPLE_QUERY = `
  SELECT property_address, borough, status, description, source_url
  FROM distressed_properties
  WHERE status IN ('empty','exempt')
  ORDER BY (CASE WHEN description LIKE '%Liquidation%' THEN 0 ELSE 1 END),
           borough, property_address
  LIMIT 5
`;

const COUNT_QUERY = `
  SELECT status, COUNT(*) AS c
  FROM distressed_properties
  WHERE status IN ('empty','exempt')
  GROUP BY status
`;

/**
 * `description` is built by the ingest as:
 *   "data.gov.uk Business Rates: <ratepayer>, <property type>, RV £<n>. Source: <council>."
 * Parse defensively: anything that does not match yields nulls rather than a
 * guessed value.
 */
export function parseDescription(raw: string | null | undefined): {
  ratepayer: string | null;
  propertyType: string | null;
  rateableValue: string | null;
  sourceName: string | null;
} {
  if (!raw) return { ratepayer: null, propertyType: null, rateableValue: null, sourceName: null };

  let body = raw.trim();
  let sourceName: string | null = null;

  const sourceMatch = body.match(/Source:\s*(.+?)\.?$/i);
  if (sourceMatch) {
    sourceName = sourceMatch[1].trim();
    body = body.slice(0, sourceMatch.index).trim();
  }
  body = body.replace(/^data\.gov\.uk Business Rates:\s*/i, "").replace(/\.$/, "").trim();

  const parts = body.split(",").map((p) => p.trim()).filter(Boolean);
  let rateableValue: string | null = null;
  const rvIdx = parts.findIndex((p) => /^RV\b/i.test(p));
  if (rvIdx !== -1) {
    const digits = parts[rvIdx].replace(/[^0-9]/g, "");
    if (digits) rateableValue = `£${Number(digits).toLocaleString("en-GB")}`;
    parts.splice(rvIdx, 1);
  }

  const propertyType = parts.length > 1 ? parts.pop() ?? null : null;
  const ratepayer = parts.length ? parts.join(", ") : null;

  return { ratepayer, propertyType, rateableValue, sourceName };
}

export const getSampleFlags = createServerFn({ method: "GET" }).handler(
  async (): Promise<SampleFlagsResult> => {
    const empty: SampleFlagsResult = {
      flags: [],
      totalFlags: 0,
      emptyCount: 0,
      exemptCount: 0,
      ok: false,
    };

    try {
      const db = ensureDb();
      const rows = db.query(SAMPLE_QUERY).all() as {
        property_address: string;
        borough: string;
        status: string;
        description: string | null;
        source_url: string | null;
      }[];

      const counts = db.query(COUNT_QUERY).all() as { status: string; c: number }[];
      const emptyCount = counts.find((r) => r.status === "empty")?.c ?? 0;
      const exemptCount = counts.find((r) => r.status === "exempt")?.c ?? 0;

      const flags: SampleFlag[] = rows.map((r) => ({
        address: r.property_address,
        borough: r.borough,
        status: r.status,
        sourceUrl: r.source_url,
        ...parseDescription(r.description),
      }));

      return { flags, totalFlags: emptyCount + exemptCount, emptyCount, exemptCount, ok: true };
    } catch (err) {
      // Never fabricate a record to fill the gap. An unreachable/empty database
      // renders an empty state on the page.
      console.error("getSampleFlags failed:", err);
      return empty;
    }
  }
);
