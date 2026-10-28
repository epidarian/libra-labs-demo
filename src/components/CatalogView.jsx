import { useSiteMode } from "../context/SiteMode.jsx";
import { useSiteContent } from "../context/SiteContent.jsx";
import { dateRange } from "../dates.js";
import { About, Comics, Commissions, Conventions, Gallery, Store } from "./Pages.jsx";

const pad = (n) => String(n).padStart(2, "0");

function conventionItems(rows) {
  return rows.map((item, i) => ({
    id: item.id,
    index: pad(i + 1),
    name: item.name,
    place: item.place,
    dates: dateRange(item.starts_on, item.ends_on),
    table: item.table_label || "Table TBA",
  }));
}

function withContent(catalog, zone, content) {
  if (!content) return catalog;
  const about = content.about?.[zone];
  const live = {
    ...catalog,
    about: about ? { ...catalog.about, ...about } : catalog.about,
    commissions: content.commissions
      ? { ...catalog.commissions, ...content.commissions }
      : catalog.commissions,
    gallery: content.galleryLive
      ? { ...catalog.gallery, works: content.gallery }
      : catalog.gallery,
    conventions: {
      ...catalog.conventions,
      items: conventionItems(content.conventions),
    },
  };
  if (content.demo !== false) return live;
  return {
    ...live,
    gallery: content.galleryLive ? live.gallery : { ...catalog.gallery, works: [] },
    comics: { ...catalog.comics, items: [] },
    store: { ...catalog.store, items: [] },
  };
}

export function CatalogView({ catalog: base, zone }) {
  const { section } = useSiteMode();
  const catalog = withContent(base, zone, useSiteContent());

  const pages = {
    gallery: <Gallery page={catalog.gallery} />,
    comics: <Comics page={catalog.comics} />,
    store: <Store page={catalog.store} />,
    conventions: <Conventions page={catalog.conventions} />,
    about: <About page={catalog.about} commissions={catalog.commissions} />,
    commissions: <Commissions page={catalog.commissions} email={catalog.email} zone={zone} />,
  };

  return (
    <main className={`view view--${zone}`} id="top" key={section}>
      {pages[section] ?? pages.gallery}
    </main>
  );
}
