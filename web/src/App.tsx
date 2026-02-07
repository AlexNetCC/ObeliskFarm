import { useEffect, useMemo, useState } from "react";
import { assetUrl } from "./lib/assets";
import { Tooltip } from "./components/Tooltip";
import { loadJson, saveJson } from "./lib/storage";
import { EventSim } from "./modules/event/EventSim";
import { ArchSim } from "./modules/arch/ArchSim";
import { GemEv } from "./modules/gemev/GemEv";
import { Stargazing } from "./modules/stargazing/Stargazing";
import { Fishing } from "./modules/fishing/Fishing";
import { Drone } from "./modules/drone/Drone";
import { Lootbug } from "./modules/lootbug/Lootbug";
import { Items } from "./modules/items/Items";
import { Bombs } from "./modules/bombs/Bombs";
type ModuleId = "event" | "arch" | "gemev" | "bombs" | "stargazing" | "fishing" | "drone" | "lootbug" | "items";
const SUPPORT_URL = "https://buymeacoffee.com/arisboeuf";
const HEADER_MINIMIZED_KEY = "obeliskfarm:web:header_minimized";

function Sprite(props: { path: string; alt: string; className?: string }) {
  const src = props.path.startsWith("http://") || props.path.startsWith("https://") ? props.path : assetUrl(props.path);
  return <img className={props.className ?? "icon"} src={src} alt={props.alt} />;
}

export function App() {
  const [active, setActive] = useState<ModuleId>("event");
  const [navExpanded, setNavExpanded] = useState(false);
  const [headerMinimized, setHeaderMinimized] = useState(() => loadJson<boolean>(HEADER_MINIMIZED_KEY) ?? false);
  useEffect(() => {
    saveJson(HEADER_MINIMIZED_KEY, headerMinimized);
  }, [headerMinimized]);

  const modules = useMemo(
    () =>
      [
        { id: "event" as const, label: "Event Simulator", icon: "sprites/event/event_button.png" },
        { id: "arch" as const, label: "Archaeology Simulator", icon: "sprites/archaeology/archaeology.png" },
        { id: "gemev" as const, label: "Gem EV Calculator", icon: "sprites/common/gem.png" },
        { id: "bombs" as const, label: "Bombs", icon: "sprites/event/gembomb.png" },
        { id: "stargazing" as const, label: "Stargazing Calculator", icon: "sprites/stargazing/stargazing.svg" },
        { id: "fishing" as const, label: "Fishing", icon: "https://static.wikitide.net/shminerwiki/f/fb/Fishing_Button.png" },
        { id: "drone" as const, label: "Drone", icon: "https://static.wikitide.net/shminerwiki/d/d1/Drones_Button.png" },
        { id: "lootbug" as const, label: "Lootbug", icon: "https://static.wikitide.net/shminerwiki/8/86/Lootbug_Default.png" },
        { id: "items" as const, label: "Items / Chests", icon: "https://static.wikitide.net/shminerwiki/a/a8/Item_Chest.png" },
      ] as const,
    [],
  );

  return (
    <div className="appShell">
      <div className={`topNav ${navExpanded ? "navExpanded" : ""} ${headerMinimized ? "headerMinimized" : ""}`}>
        <div className="topNavBrand">
          <Sprite path="sprites/common/gem.png" alt="ObeliskFarm" className="icon" />
          <div>
            <div className="topNavTitle">ObeliskFarm (Web)</div>
            {!headerMinimized ? <div className="topNavSubtitle">Choose a module.</div> : null}
          </div>
        </div>
        <div className="topNavSpacer" aria-hidden="true" />
        <button
          type="button"
          className="topNavMinimize"
          onClick={() => setHeaderMinimized((v) => !v)}
          aria-pressed={headerMinimized}
          aria-expanded={!headerMinimized}
          aria-label={headerMinimized ? "Expand menu" : "Collapse menu"}
          title={headerMinimized ? "Expand menu (show module tiles)" : "Collapse menu (more space for content)"}
        >
          {headerMinimized ? "Maximize Menu" : "Minimize Menu"}
        </button>
        <button
          type="button"
          className="topNavToggle"
          onClick={() => setNavExpanded((v) => !v)}
          aria-expanded={navExpanded}
          aria-label={navExpanded ? "Close menu" : "Open menu"}
        >
          {navExpanded ? "✕" : "☰"}
        </button>
        <div className="topNavButtons">
          {modules.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`navTile ${active === m.id ? "navTileActive" : ""}`}
              onClick={() => setActive(m.id)}
            >
              <Sprite path={m.icon} alt={m.label} className="icon" />
              <span className="navTileLabel">
                <span>{m.label}</span>
                {(m.id === "event" || m.id === "arch") && (
                  <span className="navWorkingHorse" aria-hidden="true" title="Main module">
                    ❤
                  </span>
                )}
                {m.id === "fishing" && (
                  <span className="navBetaBadge" aria-hidden="true">
                    BETA
                    <Tooltip content={{ title: "WIP", lines: ["Work in progress."] }} />
                  </span>
                )}
              </span>
            </button>
          ))}

          <a className="navTile navTileDonation" href={SUPPORT_URL} target="_blank" rel="noreferrer noopener">
            <span className="navEmoji" aria-hidden="true">
              💵
            </span>
            <span className="navTileSupportLabel">
              Support me{" "}
              <Tooltip
                content={{
                  title: "Support this project",
                  lines: [
                    "I'm a beginner and I build ObeliskFarm as a hobby project.",
                    "If you find it useful, a small donation helps me keep improving it.",
                    "Thank you for the support!",
                  ],
                }}
              />
            </span>
          </a>
        </div>
      </div>

      {active === "gemev" ? (
        <GemEv />
      ) : active === "bombs" ? (
        <Bombs />
      ) : active === "event" ? (
        <EventSim />
      ) : active === "arch" ? (
        <ArchSim />
      ) : active === "drone" ? (
        <Drone />
      ) : active === "lootbug" ? (
        <Lootbug />
      ) : active === "items" ? (
        <Items />
      ) : active === "fishing" ? (
        <Fishing />
      ) : (
        <Stargazing />
      )}
    </div>
  );
}

