# ObeliskFarm Calculator

> ⚠️ **Data based on OB37 (Obelisk Level 37)** — All calculations and game data are based on OB37. Results may vary for different progression levels.

An interactive calculator toolkit for the Android game **Idle Obelisk Miner**.

**Core focus:** Monte Carlo simulators for build optimization, plus Gem EV and supporting calculators (Drone, Lootbug, Stargazing, Items).

## Web App

The main interface is the **web app** (no install, runs in the browser):

- **OPEN (GitHub Pages):** [ObeliskFarm (Web)](https://arisboeuf.github.io/ObeliskFarm/)
- Runs fully client-side; state is stored in `localStorage` (per device/browser).

### Web modules (overview)

| Module | Description |
|--------|-------------|
| **Event Simulator** | Monte Carlo optimizer for the bimonthly event: budget, upgrade levels, prestige. World Monuments (1–4), wave progression, reward milestones. Saves state automatically. |
| **Archaeology Simulator** | Monte Carlo optimization for Archaeology skill points (STR/AGI/PER/INT/LCK). Objectives: max stage, XP/h, or fragments/h. Significance tests (Welch, α=0.05), MC run history, tie-break reports. |
| **Gem EV Calculator** | Gem-equivalent per hour from freebies (base rolls, jackpots, refresh, skill shards, stonks, founder drops, gem bombs, gift-EV). Stacked bar chart, Lootbug net gems and Drone fuel cost. Game speed and bomb recharge (e.g. 10× from Lootbug/Drone) feed in from other modules. |
| **Stargazing Calculator** | Stars/h and Super Stars/h (online/offline). CTRL+F Stars, auto-catch. Uses Drone buff uptime (2× Star Spawn Rate, 3× Super Star) from the Drone module. Card tiers, Happy Bot, Polychrome bundle. |
| **Drone** | **Elixir Drone:** buff cycle, fuel duration, 10× Bomb Recharge share for Gem EV; **Frogger Drone:** fuel, bombs/autofire, Gem EV+/h; **Bomb Bear Drone:** when fueled, +Lootbug spawn rate (multiplicative), own fuel block, Gem EV/h from Lootbug gains. Fuel subsections (Elixir/Frogger/Bomb Bear) only visible when “Drone fueled” is checked. Shared fuel duration multipliers (Coal, cards, relics). |
| **Lootbug** | Lootbug stats (spawn rate, triple/golden chance, loot mult). **Bomb Bear** spawn rate multiplier applied when Drone has Bomb Bear fueled. Lootbug gains: Gems (raw)/h, 10× Bomb Recharge Gem EV/h (net of gem cost). Free buffs and Gem buffs tables (per hour, min/h as min:sec). Writes net gems and 10× min/h for Gem EV; writes Bomb Bear Gem EV/h and base gains for Drone. |
| **Items / Chests** | Chaos Totem duration and obtain chance; Charge Magnet impact from Gem EV bomb cycle. Item Chests per hour (from Lootbug “+1 Item Chest” free buff). Items per chest. Feeds into Gem EV (chests, Charge Magnet). |
| **Fishing** | Fish per hour by dock and fish type (power, catch chance, tick speed). Your stats from upgrade/enhancement levels (rod power, drone cap, tick chances, shiny/super shiny, tier 2 dock power). Docks: assign fishing drones, choose fisher dock. Available upgrades (T1/T2) and enhancements (T1/T2): cost, time to next level, +% gains. Uses Elixir drone 3× fishing tick speed uptime from Drone module. |

### Cross-module links

- **Gem EV** reads: Lootbug net gems/h, Lootbug + Drone 10× min/h, Drone fuel cost, Stargazing/Items when relevant.
- **Lootbug** reads: Game speed and Gem EV params; Bomb Bear spawn mult from **Drone**.
- **Stargazing** reads: Drone 2× Star / 3× Super Star uptime fractions.
- **Drone** reads: Bomb Bear Gem EV/h and base Lootbug gains (gems + net 10×) from **Lootbug** for live display.
- **Fishing** reads: Elixir drone 3× fishing tick speed uptime from **Drone** for fish/h and time-to-next.

## Run from source (developers)

```bash
cd web
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`).

## Project structure (web)

```
web/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   ├── modules/
│   │   ├── event/             # Event Simulator
│   │   ├── arch/              # Archaeology Simulator
│   │   ├── gemev/             # Gem EV Calculator + ContribBarChart
│   │   ├── stargazing/        # Stargazing Calculator
│   │   ├── drone/             # Drone (Elixir, Frogger, Bomb Bear)
│   │   ├── lootbug/           # Lootbug stats & gains
│   │   ├── items/             # Items / Chests
│   │   └── fishing/           # Fishing: gains, stats, docks, upgrades & enhancements
│   ├── lib/                   # Shared logic
│   │   ├── archaeology/      # Arch sim, MC, block stats, spawn rates
│   │   ├── event/             # Event sim, optimizer, constants
│   │   ├── gemev/             # Freebie EV, bomb cycle
│   │   ├── lootbug/           # Lootbug constants
│   │   ├── stargazing/        # Star calculator
│   │   ├── fishing/           # Fishing constants, computeStats, upgrade costs
│   │   ├── assets.ts
│   │   ├── format.ts
│   │   ├── storage.ts
│   │   └── rng.ts
│   ├── components/            # Collapsible, Tooltip
│   └── workers/               # MC workers (event, arch)
├── public/
│   └── sprites/               # UI sprites (arch, common, event, stargazing)
├── scripts/                   # copy-assets etc.
├── index.html
├── package.json
└── vite.config.ts
```

## Notes

- All Gem EV values are **per hour** and in **Gem-equivalent**.
- Calculations follow current game mechanics (OB37); see code for details.
- Tooltips (?) in the web app describe sources and formulas.
- Missing sprites in `public/sprites/` show a placeholder.

## License

For personal use when playing Idle Obelisk Miner.

## Credits

- **Event Simulator (Love2D):** Ported from Lua/LÖVE2D by julk.
- **Idle Obelisk Miner:** Credit to the game developers.
- **Images / game assets:** Rights remain with the game developers/rightsholders. This is a fan-made tool and is not affiliated with the game.
