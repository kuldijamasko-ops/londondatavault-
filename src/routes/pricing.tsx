import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TIERS } from "~/services/tiers";
import { createOrder, captureOrder } from "~/services/checkout";

export const Route = createFileRoute("/pricing")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Pricing — LondonRE DataVault" },
      {
        name: "description",
        content:
          "Off-market commercial property intelligence from real UK government data. Starter £199/mo, Pro £499/mo, Enterprise from £1,250/mo.",
      },
    ],
  }),
  component: PricingPage,
});

type CaptureState = "idle" | "processing" | "done" | "failed";

function PricingPage() {
  const search = Route.useSearch();
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [captureResult, setCaptureResult] = useState<string | null>(null);
  // PayPal redirects back with ?token=<orderId>. Capture exactly once, even
  // under React strict-mode double effects.
  const captureStarted = useRef(false);

  useEffect(() => {
    if (search.checkout !== "return" || !search.token) return;
    if (captureStarted.current) return;
    captureStarted.current = true;

    const orderId = search.token;
    setCaptureState("processing");
    captureOrder({ data: { orderId } })
      .then((res) => {
        if (res.status === "COMPLETED") {
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
      })
      .catch((e: unknown) => {
        setCaptureResult(
          e instanceof Error
            ? `Could not confirm the payment: ${e.message}`
            : "Could not confirm the payment with PayPal."
        );
        setCaptureState("failed");
      });
  }, [search.checkout, search.token]);

  async function handleSubscribe(tierId: string) {
    setBusyTier(tierId);
    setError(null);
    try {
      const { approveUrl } = await createOrder({ data: { tierId } });
      if (approveUrl) {
        window.location.href = approveUrl;
      } else {
        setError("PayPal did not return an approval link. Please try again.");
        setBusyTier(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not start checkout. Please try again.");
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
            Off-market property intelligence, priced plainly
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
            Distressed and empty commercial property flagged from real UK government
            business-rates data — before it reaches the commercial listings. No paid data
            subscriptions, no long contract.
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
          <div className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

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
                disabled={busyTier !== null}
                className={`mt-6 w-full rounded-lg py-3 font-medium text-white transition-colors ${
                  tier.featured
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600"
                } ${busyTier !== null ? "cursor-not-allowed opacity-50" : ""}`}
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
