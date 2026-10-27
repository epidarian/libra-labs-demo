import { commissionQueues, commissionTerms } from "../commissionOffer.js";
import { conventions, lorem } from "../shared.js";

export const sfwCatalog = {
  banner: "",
  email: "hello@libralabs.studio",
  gallery: {
    kicker: "Pictures",
    title: "Gallery",
    deck: "Digital Illustrations",
    works: [
      { id: "sfw-01", index: "01", title: "Orbit", medium: "Pigment", year: "2026", motif: "orbit" },
      { id: "sfw-02", index: "02", title: "Field", medium: "Photograph", year: "2026", motif: "field" },
      { id: "sfw-03", index: "03", title: "Meridian", medium: "Mixed media", year: "2025", motif: "meridian" },
      { id: "sfw-04", index: "04", title: "Three Suns", medium: "Print", year: "2025", motif: "suns" },
      { id: "sfw-05", index: "05", title: "Harbor", medium: "Photograph", year: "2024", motif: "harbor" },
      { id: "sfw-06", index: "06", title: "Trail", medium: "Photograph", year: "2024", motif: "trail" },
    ],
  },
  comics: {
    kicker: "Comics",
    title: "Comics",
    deck: "Print comics",
    items: [
      { id: "c1", index: "01", title: "Issue 01", detail: "24 pages. Print.", blurb: lorem[0], motif: "orbit", href: null },
      { id: "c2", index: "02", title: "Issue 02", detail: "24 pages. Print.", blurb: lorem[1], motif: "meridian", href: null, minCents: 300 },
      { id: "c3", index: "03", title: "Short 01", detail: "8 pages.", blurb: lorem[2], motif: "field", href: null },
    ],
  },
  store: {
    kicker: "Shop",
    title: "Store",
    deck: "Prints, comics, and original pictures.",
    items: [
      { id: "s1", name: "Print, 11×17", note: "Open edition", price: "$40" },
      { id: "s2", name: "Print, 18×24", note: "Open edition", price: "$75", minCents: 1000 },
      { id: "s3", name: "Comic, print", note: "Issue 01 or Issue 02", price: "$15" },
      { id: "s4", name: "Original", note: "One of a kind", price: "On request" },
    ],
  },
  conventions,
  about: {
    kicker: "Studio",
    title: "About",
    paragraphs: [
      "Libra Labs makes pictures and comics.",
      "Prints, comics, and originals are sold through the store and at conventions.",
    ],
  },
  commissions: {
    kicker: "Contact",
    title: "Commissions",
    deck: "Commission a picture or a comic page, or ask about an order.",
    status: "open",
    updated: "2026-10-26",
    queues: commissionQueues,
    terms: commissionTerms,
  },
};
