import { commissionTerms } from "../src/commissionOffer.js";
import { readSettings } from "./content.js";

const TERMS_KEY = "commissions.terms";
const CONTACT = "hello@libralabs.studio";

const privacyPolicy = `Libra Labs
Privacy Policy
Last updated: 2026-10-27
Contact: ${CONTACT}
Terms of service: /tos.txt

This site publishes pictures and comics, some of them adult, and takes commissions. This policy says what the site collects and how to ask for it to be deleted.

Patreon
Signing in with Patreon sends this site your Patreon name, email, profile image, whether you are an active patron, and your current pledge amount. The name, email, and image are saved as an account so it can be tagged. The pledge amount and patron status are stored in a cookie named libra_patron for 7 days. This site does not receive your Patreon password, does not keep the Patreon sign-in token, and does not sell this information or use it for advertising. Sign out to disconnect. Patreon has its own privacy policy at https://privacy.patreon.com/policies.

Accounts
An email account stores your email and a hash of your password, not the password. Google sign-in stores the name, email, and profile image Google sends. A cookie named libra_session keeps you signed in for 30 days. Sign out deletes that session.

Commissions
A commission request stores your usernames, email, PayPal email if you entered one, description, chosen options, quoted price, and the reference images you attached. Those are used to quote the job, accept or decline it, send the invoice, and do the work. PayPal receives the invoice email and the amount. An accepted request may be copied into Linear so the job can be tracked. The images are deleted when the request is deleted. Email ${CONTACT} with the subject "Privacy request" to ask for that sooner. If you paid, the date, amount, and email are kept as the invoice record.

On this site
The age confirmation and the display settings stay in this browser under the names libra-age, libra-theme, and libra-rating. The other contact form opens your own email app and is stored here only if you send the email. The site is hosted on Cloudflare, which keeps request logs to run the service. Pages load fonts from Google Fonts. There are no advertising or analytics cookies.

Age
The adult section and commissions are for people 18 or older. This site does not knowingly keep information from anyone younger. If it has, email ${CONTACT} and it will be deleted.

Asking for your information
Email ${CONTACT} from the address on the account or the commission, with the subject "Privacy request", and say whether you want a copy, a correction, or deletion. You will get an answer within 30 days.
`;

async function currentTerms(env) {
  try {
    const settings = await readSettings(env);
    const stored = settings[TERMS_KEY];
    const items = Array.isArray(stored?.items) ? stored.items.filter(Boolean) : [];
    if (items.length) return { items, updated: stored.updated || commissionTerms.updated };
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "terms read failed",
        error: error instanceof Error ? error.message : String(error),
      })
    );
  }
  return commissionTerms;
}

function renderTerms(terms) {
  const updated = String(terms.updated || "").slice(0, 10);
  const rules = terms.items.map((item, index) => `${index + 1}. ${item}`).join("\n\n");
  return `Libra Labs
Terms of Service
Last updated: ${updated}
Contact: ${CONTACT}
Privacy policy: /privacy-policy.txt

This site publishes pictures and comics. Some of the work is adult material. You must be 18 or older, or the age of majority where you live if that is older, to open the adult section or to commission artwork. Using the site, confirming your age, signing in, or sending a commission request means you agree to these terms and to the privacy policy.

Artwork on this site belongs to Libra Labs. You may view the files your access allows. Patron-only files are available while your Patreon membership includes them. You may not republish those files, sell them, or pass them on.

Signing in with Patreon lets this site read your Patreon name, email, profile image, patron status, and pledge amount. The email is saved as an account on this site. Pledge information is used to show the files your membership allows. Your pledge is still governed by Patreon: https://www.patreon.com/policy/legal

Libra Labs may refuse a commission or close an account that breaks these terms. Write to ${CONTACT} with any question.

Commission terms
A commission request records the date above as the version you agreed to.

${rules}
`;
}

function text(body, status = 200, extra) {
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=60",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  };
  return new Response(body, { status, headers });
}

export async function handleLegal(request, env, url) {
  const path = url.pathname;
  if (path !== "/tos.txt" && path !== "/privacy-policy.txt") return null;
  if (request.method !== "GET") return text("Method not allowed.\n", 405, { Allow: "GET" });
  if (path === "/privacy-policy.txt") return text(privacyPolicy);
  return text(renderTerms(await currentTerms(env)));
}
