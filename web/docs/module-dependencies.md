# Module Dependencies & Interactions

Skizze der Abhängigkeiten zwischen Gem EV Calc, Bombs, Lootbug, Drone, Items und Stargazing.  
Ziel: Convoluted-Dependencies vermeiden.

---

## Datenfluss: Zwei Shared Storage Keys

| Key | Zweck |
|-----|-------|
| `gemev_external.json` | Kreuzmodul-Daten: 10× min/h, Chaos Totem, Charge Magnet, Chest-Werte, Game Speed, … |
| `stargazing_external.json` | Drone-Buffs für Stargazing (2×/3× Star, Starburst, Founder Supply Drop) |

Jedes Modul lädt das JSON, merged seine Werte rein, speichert. Kein zentraler Orchestrator.

---

## Abhängigkeits-Skizze

```
                    ┌─────────────────────────────────────────────────────────────────┐
                    │                    lib/gemev/freebieEv.ts                        │
                    │  (GameParameters, calculateGemBombGemsPerHour, getGameSpeed, …)  │
                    └─────────────────────────────────────────────────────────────────┘
                                               ▲
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
              ┌─────┴─────┐             ┌──────┴──────┐            ┌──────┴──────┐
              │  Gem EV   │             │    Bombs    │            │   Items     │
              │   Calc    │             │             │            │             │
              └─────┬─────┘             └──────┬──────┘            └──────┬──────┘
                    │                          │                          │
                    │     gemev_external.json (load + save, merge)        │
                    │◄─────────────────────────┼─────────────────────────►│
                    │                          │                          │
              ┌─────┴─────┐             ┌──────┴──────┐            ┌──────┴──────┐
              │  Lootbug  │             │   Drone     │            │ Stargazing  │
              │           │             │             │            │             │
              └───────────┘             └─────────────┘            └─────────────┘
                    │                          │                          │
                    │                    stargazing_external.json         │
                    │                          │◄─────────────────────────►│
                    │                          │                          │
                    └──────────────────────────┴──────────────────────────┘
```

---

## Wer schreibt was? Wer liest was?

### Gem EV Calc
- **Liest aus gemev_external:** lootbugBomb10x, droneBomb10x, lootbugNetGems, droneFuelGems, chaosTotemUptime, chaosTotem100FromBombs, chargeMagnetImpact, lootbugItemChests, itemsPerChest, gemBombGemsFromBombs, chaosTotemImpactFromBombs, …
- **Schreibt in gemev_external:** game_speed_multiplier, freebieChestsPerHour, stonksChestsPerHour, founderSupplyDropItemChestsPerHour, lootbugItemChestsPerHour, itemsPerChest, …
- **Schreibt in stargazing_external:** founderSupplyDrop2xStarMinPerHour, founderSupplyDropAutoCatch100MinPerHour

### Bombs
- **Liest aus gemev_external:** lootbugBomb10x, droneBomb10x, game_speed_multiplier, chaosTotemUptimePct (von Items)
- **Schreibt in gemev_external:** gemBomb10xImpact, gemBombGemsPerHourFromBombs, chaosTotem100FromBombs, chaosTotemImpactFromBombs, chaosTotemUptimePct (wenn 100%)

### Drone
- **Liest aus gemev_external:** lootbugBomb10x, chaosTotemUptime (für Frogger EV), GEMEV_STORAGE_KEY (params)
- **Schreibt in gemev_external:** droneBomb10xMinPerHour, droneFuelGemsPerHour, bombBearLootbugSpawnRateMult
- **Schreibt in stargazing_external:** drone2xStarUptimeFraction, drone3xSuperUptimeFraction, elixir2xStarMinPerHour, starburst*, …

### Lootbug
- **Liest aus gemev_external:** bombBearLootbugSpawnRateMult (Drone), valueOfOneChestForLootbug (Items), gemBomb10xImpact, total10xMinPerHour (Bombs/GemEv)
- **Liest aus GEMEV_STORAGE_KEY:** game_speed (params)
- **Schreibt in gemev_external:** lootbugBomb10xMinPerHour, lootbugItemChestsPerHour, lootbugNetGemsPerHour, lootbug2xStarMinPerHour, lootbugEvPerClaim, …

### Items
- **Liest aus gemev_external:** freebieChestsPerHour, stonksChestsPerHour, lootbugItemChestsPerHour, founderSupplyDropItemChestsPerHour, chaosTotem100FromBombs, total10xMinPerHour
- **Liest aus GEMEV_STORAGE_KEY, BOMBS_STORAGE_KEY:** params für Charge Magnet / Chaos Totem Berechnung
- **Schreibt in gemev_external:** chaosTotemUptimePct, chaosTotemImpact, chargeMagnetImpact, valueOfOneChestForLootbug

### Stargazing
- **Liest aus gemev_external:** lootbug2xStarMinPerHour
- **Liest aus stargazing_external:** elixir2xStarMinPerHour, drone3xSuperUptimeFraction, founderSupplyDrop2x*, starburst*, …
- **Schreibt in stargazing_external:** eigene Summaries (für Overnight etc.)

---

## Kreisläufe / Konflikte (potenziell convoluted)

1. **Items ↔ Bombs (Chaos Totem):**
   - Bombs hat Toggle „100% Chaos Totem“ → überschreibt chaosTotemUptimePct.
   - Items berechnet Chaos Totem aus Chests → schreibt chaosTotemUptimePct (wenn Bombs nicht 100%).
   - Gem EV liest beides und entscheidet: chaosTotem100FromBombs → kein Items-Uptime.

2. **Items ↔ Lootbug:**
   - Items schreibt `valueOfOneChestForLootbug` (Wert pro Chest).
   - Lootbug liest das für Gem EV von „+1 Item Chest“.
   - Items braucht `lootbugItemChestsPerHour` von Lootbug → indirekt über GemEv (der das von Lootbug bekommt und weitergibt). Tatsächlich: Lootbug schreibt lootbugItemChestsPerHour, GemEv schreibt das auch (aggregiert), Items liest das. → Hier gibt es eine kleine Redundanz: Lootbug schreibt es, GemEv aggregiert die Chest-Quellen und schreibt auch. Items liest von gemev_external – das kommt letztlich von GemEv’s Aggregation (freebie + stonks + lootbug + founder).

3. **Lootbug ↔ Drone:**
   - Drone schreibt `bombBearLootbugSpawnRateMult` (Bomb Bear erhöht Lootbug-Spawn).
   - Lootbug liest das für Spawn-Rate.
   - Einfache Richtung: Drone → Lootbug.

4. **Drone ↔ GemEv/Bombs:**
   - Drone braucht lootbugBomb10x für total 10× (Frogger EV).
   - Drone schreibt droneBomb10x.
   - Bombs/GemEv lesen beides für Bomb-10×-Zeiten.

---

## Vereinfachungs-Empfehlungen (Vermeidung von Convoluted)

1. **Ein Owner pro Feld in gemev_external:**  
   Klar definieren, welches Modul für welches Feld verantwortlich ist. Andere dürfen nur lesen. Aktuell: Mehrere Module mergen ins gleiche JSON → Race-Bedingungen möglich, wenn zwei Module gleichzeitig schreiben.

2. **Items als „Chest-Hub“:**  
   Items berechnet Chaos Totem, Charge Magnet, Chest-Wert. Es liest Chest-Quellen von GemEv. Besser: GemEv schreibt nur „Quellen“, Items ist alleiniger Owner von chaosTotem*, chargeMagnet*, valueOfOneChest*.

3. **Stargazing externe sauber trennen:**  
   `stargazing_external` wird von Drone, GemEv und Stargazing beschrieben. Drone = Drone-Buffs, GemEv = Founder, Stargazing = eigene Summaries. Soweit OK, wenn die Keys sich nicht überschneiden.

4. **Lootbug Constants gemeinsam nutzen:**  
   Drone importiert `lib/lootbug/constants` (GEM_BUFFS, FREE_BUFFS). Das ist sauber – shared lib, keine Storage-Kopplung.

5. **Keine neuen bidirektionalen Abhängigkeiten:**  
   Wenn ein neues Modul Daten braucht: bevorzugt ein Modul als Owner, andere lesen. Vermeiden: A schreibt für B, B schreibt für A (außer wo fachlich zwingend nötig wie Chaos Totem 100% vs Items-Uptime).

---

## Übersicht: Wer hängt von wem ab?

```
         Gem EV ◄── Bombs (10×, Chaos 100%)
            ▲
            │ params, game speed
            │
   ┌────────┼────────┬─────────────┐
   │        │        │             │
   ▼        ▼        ▼             ▼
 Bombs   Lootbug   Items      Stargazing
   │        │        │             ▲
   │        │        │             │
   │        │        └─────────────┘ (lootbug2xStar)
   │        │
   │        ◄── Drone (bombBear spawn mult)
   │
   └── Items (chaosTotemUptime wenn nicht 100%)
   └── Drone (10× min/h)
```

**Fazit:** Die Haupt-Verzweigung geht von Gem EV aus (params, game speed). Bombs, Drone, Lootbug und Items schreiben ihre Ergebnisse in gemev_external. Gem EV aggregiert und Stargazing liest Drone + Lootbug-Buffs. Die Struktur ist noch überschaubar; kritisch sind die Merge-Semantik in gemev_external und die klare Ownership pro Feld.
