import { CatalogView } from "../components/CatalogView.jsx";
import { sfwCatalog } from "./catalog.js";

export function SfwView() {
  return <CatalogView catalog={sfwCatalog} zone="sfw" />;
}
