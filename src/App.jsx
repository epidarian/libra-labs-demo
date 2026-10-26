import { Frame } from "./components/Frame.jsx";
import { Viewport } from "./components/Viewport.jsx";
import { SiteModeProvider, useSiteMode } from "./context/SiteMode.jsx";
import { NsfwView } from "./nsfw/NsfwView.jsx";
import { SfwView } from "./sfw/SfwView.jsx";

function Shell() {
  const { nsfw } = useSiteMode();

  return (
    <div className="station">
      <Viewport />
      <Frame>{nsfw ? <NsfwView /> : <SfwView />}</Frame>
    </div>
  );
}

export default function App() {
  return (
    <SiteModeProvider>
      <Shell />
    </SiteModeProvider>
  );
}
