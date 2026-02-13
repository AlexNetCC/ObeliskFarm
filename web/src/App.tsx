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
import { OvernightGains } from "./modules/overnight/OvernightGains";
import "./modules/overnight/overnight.css";
type ModuleId = "event" | "arch" | "gemev" | "bombs" | "stargazing" | "fishing" | "drone" | "lootbug" | "items" | "overnight";
const SUPPORT_URL = "https://buymeacoffee.com/arisboeuf";
const HEADER_MINIMIZED_KEY = "obeliskfarm:web:header_minimized";

function Sprite(props: { path: string; alt: string; className?: string }) {
  const src = props.path.startsWith("http://") || props.path.startsWith("https://") ? props.path : assetUrl(props.path);
  return <img className={props.className ?? "icon"} src={src} alt={props.alt} />;
}

function MoonStarsIcon() {
  return (
    <span className="icon navOvernightIconWrap" aria-hidden="true">
      <svg className="navOvernightIcon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3a6 6 0 0 0 6 6c0 2.2-1.2 4.1-3 5.2A6 6 0 0 1 6 12a6 6 0 0 1 6-9Z" />
        <circle cx="18" cy="6" r="1" fill="currentColor" />
        <circle cx="20" cy="14" r="0.8" fill="currentColor" />
        <circle cx="5" cy="18" r="0.7" fill="currentColor" />
      </svg>
    </span>
  );
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
        { id: "stargazing" as const, label: "Stargazing", icon: "sprites/stargazing/stargazing.svg" },
        { id: "fishing" as const, label: "Fishing", icon: "https://static.wikitide.net/shminerwiki/f/fb/Fishing_Button.png" },
        { id: "drone" as const, label: "Drone", icon: "https://static.wikitide.net/shminerwiki/d/d1/Drones_Button.png" },
        { id: "lootbug" as const, label: "Lootbug", icon: "https://static.wikitide.net/shminerwiki/8/86/Lootbug_Default.png" },
        { id: "items" as const, label: "Items / Chests", icon: "https://static.wikitide.net/shminerwiki/a/a8/Item_Chest.png" },
        { id: "overnight" as const, label: "Overnight Gains", icon: "" },
      ] as const,
    [],
  );

  return (
    <div className={`appShell ${active === "overnight" ? "overnightActive" : ""}`}>
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
              className={`navTile ${active === m.id ? "navTileActive" : ""} ${m.id === "overnight" ? "navTileOvernight" : ""}`}
              onClick={() => setActive(m.id)}
            >
              {m.id === "overnight" ? <MoonStarsIcon /> : <Sprite path={m.icon} alt={m.label} className="icon" />}
              <span className="navTileLabel">
                <span>{m.label}</span>
                {(m.id === "event" || m.id === "arch") && (
                  <span className="navWorkingHorse" aria-hidden="true" title="Main module">
                    ❤
                  </span>
                )}
                {m.id === "overnight" && (
                  <span className="navBetaBadge">
                    <Tooltip
                      content={{ title: "Beta", lines: ["This module is in beta. Numbers and behaviour may change."] }}
                      label="Beta"
                    />
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
      ) : active === "overnight" ? (
        <OvernightGains />
      ) : (
        <Stargazing />
      )}
    </div>
  );
}

