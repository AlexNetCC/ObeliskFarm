# ObeliskFarm Calculator

> ⚠️ **Data based on OB41 (Obelisk Level 41)** — All calculations and game data are based on OB41. Results may vary for different progression levels.

An interactive calculator toolkit for the Android game **Idle Obelisk Miner**.

**Core focus:** Monte Carlo simulators for build optimization, plus Gem EV and supporting calculators (Bombs, Drone, Lootbug, Stargazing, Items).

## Web App

The main interface is the **web app** (no install, runs in the browser):

- **OPEN (GitHub Pages):** [ObeliskFarm (Web)](https://arisboeuf.github.io/ObeliskFarm/)
- Runs fully client-side; state is stored in `localStorage` (per device/browser).

### Web modules (overview)

| Module | Description |
|--------|-------------|
| **Event Simulator** | Monte Carlo optimizer for the bimonthly event: budget, upgrade levels, prestige. World Monuments (1–4), wave progression, reward milestones. Target wave override, HP loss chart. Saves state automatically. |
| **Archaeology Simulator** | Monte Carlo optimization for Archaeology skill points (STR/AGI/PER/INT/LCK). Objectives: max stage, XP/h, or fragments/h. Significance tests (Welch, α=0.05), MC run history, tie-break reports. |
| **Gem EV Calculator** | Gem-equivalent per hour from freebies (base rolls, jackpots, refresh, skill shards, stonks, founder drops, gem bombs, gift-EV). Stacked bar chart, Lootbug net gems and Drone fuel cost. Game speed and bomb recharge (10× from Lootbug/Drone) feed in from other modules; Charge Magnet and Chaos Totem impact from Items. |
| **Bombs** | Dedicated bomb parameters (same semantics as Gem EV): bomb cycle (early/late), recharge times, gem chance, card levels, 10× min/h from Lootbug/Drone. Game speed at top (from Gem EV). Writes Gem EV external for bomb contribution when used. Items uses Bombs params for Charge Magnet value. |
| **Stargazing Calculator** | Stars/h and Super Stars/h (online/offline). CTRL+F Stars, auto-catch. Uses Drone buff uptime (2× Star Spawn Rate, 3× Super Star) from the Drone module. Card tiers, Happy Bot, Polychrome bundle. |
| **Drone** | **Elixir Drone:** buff cycle, fuel duration, 10× Bomb Recharge share for Gem EV; **Frogger Drone:** fuel, bombs/autofire, Gem EV+/h; **Bomb Bear Drone:** when fueled, +Lootbug spawn rate (multiplicative), own fuel block, Gem EV/h from Lootbug gains. Game speed at top. Fuel subsections (Elixir/Frogger/Bomb Bear) only visible when “Drone fueled” is checked. Shared fuel duration multipliers (Coal, cards, relics). |
| **Lootbug** | Game speed at top (from Gem EV). Lootbug stats: spawn rate, triple/golden chance, loot mult. **Bomb Bear** spawn rate multiplier when Drone has Bomb Bear fueled. Lootbug gains: Gems (raw)/h, 10× Bomb Recharge Gem EV/h (net of gem cost). Free buffs and Gem buffs tables (per hour, min/h as min:sec). Writes net gems and 10× min/h for Gem EV; writes Bomb Bear Gem EV/h and base gains for Drone. |
| **Items / Chests** | Game speed at top (from Gem EV). Chests: items per chest, chests per hour (freebies, stonks, Lootbug), items per hour. Value of 1 Chest (Tier 1) and Expected chests per Gift (FYI). **Tier 1 Items:** Chaos Totem (duration, obtain chance, uptime, Gem EV impact); Charge Magnet (value per magnet uses Bombs bomb cycle, Gem EV impact). Feeds Chaos Totem uptime and Charge Magnet impact into Gem EV. |
| **Fishing** | Fish per hour by dock and fish type (power, catch chance, tick speed). Your stats from upgrade/enhancement levels (rod power, drone cap, tick chances, shiny/super shiny, tier 2 dock power). Docks: assign fishing drones, choose fisher dock. Available upgrades (T1/T2) and enhancements (T1/T2): cost, time to next level, +% gains. Uses Elixir drone 3× fishing tick speed uptime from Drone module. |

### Cross-module links

- **Gem EV** reads: Lootbug net gems/h, Lootbug + Drone 10× min/h, Drone fuel cost; Chaos Totem uptime and Charge Magnet impact from **Items**; when **Bombs** is used, bomb contribution (Gem/h, 10× impact, Chaos Totem impact) from Bombs.
- **Bombs** reads: Game speed and 10× min/h from Gem EV external (Lootbug/Drone); Chaos Totem uptime from Items. Writes bomb params to external so **Items** Charge Magnet value uses Bombs bomb cycle.
- **Items** reads: Game speed from Gem EV; chests/h sources from Gem EV external; **Bombs** params for Charge Magnet value. Writes Chaos Totem uptime and Charge Magnet impact for Gem EV.
- **Lootbug** reads: Game speed from Gem EV external; Bomb Bear spawn mult from **Drone**.
- **Stargazing** reads: Drone 2× Star / 3× Super Star uptime fractions.
- **Drone** reads: Bomb Bear Gem EV/h and base Lootbug gains (gems + net 10×) from **Lootbug** for live display. Game speed from Gem EV.
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
│   │   ├── bombs/             # Bombs (bomb cycle, recharge, 10×; uses gemev.css)
│   │   ├── stargazing/        # Stargazing Calculator
│   │   ├── fishing/           # Fishing: gains, stats, docks, upgrades & enhancements
│   │   ├── drone/             # Drone (Elixir, Frogger, Bomb Bear)
│   │   ├── lootbug/           # Lootbug stats & gains
│   │   └── items/             # Items / Chests
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
- Calculations follow current game mechanics (OB41); see code for details.
- **Game speed** is shown at the top in Items, Lootbug, Bombs, and Drone; it is read from the Gem EV Calculator (edit there).
- Tooltips (?) in the web app describe sources and formulas.
- Missing sprites in `public/sprites/` show a placeholder.

## License

For personal use when playing Idle Obelisk Miner.

## Credits

- **Event Simulator (Love2D):** Ported from Lua/LÖVE2D by julk.
- **Idle Obelisk Miner:** Credit to the game developers.
- **Images / game assets:** Rights remain with the game developers/rightsholders. This is a fan-made tool and is not affiliated with the game.
