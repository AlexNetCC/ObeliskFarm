## ObeliskFarm

An interactive calculator toolkit for the Android game **Idle Obelisk Miner**.

- **Web app (recommended)**: `https://arisboeuf.github.io/ObeliskFarm/`
- **Core focus**: Monte Carlo simulators that help optimize skill points and upgrades.

### Modules (high level)

- **Archaeology Simulator**
  - Monte Carlo optimizer for **skill point distributions** (STR/AGI/PER/INT/LCK).
  - Optimize for goals like **max stage push**, **XP/hour**, or **fragments/hour**.
  - Includes configuration for archaeology-related upgrades/cards so results match your current build.

- **Event Budget Optimizer / Simulator**
  - Plans **event upgrade spending** within a budget to push waves efficiently.
  - Produces a **recommended upgrade plan** plus detailed wave/time/performance results.

- **Gem EV Calculator**
  - Turns common gem sources into a single **gem-equivalent per hour** view.
  - Useful for comparing freebies / chains / sources in one place and seeing what drives EV most.

- **Stargazing Calculator**
  - Calculates **Stars/hour** and **Super Stars/hour** for **online/offline** scenarios.
  - Helps you sanity-check changes (rates, toggles, probabilities) without spreadsheets.

- **Fishing**
  - Planning and rate breakdowns for fishing progression.
  - Focused on clear per-hour outputs to compare setups quickly.

- **Drone**
  - Drone-related calculators and upgrade planning helpers.
  - Helps quantify gains and compare choices without manual math.

- **Lootbug**
  - Evaluates lootbug-related decisions by turning them into comparable rates/values.

- **Items / Chests**
  - Item + chest mechanics in a compact, comparable view (rates/value breakdowns).

- **Bombs**
  - Bomb-related mechanics with clear EV/rate outputs.

- **Overnight Gains**
  - Estimate/compare what you gain while offline based on your current parameters.

- **Veins**
  - Vein-related helper math (marked beta in the UI when applicable).

- **Ore / Bars (Transmuter)**
  - Conversions and rate calculations for ore→bars style mechanics.
  - Based on an external source (credit belongs to the original author).

### Tested up to

Tested up to Obelisk level **63**.

### Run locally (web)

```bash
cd web
npm install
npm run dev
```
