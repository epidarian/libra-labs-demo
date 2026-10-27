import { AgeGate } from "./components/AgeGate.jsx";
import { Frame } from "./components/Frame.jsx";
import { Viewport } from "./components/Viewport.jsx";
import { PatreonProvider } from "./context/Patreon.jsx";
import { SiteContentProvider } from "./context/SiteContent.jsx";
import { SiteModeProvider, useSiteMode } from "./context/SiteMode.jsx";
import { NsfwView } from "./nsfw/NsfwView.jsx";
import { OpsPanel } from "./ops/OpsPanel.jsx";
import { onOps } from "./ops/route.js";
import { SfwView } from "./sfw/SfwView.jsx";

function Shell() {
  const { nsfw } = useSiteMode();

  if (onOps) return <OpsPanel />;

  return (
    <div className="station">
      <Viewport />
      <Frame>{nsfw ? <NsfwView /> : <SfwView />}</Frame>
      <AgeGate />
    </div>
  );
}

export default function App() {
  return (
    <SiteModeProvider>
      <PatreonProvider>
        <SiteContentProvider>
          <Shell />
        </SiteContentProvider>
      </PatreonProvider>
    </SiteModeProvider>
  );
}
