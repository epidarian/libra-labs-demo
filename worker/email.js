import { describeLine, formatCents } from "../src/commissionPricing.js";
import { demoAllowed } from "./demo.js";

const STUDIO = "Libra Labs";

export function emailConfigured(env) {
  if (demoAllowed(env)) return false;
  return Boolean(env.EMAIL && env.EMAIL_FROM);
}

export function emailHealth(env) {
  if (demoAllowed(env)) return { configured: false, ok: false, detail: "Demo mode." };
  const binding = typeof env.EMAIL?.send === "function";
  const from = String(env.EMAIL_FROM || "").trim();
  const replyTo = String(env.EMAIL_REPLY_TO || "").trim();
  if (!binding) return { configured: false, ok: false, detail: "EMAIL binding is unset." };
  if (!from) return { configured: false, ok: false, detail: "EMAIL_FROM is unset." };
  const detail = replyTo ? `Sending as ${from}. Replies go to ${replyTo}.` : `Sending as ${from}.`;
  return { configured: true, ok: true, from, replyTo, detail };
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function htmlOf(paragraphs) {
  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

async function send(env, to, subject, paragraphs) {
  const message = {
    to,
    from: { email: env.EMAIL_FROM, name: STUDIO },
    subject,
    text: paragraphs.join("\n\n"),
    html: htmlOf(paragraphs),
  };
  if (env.EMAIL_REPLY_TO) message.replyTo = env.EMAIL_REPLY_TO;
  return env.EMAIL.send(message);
}

function summary(request, queueName) {
  const lines = JSON.parse(request.selections || "[]").map(describeLine);
  return [
    `${queueName}\n${lines.join("\n")}\nQuoted total: ${formatCents(request.quote_cents)}`,
    `Your description:\n${request.description}`,
  ];
}

const invoiceTo = (request) => request.paypal_email || request.email;

export function sendReceipt(env, request, queueName) {
  return send(env, request.email, `${STUDIO}: commission request received`, [
    `Hello ${request.usernames},`,
    "Your commission request was received. You will get another email once it has been reviewed.",
    ...summary(request, queueName),
  ]);
}

export function sendAccepted(env, request, queueName) {
  return send(env, request.email, `${STUDIO}: commission accepted`, [
    `Hello ${request.usernames},`,
    `Your commission request has been accepted. A PayPal invoice will be sent to ${invoiceTo(request)}.`,
    ...(request.decision_note ? [request.decision_note] : []),
    ...summary(request, queueName),
  ]);
}

export function sendDeclined(env, request, queueName) {
  return send(env, request.email, `${STUDIO}: commission request declined`, [
    `Hello ${request.usernames},`,
    "Your commission request was not accepted.",
    ...(request.decision_note ? [`Reason: ${request.decision_note}`] : []),
    ...summary(request, queueName),
  ]);
}
