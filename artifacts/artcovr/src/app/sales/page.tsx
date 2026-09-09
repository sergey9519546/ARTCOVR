"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "@/components/compat/Link";
import { PublicPage } from "@/components/artcovr/PublicPage";
import {
  ArtcovrApiError,
  getOwnerSalesReport,
  type OwnerSalesReport,
} from "@/lib/artcovr/functions";
type ReportState = "loading" | "ready" | "denied" | "error";

const numberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function initialRange() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: inputDate(from), to: inputDate(to) };
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatMoney(cents: number) {
  return currencyFormatter.format(cents / 100);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatCompact(value: number) {
  return compactNumberFormatter.format(value);
}

function ratio(value: number) {
  const normalized = value > 1 ? value / 100 : value;
  return Math.min(1, Math.max(0, Number.isFinite(normalized) ? normalized : 0));
}

function formatPercent(value: number) {
  return `${(ratio(value) * 100).toFixed(1)}%`;
}

function reportIsEmpty(report: OwnerSalesReport) {
  const { summary, credits, funnel, topArtworks } = report;
  return (
    topArtworks.length === 0 &&
    summary.paidOrders === 0 &&
    summary.grossRevenueCents === 0 &&
    summary.refunds === 0 &&
    summary.refundedCents === 0 &&
    summary.netRevenueCents === 0 &&
    funnel.productViews === 0 &&
    funnel.checkoutStarts === 0 &&
    funnel.paidOrders === 0 &&
    credits.granted === 0 &&
    credits.spent === 0 &&
    credits.released === 0 &&
    credits.revoked === 0
  );
}

function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`min-w-0 border-t-2 border-current px-1 pb-5 pt-4 ${
        accent ? "text-[var(--signal)]" : ""
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-[.12em] opacity-60">{label}</p>
      <p className="mt-3 break-words text-[clamp(1.8rem,5vw,2.8rem)] font-extrabold leading-none tracking-[-.06em]">
        {value}
      </p>
      {detail ? <p className="mt-3 text-xs leading-5 opacity-60">{detail}</p> : null}
    </div>
  );
}

function LoadingReport() {
  return (
    <div className="space-y-12" data-state="loading" aria-label="Loading sales report">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="border-t-2 border-current/15 pt-4">
            <div className="h-3 w-24 animate-pulse bg-current/10" />
            <div className="mt-4 h-10 w-32 animate-pulse bg-current/10" />
            <div className="mt-3 h-3 w-20 animate-pulse bg-current/10" />
          </div>
        ))}
      </div>
      <div className="border-y border-current/15 py-8" aria-hidden="true">
        <div className="h-3 w-36 animate-pulse bg-current/10" />
        <div className="mt-5 h-4 w-full animate-pulse bg-current/10" />
        <div className="mt-3 h-4 w-4/5 animate-pulse bg-current/10" />
      </div>
      <p className="text-sm opacity-60" role="status">
        Gathering the selected period…
      </p>
    </div>
  );
}

function Funnel({
  funnel,
}: {
  funnel: OwnerSalesReport["funnel"];
}) {
  const stages = [
    { label: "Product views", value: funnel.productViews, width: 1, testId: "views" },
    {
      label: "Checkout starts",
      value: funnel.checkoutStarts,
      width: funnel.productViews ? funnel.checkoutStarts / funnel.productViews : 0,
      testId: "checkouts",
    },
    {
      label: "Paid orders",
      value: funnel.paidOrders,
      width: funnel.productViews ? funnel.paidOrders / funnel.productViews : 0,
      testId: "paid",
    },
  ];

  return (
    <section className="border-t-2 border-current pt-4" aria-labelledby="conversion-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] opacity-60">Movement</p>
          <h2 id="conversion-heading" className="mt-2 text-2xl font-extrabold tracking-tight">
            From shelf to sale
          </h2>
        </div>
        <p className="text-xs opacity-60">Aggregate storefront funnel</p>
      </div>
      <div className="mt-8 space-y-6">
        {stages.map((stage) => (
          <div key={stage.testId} data-testid={`funnel-stage-${stage.testId}`}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span>{stage.label}</span>
              <span className="font-bold tabular-nums">{formatCount(stage.value)}</span>
            </div>
            <div
              className="mt-2 h-2 bg-current/10"
              role="progressbar"
              aria-label={`${stage.label} relative volume`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, stage.width) * 100)}
            >
              <div
                className="h-full origin-left bg-[var(--signal)] transition-transform duration-500 ease-out"
                style={{ transform: `scaleX(${Math.max(0, Math.min(1, stage.width))})` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-4 border-t border-current/15 pt-5 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.1em] opacity-60">View → checkout</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight" data-testid="text-checkout-rate">
            {formatPercent(funnel.checkoutRate)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.1em] opacity-60">Checkout → paid</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight" data-testid="text-paid-rate">
            {formatPercent(funnel.paidRate)}
          </p>
        </div>
      </div>
    </section>
  );
}

function CreditsLedger({
  credits,
}: {
  credits: OwnerSalesReport["credits"];
}) {
  const entries = [
    ["Granted", credits.granted],
    ["Spent", credits.spent],
    ["Released", credits.released],
    ["Revoked", credits.revoked],
  ] as const;
  return (
    <section className="border-t-2 border-current pt-4" aria-labelledby="credits-heading">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] opacity-60">Credit movement</p>
          <h2 id="credits-heading" className="mt-2 text-2xl font-extrabold tracking-tight">The quiet ledger</h2>
        </div>
        <span className="text-xs opacity-60">Units</span>
      </div>
      <dl className="mt-8 divide-y divide-current/15 border-y border-current/15">
        {entries.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-5 py-4 text-sm">
            <dt>{label}</dt>
            <dd className="font-bold tabular-nums" data-testid={`text-credits-${label.toLowerCase()}`}>
              {formatCount(value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 max-w-[34ch] text-xs leading-5 opacity-60">
        Credit activity is shown in aggregate so the owner view stays focused on the health of the collection.
      </p>
    </section>
  );
}

function TopArtworks({
  artworks,
}: {
  artworks: OwnerSalesReport["topArtworks"];
}) {
  return (
    <section className="border-t-2 border-current pt-4" aria-labelledby="artworks-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.12em] opacity-60">Edition performance</p>
          <h2 id="artworks-heading" className="mt-2 text-2xl font-extrabold tracking-tight">Works with momentum</h2>
        </div>
        <span className="text-xs opacity-60">{formatCount(artworks.length)} ranked</span>
      </div>
      <div className="mt-7 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <caption className="sr-only">Top artworks by purchases and gross revenue</caption>
          <thead>
            <tr className="border-b border-current/20 text-[10px] font-bold uppercase tracking-[.1em] opacity-60">
              <th scope="col" className="pb-3 pr-5">Artwork</th>
              <th scope="col" className="pb-3 pr-5 text-right">Purchases</th>
              <th scope="col" className="pb-3 pr-5 text-right">Gross</th>
              <th scope="col" className="pb-3 pr-5 text-right">Refunded</th>
              <th scope="col" className="pb-3 text-right">Credits</th>
            </tr>
          </thead>
          <tbody>
            {artworks.map((artwork, index) => (
              <tr
                key={artwork.artworkId}
                className="group border-b border-current/10 transition-colors hover:bg-current/[.04]"
                data-testid={`row-artwork-${artwork.artworkId}`}
              >
                <th scope="row" className="py-4 pr-5 font-normal">
                  <div className="flex items-baseline gap-3">
                    <span className="w-5 text-[10px] opacity-40">{String(index + 1).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <span className="block truncate font-bold">{artwork.title}</span>
                      <span className="mt-1 block truncate text-xs opacity-50">{artwork.artworkSlug}</span>
                    </div>
                  </div>
                </th>
                <td className="py-4 pr-5 text-right tabular-nums">{formatCount(artwork.purchases)}</td>
                <td className="py-4 pr-5 text-right tabular-nums">{formatMoney(artwork.grossRevenueCents)}</td>
                <td className="py-4 pr-5 text-right tabular-nums opacity-65">{formatMoney(artwork.refundedCents)}</td>
                <td className="py-4 text-right tabular-nums">{formatCount(artwork.creditsUsed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-5 opacity-55">
        Ranked by the report’s purchase order. Revenue is presented as an aggregate USD projection.
      </p>
    </section>
  );
}

function SalesReport({
  report,
  refreshing,
}: {
  report: OwnerSalesReport;
  refreshing: boolean;
}) {
  const netDetail = report.summary.refunds
    ? `${formatCount(report.summary.refunds)} refund${report.summary.refunds === 1 ? "" : "s"} · ${formatMoney(report.summary.refundedCents)} returned`
    : "After refunds";

  return (
    <div className="space-y-14" data-state="ready" aria-busy={refreshing}>
      {refreshing ? (
        <p className="border-l-2 border-[var(--signal)] pl-3 text-xs font-bold uppercase tracking-[.1em]" role="status">
          Updating this view…
        </p>
      ) : null}
      <section aria-label="Sales summary" className="grid gap-x-5 gap-y-8 border-b border-current/15 pb-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Paid orders" value={formatCount(report.summary.paidOrders)} detail="Completed purchases" />
        <Metric label="Gross revenue" value={formatMoney(report.summary.grossRevenueCents)} detail="Before refunds" accent />
        <Metric label="Refunds" value={formatMoney(report.summary.refundedCents)} detail={`${formatCount(report.summary.refunds)} returned`} />
        <Metric label="Net revenue" value={formatMoney(report.summary.netRevenueCents)} detail={netDetail} />
      </section>
      <div className="grid gap-12 md:grid-cols-[1.15fr_.85fr]">
        <Funnel funnel={report.funnel} />
        <CreditsLedger credits={report.credits} />
      </div>
      <TopArtworks artworks={report.topArtworks} />
      <p className="border-t border-current/15 pt-4 text-xs leading-5 opacity-55">
        This private view contains aggregate commerce performance only. Customer, order, payment-provider, and personal fields are intentionally excluded.
      </p>
    </div>
  );
}

export default function SalesPage() {
  const defaultRange = useMemo(initialRange, []);
  const [draftFrom, setDraftFrom] = useState(defaultRange.from);
  const [draftTo, setDraftTo] = useState(defaultRange.to);
  const [appliedRange, setAppliedRange] = useState(defaultRange);
  const [state, setState] = useState<ReportState>("loading");
  const [report, setReport] = useState<OwnerSalesReport | null>(null);
  const [message, setMessage] = useState("");
  const [validation, setValidation] = useState("");

  const loadReport = useCallback(async (from: string, to: string) => {
    setState("loading");
    setMessage("");
    setReport(null);
    try {
      const nextReport = await getOwnerSalesReport(from, to);
      setReport(nextReport);
      setAppliedRange({ from, to });
      setState("ready");
    } catch (error) {
      if (error instanceof ArtcovrApiError && error.status === 403) {
        setState("denied");
        setMessage("This workspace is limited to explicitly authorized ARTCOVR owners and administrators.");
      } else {
        setState("error");
        setMessage(error instanceof Error ? error.message : "The sales report could not be loaded.");
      }
    }
  }, []);

  useEffect(() => {
    void loadReport(defaultRange.from, defaultRange.to);
  }, [defaultRange.from, defaultRange.to, loadReport]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftFrom || !draftTo) {
      setValidation("Choose both a start date and an end date.");
      return;
    }
    if (draftFrom > draftTo) {
      setValidation("The start date must be before the end date.");
      return;
    }
    setValidation("");
    void loadReport(draftFrom, draftTo);
  }

  const isEmpty = state === "ready" && report ? reportIsEmpty(report) : false;

  return (
    <PublicPage eyebrow="Owner workspace / verified commerce" title={<>SALES<br />LEDGER</>}>
      <div className="space-y-12">
        <section className="flex flex-col gap-6 border-y border-current/20 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-[44ch]">
            <p className="text-base leading-7">
              A clear view of what the archive is moving. Select a period to inspect paid demand, credit flow, and the works earning attention.
            </p>
            <p className="mt-3 text-xs uppercase tracking-[.1em] opacity-55">Private · aggregate only</p>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="text-[10px] font-bold uppercase tracking-[.12em] opacity-55">Reporting window</p>
            <p className="mt-2 text-sm font-bold tabular-nums" data-testid="text-report-range">
              {formatDate(appliedRange.from)} — {formatDate(appliedRange.to)}
            </p>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="border-b border-current/20 pb-8" aria-label="Sales report date range">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-[10px] font-bold uppercase tracking-[.12em]">
                From
                <input
                  type="date"
                  value={draftFrom}
                  onChange={(event) => setDraftFrom(event.target.value)}
                  className="min-h-11 border-b border-current/30 bg-transparent px-0 text-sm font-normal tracking-normal outline-none transition-colors focus:border-current"
                  data-testid="input-sales-from"
                />
              </label>
              <label className="flex flex-col gap-2 text-[10px] font-bold uppercase tracking-[.12em]">
                To
                <input
                  type="date"
                  value={draftTo}
                  onChange={(event) => setDraftTo(event.target.value)}
                  className="min-h-11 border-b border-current/30 bg-transparent px-0 text-sm font-normal tracking-normal outline-none transition-colors focus:border-current"
                  data-testid="input-sales-to"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={state === "loading"}
                className="artcovr-button inline-flex min-h-11 items-center px-5 text-[11px] font-bold uppercase tracking-[.1em] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-50"
                data-testid="button-apply-sales-range"
              >
                {state === "loading" ? "Loading" : "Apply range"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftFrom(appliedRange.from);
                  setDraftTo(appliedRange.to);
                  void loadReport(appliedRange.from, appliedRange.to);
                }}
                disabled={state === "loading"}
                className="min-h-11 px-1 text-[11px] font-bold uppercase tracking-[.1em] underline decoration-current/35 underline-offset-4 transition-opacity hover:opacity-60 disabled:cursor-wait disabled:opacity-40"
                data-testid="button-refresh-sales"
              >
                Refresh
              </button>
            </div>
          </div>
          {validation ? (
            <p className="mt-4 text-sm text-[#9c3725]" role="alert" data-testid="status-sales-validation">
              {validation}
            </p>
          ) : null}
        </form>

        {state === "loading" ? <LoadingReport /> : null}
        {state === "denied" ? (
          <section className="border-y border-current/20 py-10" data-state="access-denied">
            <p className="text-2xl font-extrabold tracking-tight">This ledger is private.</p>
            <p className="mt-3 max-w-[52ch] text-sm leading-6 opacity-70">{message}</p>
            <Link
              href="/archive"
              className="artcovr-button mt-7 inline-flex min-h-11 items-center px-5 text-[11px] font-bold uppercase tracking-[.1em]"
              data-testid="link-sales-denied-archive"
            >
              Return to archive
            </Link>
          </section>
        ) : null}
        {state === "error" ? (
          <section className="border-y border-current/20 py-10" data-state="error">
            <p className="text-2xl font-extrabold tracking-tight">The ledger did not arrive.</p>
            <p className="mt-3 max-w-[52ch] border-l-2 border-[#9c3725] pl-4 text-sm leading-6" role="alert" data-testid="status-sales-error">
              {message}
            </p>
            <button
              type="button"
              onClick={() => void loadReport(appliedRange.from, appliedRange.to)}
              className="artcovr-button mt-7 inline-flex min-h-11 items-center px-5 text-[11px] font-bold uppercase tracking-[.1em]"
              data-testid="button-retry-sales"
            >
              Try again
            </button>
          </section>
        ) : null}
        {state === "ready" && report && isEmpty ? (
          <section className="border-y border-current/20 py-10" data-state="empty">
            <p className="text-2xl font-extrabold tracking-tight">No movement in this window.</p>
            <p className="mt-3 max-w-[52ch] text-sm leading-6 opacity-70">
              There are no paid orders, views, credits, or ranked works for the selected period. Try a wider range to see the archive’s activity.
            </p>
          </section>
        ) : null}
        {state === "ready" && report && !isEmpty ? <SalesReport report={report} refreshing={false} /> : null}
      </div>
    </PublicPage>
  );
}