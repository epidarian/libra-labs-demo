export const OPS_PATH = "/ops";
export const PARTNER_PATH = "/partner";

export function appPathname() {
  let path = window.location.pathname.replace(/\/+$/, "") || "/";
  const base = import.meta.env.BASE_URL;
  if (base.startsWith("/")) {
    const prefix = base.replace(/\/+$/, "");
    if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) {
      path = path.slice(prefix.length) || "/";
    }
  }
  return path;
}

const path = appPathname();

export const onOps = path === OPS_PATH;
export const onPartner = path === PARTNER_PATH;

export const onSite = path === "/" || onOps || onPartner;

export function siteHref(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = import.meta.env.BASE_URL;
  if (!base.startsWith("/")) return normalized;
  return `${base}${normalized.slice(1)}`;
}
