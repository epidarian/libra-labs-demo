import { commissionChecklist, conventions, lorem } from "../shared.js";

export const nsfwCatalog = {
  banner: "Adult catalog. 18+ only.",
  email: "hello@libralabs.studio",
  gallery: {
    kicker: "Adult pictures",
    title: "Gallery",
    deck: "Figure studies and color work.",
    works: [
      { id: "nsfw-01", index: "01", title: "Orbit", medium: "Figure", year: "2026", motif: "orbit" },
      { id: "nsfw-02", index: "02", title: "Heat", medium: "Pigment", year: "2026", motif: "heat" },
      { id: "nsfw-03", index: "03", title: "Suns", medium: "Mixed media", year: "2026", motif: "suns" },
      { id: "nsfw-04", index: "04", title: "Field", medium: "Photograph", year: "2025", motif: "field" },
      { id: "nsfw-05", index: "05", title: "Meridian", medium: "Print", year: "2025", motif: "meridian" },
      { id: "nsfw-06", index: "06", title: "Trail", medium: "Figure", year: "2024", motif: "trail" },
    ],
  },
  comics: {
    kicker: "Adult comics",
    title: "Comics",
    deck: "Adult comics and short stories.",
    items: [
      { id: "nc1", index: "01", title: "Issue 01", detail: "32 pages.", blurb: lorem[0], motif: "heat", href: null },
      { id: "nc2", index: "02", title: "Short 01", detail: "12 pages.", blurb: lorem[1], motif: "orbit", href: null },
      { id: "nc3", index: "03", title: "Short 02", detail: "8 pages.", blurb: lorem[2], motif: "suns", href: null },
    ],
  },
  store: {
    kicker: "Shop",
    title: "Store",
    deck: "Adult prints, comics, and original pictures.",
    items: [
      { id: "ns1", name: "Print, 11×17", note: "Open edition", price: "$45" },
      { id: "ns2", name: "Print, 18×24", note: "Open edition", price: "$80" },
      { id: "ns3", name: "Comic, print", note: "Issue 01", price: "$18" },
      { id: "ns4", name: "Original", note: "One of a kind", price: "On request" },
    ],
  },
  conventions,
  about: {
    kicker: "Studio",
    title: "About",
    paragraphs: [
      "The adult side of Libra Labs: figure studies, pictures, and comics.",
      "Prints, comics, and originals are sold through the store.",
    ],
  },
  commissions: {
    kicker: "Contact",
    title: "Commissions",
    deck: "Commission an adult picture or comic page, or ask about an order.",
    status: "open",
    updated: "2026-10-26",
    checklist: commissionChecklist,
  },
};
