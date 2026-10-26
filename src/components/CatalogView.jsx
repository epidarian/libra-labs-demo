import { useSiteMode } from "../context/SiteMode.jsx";
import { About, Comics, Commissions, Conventions, Gallery, Store } from "./Pages.jsx";

export function CatalogView({ catalog, zone }) {
  const { section } = useSiteMode();

  const pages = {
    gallery: <Gallery page={catalog.gallery} />,
    comics: <Comics page={catalog.comics} />,
    store: <Store page={catalog.store} />,
    conventions: <Conventions page={catalog.conventions} />,
    about: <About page={catalog.about} commissions={catalog.commissions} />,
    commissions: <Commissions page={catalog.commissions} email={catalog.email} />,
  };

  return (
    <main className={`view view--${zone}`} id="top" key={section}>
      {catalog.banner ? <p className="mature">{catalog.banner}</p> : null}
      {pages[section] ?? pages.gallery}
    </main>
  );
}
