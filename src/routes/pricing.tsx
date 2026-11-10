import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TIERS } from "~/services/tiers";
import { getSampleFlags, type SampleFlag } from "~/services/sampleFlags";

/**
 * The page talks to the /api/paypal/* HTTP routes rather than to
 * createServerFn RPC endpoints. Same server-side service layer behind both,
 * but a plain fetch is easy to exercise with curl and has no build-time RPC
 * wiring to get wrong. No credential ever reaches the browser.
 */
async function createOrder(tierId: string): Promise<{ approveUrl?: string; error?: string }> {
  const res = await fetch("/api/paypal/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tierId }),
  });
  return (await res.json()) as { approveUrl?: string; error?: string };
}

async function captureOrder(orderId: string): Promise<{
  status: string;
  tier: string | null;
  amount: number | null;
  currency: string | null;
  error?: string;
}> {
  const res = await fetch("/api/paypal/capture-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
  return (await res.json()) as {
    status: string;
    tier: string | null;
    amount: number | null;
    currency: string | null;
    error?: string;
  };
}

export const Route = createFileRoute("/pricing")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  // Proof before price: the five sample flags and the live total are read from
  // the database on every request — never hardcoded into the page.
  loader: () => getSampleFlags(),
  head: () => ({
    meta: [
      { title: "Pricing — LondonRE DataVault" },
      {
        name: "description",
        content:
          "Distress signals from published UK council business-rates data — commercial properties recorded as empty or receiving exemption relief, each with address, ratepayer and rateable value. Starter £199/mo, Pro £499/mo, Enterprise from £1,250/mo.",
      },
    ],
  }),
  component: PricingPage,
});

type CaptureState = "idle" | "processing" | "done" | "failed";

function PricingPage() {
  const search = Route.useSearch();
  const { flags, totalFlags, emptyCount, exemptCount } = Route.useLoaderData();
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [captureResult, setCaptureResult] = useState<string | null>(null);
  // The buttons do nothing until React has hydrated — before that a click is
  // swallowed silently, which reads as a dead button. Gate them so a
  // pre-hydration click can never look like a failed checkout.
  const [ready, setReady] = useState(false);
  // PayPal redirects back with ?token=<orderId>. Capture exactly once, even
  // under React strict-mode double effects.
  const captureStarted = useRef(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (search.checkout !== "return" || !search.token) return;
    if (captureStarted.current) return;
    captureStarted.current = true;

    const orderId = search.token;
    setCaptureState("processing");
    void (async () => {
      try {
        const res = await captureOrder(orderId);
        if (res.error) {
          setCaptureResult(`Could not confirm the payment: ${res.error}`);
          setCaptureState("failed");
        } else if (res.status === "COMPLETED") {
          setCaptureResult(
            `Payment received${res.tier ? ` — ${res.tier} access unlocked` : ""}. ` +
              `£${(res.amount ?? 0).toFixed(2)} ${res.currency || "GBP"}. ` +
              `Your PayPal receipt is the authoritative record.`
          );
          setCaptureState("done");
        } else {
          setCaptureResult(`PayPal returned status "${res.status}" — the payment was not completed.`);
          setCaptureState("failed");
        }
      } catch {
        setCaptureResult("Could not confirm the payment with PayPal.");
        setCaptureState("failed");
      }
    })();
  }, [search.checkout, search.token]);

  async function handleSubscribe(tierId: string) {
    if (busyTier) return;
    setBusyTier(tierId);
    setError(null);
    try {
      const { approveUrl, error: apiError } = await createOrder(tierId);
      if (approveUrl) {
        // A plain top-level assignment (not window.open) is what survives
        // popup blockers — the redirect happens in the same tab the user
        // clicked in. If the browser refuses it, say so instead of leaving a
        // button that looks dead.
        window.location.href = approveUrl;
        return;
      }
      setError(
        apiError ||
          "PayPal did not return an approval link, so no order was started. Nothing has been charged — please try again."
      );
      setBusyTier(null);
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : "Network error";
      setError(
        `Could not start checkout (${detail}). Nothing has been charged — please try again, or reply to any email from us and we will send an invoice.`
      );
      setBusyTier(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/staging" className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
            LondonRE DataVault
          </Link>
          <Link
            to="/staging"
            className="text-sm text-gray-600 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
          >
            Open dashboard →
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Distress signals from published council data, priced plainly
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
            We read the business-rates data councils already publish and flag the commercial
            properties recorded as empty, or receiving empty-property or exemption relief — a
            distress signal surfaced from the council&rsquo;s own published record, earlier than a
            commercial listing. No paid data subscriptions, no long contract.
          </p>
        </div>

        {search.checkout === "cancel" && (
          <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Checkout was cancelled. No payment was taken.
          </div>
        )}

        {captureState !== "idle" && (
          <div
            className={`mb-8 rounded-lg border p-4 text-sm ${
              captureState === "processing"
                ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
                : captureState === "done"
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
            role="status"
            aria-live="polite"
          >
            {captureState === "processing" ? "Confirming your payment with PayPal…" : captureResult}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {error}
          </div>
        )}

        <OfferNarrative />

        <SampleFlagsSection
          flags={flags}
          totalFlags={totalFlags}
          emptyCount={emptyCount}
          exemptCount={exemptCount}
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 dark:bg-gray-900 ${
                tier.featured
                  ? "border-indigo-500 shadow-lg ring-1 ring-indigo-500"
                  : "border-gray-200 dark:border-gray-800"
              }`}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">
                  Flagship
                </span>
              )}
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{tier.name}</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{tier.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">
                  {tier.priceLabel}
                </span>
                <span className="text-gray-500 dark:text-gray-400">{tier.intervalLabel}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <span className="mt-0.5 text-indigo-500">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleSubscribe(tier.id)}
                disabled={!ready || busyTier !== null}
                aria-busy={busyTier === tier.id}
                className={`mt-6 w-full rounded-lg py-3 font-medium text-white transition-colors ${
                  tier.featured
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600"
                } ${!ready || busyTier !== null ? "cursor-not-allowed opacity-50" : ""}`}
              >
                {busyTier === tier.id ? "Redirecting to PayPal…" : tier.cta}
              </button>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-3xl space-y-3 text-center text-xs text-gray-500 dark:text-gray-500">
          <p>
            Secure checkout via PayPal. You pay <strong>one month at a time</strong> — this is a
            single PayPal payment per month, <strong>not</strong> an auto-renewing subscription.
            Nothing is charged automatically; we will invoice you when the next month is due.
          </p>
          <p>
            No lock-in. Cancel any time by replying to your PayPal receipt. Payments are processed
            by PayPal and appear in your PayPal account and in ours — this site records the order
            only to unlock your access.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * The offer narrative approved by the owner (marketing-starter-pack.md,
 * section (a)) — 118 words, heading included, reproduced as written. Nothing
 * here goes beyond the pack's honesty rules: two boroughs, no claim that any
 * property is for sale, vacant today or off-market, no urgency device.
 */
function OfferNarrative() {
  return (
    <section className="mb-12 rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        Most commercial property data costs more than the research is worth.
      </h2>
      <div className="mx-auto mt-4 max-w-2xl space-y-4 text-gray-600 dark:text-gray-300">
        <p>
          We built the opposite. We read the business-rates data councils already publish, and
          surface the commercial properties recorded as empty, or receiving empty-property or
          exemption relief.
        </p>
        <p>
          Right now that is <strong className="text-gray-900 dark:text-white">2,000 verified London business-rates records</strong>,
          including <strong className="text-gray-900 dark:text-white">432 distress flags — 328 recorded empty, 104 exempt</strong> —
          from Hounslow and Camden council published data. Every record carries a real address,
          ratepayer and rateable value, and links back to the council dataset it came from. You can
          check any line yourself.
        </p>
        <p>No paid data subscriptions. No long contract. One month at a time, cancel whenever you like.</p>
        <p className="font-semibold text-gray-900 dark:text-white">
          See five real flags free on this page, then pick the tier that fits.
        </p>
      </div>
    </section>
  );
}

/**
 * Proof before price.
 *
 * Every line here is reproduced from the council's published business-rates
 * dataset — a property recorded as empty, or one receiving empty-property /
 * exemption relief. It is NOT a listing, not a claim that the property is
 * abandoned or for sale, and not a claim about the owner. Nor is it live: the
 * council dataset carries its own date, our ingest date is different, and we
 * make no claim about any individual property's status today. The source link
 * carries the provenance; the point of the section is the class of signal.
 *
 * Records come straight from the database query. If it returns fewer than
 * five, we show fewer than five — never a padded row.
 */
function SampleFlagsSection({
  flags,
  totalFlags,
  emptyCount,
  exemptCount,
}: {
  flags: SampleFlag[];
  totalFlags: number;
  emptyCount: number;
  exemptCount: number;
}) {
  return (
    <section className="mb-12">
      <div className="mb-5 text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {flags.length === 5
            ? "Five real flags — free, before you pay"
            : "Real flags — free, before you pay"}
        </h2>
        {totalFlags > 0 ? (
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            <strong className="text-gray-900 dark:text-white">{totalFlags}</strong> distress flags
            in our database right now — {emptyCount} recorded empty and {exemptCount} receiving
            empty-property or exemption relief. Here{" "}
            {flags.length === 1 ? "is the first one" : `are the first ${flags.length}`}, pulled live
            from the database on this page load.
          </p>
        ) : (
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            No flags are loaded in this database yet. We would rather show you an empty section
            than invent a record.
          </p>
        )}
      </div>

      {flags.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {flags.map((flag) => (
            <li
              key={`${flag.address}-${flag.borough}-${flag.status}`}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 text-left dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{flag.address}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                    flag.status === "empty"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                  }`}
                >
                  {flag.status === "empty" ? "Empty" : "Exempt"}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {flag.borough}
              </p>

              <dl className="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                {flag.ratepayer && (
                  <div className="flex gap-1">
                    <dt className="shrink-0 font-medium text-gray-500 dark:text-gray-500">
                      Ratepayer:
                    </dt>
                    <dd className="truncate" title={flag.ratepayer}>
                      {flag.ratepayer}
                    </dd>
                  </div>
                )}
                {flag.propertyType && (
                  <div className="flex gap-1">
                    <dt className="shrink-0 font-medium text-gray-500 dark:text-gray-500">Type:</dt>
                    <dd>{flag.propertyType}</dd>
                  </div>
                )}
                {flag.rateableValue && (
                  <div className="flex gap-1">
                    <dt className="shrink-0 font-medium text-gray-500 dark:text-gray-500">
                      Rateable value:
                    </dt>
                    <dd className="font-semibold text-gray-800 dark:text-gray-200">
                      {flag.rateableValue}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-auto pt-3">
                {flag.sourceUrl ? (
                  <a
                    href={flag.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    {flag.sourceName ? `${flag.sourceName} dataset` : "Source dataset"} ↗
                  </a>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-500">
                    {flag.sourceName ?? "Council business-rates dataset"}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-relaxed text-gray-500 dark:text-gray-500">
        What these records are: exactly what the council's published business-rates dataset says
        about each property — recorded as empty, or receiving empty-property or exemption relief —
        reproduced as published by the council dataset, with the source link on every row. Our
        ingest date is not the council's data date, and we make no claim that any property here is
        vacant today; we have not contacted any owner or occupier. What the section shows is the
        class of signal the paid tiers surface, from a source you can open and check yourself.
      </p>
    </section>
  );
}

