import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ops } from "./api.js";

// What is waiting across the panel. It feeds the tab badges and the dashboard list.
const SummaryContext = createContext({ summary: null, refresh: () => {}, goTo: () => {} });

export const SummaryProvider = SummaryContext.Provider;

export function useSummary() {
  return useContext(SummaryContext);
}

const missingFile = (work) =>
  !work.files?.some((file) => file.slot === "full") || !work.files?.some((file) => file.slot === "thumb");

function summarize(commissions, gallery, fulfillment) {
  const unpaid = fulfillment ? fulfillment.invoices.filter((invoice) => !invoice.paid_at) : [];
  return {
    requests: commissions ? commissions.commissions.filter((item) => item.status === "new").length : null,
    queues: commissions ? commissions.queues.map((queue) => ({ id: queue.id, name: queue.name, open: Boolean(queue.open) })) : [],
    pictures: gallery ? gallery.works.filter(missingFile).length : null,
    priceEdits: fulfillment ? fulfillment.edits.length : null,
    unpaid: fulfillment ? unpaid.length : null,
    unpaidCents: unpaid.reduce((sum, invoice) => sum + (Number(invoice.amount_cents) || 0), 0),
    partnerLocked: fulfillment
      ? !fulfillment.settings.hasPass && (fulfillment.goods.length > 0 || fulfillment.items.length > 0)
      : false,
  };
}

export function useSummaryLoader(trigger) {
  const [summary, setSummary] = useState(null);

  const refresh = useCallback(() => {
    return Promise.all([
      ops("commissions").catch(() => null),
      ops("gallery").catch(() => null),
      ops("fulfillment").catch(() => null),
    ]).then(([commissions, gallery, fulfillment]) => {
      setSummary(summarize(commissions, gallery, fulfillment));
    });
  }, []);

  // Work done on one tab changes the counts, so recount whenever the tab changes.
  useEffect(() => {
    refresh();
  }, [refresh, trigger]);

  return [summary, refresh];
}

export function badgeFor(tab, summary) {
  if (!summary) return null;
  if (tab === "commissions" && summary.requests) {
    return { count: summary.requests, label: `${summary.requests} waiting for a decision` };
  }
  if (tab === "gallery" && summary.pictures) {
    return { count: summary.pictures, label: `${summary.pictures} missing a file` };
  }
  if (tab === "fulfillment") {
    const count = (summary.priceEdits || 0) + (summary.unpaid || 0);
    if (count) return { count, label: `${count} to review` };
  }
  return null;
}
