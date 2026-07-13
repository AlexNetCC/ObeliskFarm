/**
 * Seasonal event calendar (Idle Obelisk Miner wiki: Events page).
 * Each event runs for one full month on even months.
 * On odd months (no live event), icons fall back to the previous event.
 *
 * @see https://shminer.miraheze.org/wiki/Events
 * @see https://shminer.miraheze.org/wiki/Module:CurrentEventImages
 */

export type SeasonalEventId =
  | "valentines"
  | "easter"
  | "magma"
  | "summer"
  | "halloween"
  | "christmas";

export type SeasonalEvent = {
  id: SeasonalEventId;
  /** Display name, e.g. "Valentines Event". */
  name: string;
  /** Calendar month when the event is live (1–12). */
  month: number;
  /** Inclusive start day of month. */
  startDay: number;
  /** Inclusive end day of month. */
  endDay: number;
};

/** Live event months and date ranges from the wiki event list. */
export const SEASONAL_EVENTS: readonly SeasonalEvent[] = [
  { id: "valentines", name: "Valentines Event", month: 2, startDay: 1, endDay: 28 },
  { id: "easter", name: "Easter Event", month: 4, startDay: 1, endDay: 30 },
  { id: "magma", name: "Magma Event", month: 6, startDay: 1, endDay: 30 },
  { id: "summer", name: "Summer Event", month: 8, startDay: 1, endDay: 31 },
  { id: "halloween", name: "Halloween Event", month: 10, startDay: 1, endDay: 31 },
  { id: "christmas", name: "Christmas Event", month: 12, startDay: 1, endDay: 31 },
] as const;

const EVENT_BY_MONTH = new Map(SEASONAL_EVENTS.map((e) => [e.month, e]));

export type ActiveSeasonalEvent = {
  event: SeasonalEvent;
  /** True on odd months when the previous event's icons are used as fallback. */
  isFallback: boolean;
};

/** Calendar month of the most recent event before `month` (1–12). */
function previousEventMonth(month: number): number {
  if (month === 1) return 12;
  return month - 1;
}

/** Resolve icons for a date: live event month, or previous event on off months. */
export function getActiveSeasonalEvent(date: Date = new Date()): ActiveSeasonalEvent {
  const month = date.getMonth() + 1;
  if (month % 2 === 0) {
    const event = EVENT_BY_MONTH.get(month)!;
    return { event, isFallback: false };
  }
  const event = EVENT_BY_MONTH.get(previousEventMonth(month))!;
  return { event, isFallback: true };
}

/** Next live event after `date` (used when no event is currently active). */
export function getNextSeasonalEvent(date: Date = new Date()): { event: SeasonalEvent; startsAt: Date } {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  let nextMonth: number;
  let startYear = year;

  if (month % 2 === 1) {
    nextMonth = month + 1;
  } else {
    nextMonth = month + 2;
    if (nextMonth > 12) {
      nextMonth = 2;
      startYear = year + 1;
    }
  }

  const event = EVENT_BY_MONTH.get(nextMonth)!;
  return {
    event,
    startsAt: new Date(startYear, nextMonth - 1, event.startDay),
  };
}

export function formatSeasonalEventStartDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function isSeasonalEventMonth(date: Date = new Date()): boolean {
  const month = date.getMonth() + 1;
  return month % 2 === 0 && EVENT_BY_MONTH.has(month);
}

/** Generic fallback sprites used outside event months and when seasonal files are missing. */
export const GENERIC_EVENT_SPRITES = {
  eventButton: "sprites/event/event_button.png",
  currency: (tier: number) => `sprites/event/currency_${tier}.png`,
} as const;

/** Local sprite paths under `public/sprites/event/` (snake_case wiki names). */
export const SEASONAL_SPRITE_PATHS = {
  eventButton: (id: SeasonalEventId) => `sprites/event/event_button_${id}.png`,
  currency: (id: SeasonalEventId, tier: number) => `sprites/event/${id}_currency_${tier}.png`,
  skinIcon: (id: SeasonalEventId) => `sprites/event/${id}_skin_icon.png`,
  upgrade: (id: SeasonalEventId, kind: SeasonalUpgradeKind) => `sprites/event/${id}_upgrade_${kind}.png`,
} as const;

/** Upgrade icon kinds mirrored from wiki CurrentEventImages (one themed set per event). */
export const SEASONAL_UPGRADE_KINDS = [
  "atk_dmg",
  "atk_speed",
  "block_chance",
  "caps",
  "crit_chance",
  "crit_dmg",
  "enemy_atk_dmg",
  "enemy_atk_speed",
  "event_speed",
  "extra_currency",
  "max_hp",
  "move_speed",
  "prestige_bonus",
] as const;

export type SeasonalUpgradeKind = (typeof SEASONAL_UPGRADE_KINDS)[number];

/** All seasonal sprite paths the web app can use (for asset audits). */
export function listExpectedSeasonalSpritePaths(): string[] {
  const paths: string[] = [];
  for (const event of SEASONAL_EVENTS) {
    paths.push(SEASONAL_SPRITE_PATHS.eventButton(event.id));
    for (let tier = 1; tier <= 4; tier++) {
      paths.push(SEASONAL_SPRITE_PATHS.currency(event.id, tier));
    }
    paths.push(SEASONAL_SPRITE_PATHS.skinIcon(event.id));
    for (const kind of SEASONAL_UPGRADE_KINDS) {
      paths.push(SEASONAL_SPRITE_PATHS.upgrade(event.id, kind));
    }
  }
  return paths;
}

/** Sprites required for nav + currency theming (minimum seasonal set). */
export function listRequiredSeasonalSpritePaths(): string[] {
  const paths: string[] = [];
  for (const event of SEASONAL_EVENTS) {
    paths.push(SEASONAL_SPRITE_PATHS.eventButton(event.id));
    for (let tier = 1; tier <= 4; tier++) {
      paths.push(SEASONAL_SPRITE_PATHS.currency(event.id, tier));
    }
  }
  return paths;
}
