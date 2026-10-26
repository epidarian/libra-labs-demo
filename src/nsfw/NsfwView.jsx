import { CatalogView } from "../components/CatalogView.jsx";
import { nsfwCatalog } from "./catalog.js";

export function NsfwView() {
  return <CatalogView catalog={nsfwCatalog} zone="nsfw" />;
}
