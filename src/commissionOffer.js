// Stand-in price list for the demo, used until the site loads queues from the database.

const option = (queue, id, label, price, extra = {}) => ({
  id: `${queue}-${id}`,
  parent_id: null,
  label,
  price,
  price_unit: "usd",
  in_base: 0,
  required: 0,
  quantity_label: "",
  included: 0,
  ...extra,
});

export const commissionQueues = [
  {
    id: "illustration",
    name: "Illustration",
    open: true,
    options: [
      option("illustration", "sketch", "Sketch", 5000, { in_base: 1, required: 1 }),
      option("illustration", "lineart", "Lineart", 2500, { in_base: 1, parent_id: "illustration-sketch" }),
      option("illustration", "shade", "Shade", 2500, { in_base: 1, parent_id: "illustration-lineart" }),
      option("illustration", "characters", "Characters", 50, {
        price_unit: "percent",
        required: 1,
        quantity_label: "characters",
        included: 1,
      }),
      option("illustration", "background", "Background", 2500),
    ],
  },
  {
    id: "comics",
    name: "Comics",
    open: true,
    options: [
      option("comics", "pages", "Comic", 25000, { in_base: 1, required: 1, quantity_label: "pages" }),
      option("comics", "color", "Color", 15, { price_unit: "percent" }),
      option("comics", "backgrounds", "Backgrounds", 10, { price_unit: "percent" }),
    ],
  },
];

export const commissionTerms = {
  updated: "2026-10-26T00:00:00.000Z",
  items: [
    "By commissioning artwork, you hereby acknowledge that you, the commissioner, are 18 years old or older and are of legal age.",
    "Payment is due upon receiving the invoice.",
    "Partial payments are allowed; however, work will not begin until full payment is received.",
    "You have 48 hours from when the invoice is sent to you to pay the invoice or partially pay. If no payment is received, the commission form will be rejected.",
    "The commissioner is entitled to one free revision at the sketch stage; however, subsequent revisions will result in an extra charge on top of the total agreed-upon price. Any revisions done after the sketch stage will have a mandatory charge and revisions will not be made until payment.",
    "Be accurate and to the point with your commission description. You can also choose to give the artist creative freedom with your image. However, multiple-page-long descriptions or confusing/awkwardly written descriptions will result in the commission form to be rejected.",
    "Please provide high-resolution references (visual references only). Low-resolution references or thumbnail sized references will result in the commission form to be rejected. Image links must be easily accessible; links that lead to broken or private images will result on the commission to be rejected.",
    "The form must be properly filled or else the commission will be rejected.",
    "Libra Labs will not draw any of the following subjects: Bodily waste/Watersports/Scat, etc; Gore/Blood; Weight Gain; Cubs/Shota/Loli; Reference Sheets; Extreme Hyper; Hard/Extreme Vore. This is not a comprehensive list - for any questions about the acceptability of potential art subjects, please ask directly.",
    "Prices are subject to change without notice. Libra Labs has the right to refuse commissions for whatever reason.",
  ],
};
