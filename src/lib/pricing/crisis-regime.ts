export type CrisisTier = 0 | 1 | 2 | 3 | 4;

export interface CrisisEventInput {
  name: string;
  description?: string | null;
  impactLevel?: string | null;
  confidence?: number | null;
}

export interface CrisisRegime {
  tier: CrisisTier;
  reason: string | null;
  matchedEvents: string[];
}

interface TierPattern {
  tier: CrisisTier;
  patterns: RegExp[];
}

const TIER_PATTERNS: TierPattern[] = [
  {
    tier: 4,
    patterns: [
      /direct attack/i,
      /attack on (the )?uae/i,
      /attack on dubai/i,
      /war on (the )?uae/i,
      /military strike.*(dubai|uae|emirates)/i,
    ],
  },
  {
    tier: 3,
    patterns: [
      /travel advisory/i,
      /do not travel/i,
      /airport (shutdown|closed|suspended)/i,
      /flight suspension/i,
      /airspace closed/i,
      /evacuation/i,
    ],
  },
  {
    tier: 2,
    patterns: [
      /regional conflict/i,
      /travel warning/i,
      /flight disruption/i,
      /border closure/i,
      /missile/i,
      /geopolitical/i,
    ],
  },
  {
    tier: 1,
    patterns: [
      /currency weakness/i,
      /economic slowdown/i,
      /minor disruption/i,
      /oil price shock/i,
    ],
  },
];

function eventText(e: CrisisEventInput): string {
  return `${e.name} ${e.description ?? ""}`.trim();
}

function tierForEvent(e: CrisisEventInput): CrisisTier {
  const conf = e.confidence ?? 100;
  if (conf < 70) return 0;

  const text = eventText(e);
  for (const { tier, patterns } of TIER_PATTERNS) {
    if (patterns.some((p) => p.test(text))) return tier;
  }

  if (e.impactLevel === "high" && /disruption|conflict|advisory|warning/i.test(text)) {
    return 2;
  }

  return 0;
}

/** Detect active crisis tier from portfolio market intel (events / news). */
export function detectCrisisRegime(events: CrisisEventInput[]): CrisisRegime {
  let maxTier: CrisisTier = 0;
  const matchedEvents: string[] = [];
  const reasons: string[] = [];
  let tier3Count = 0;

  for (const e of events) {
    const tier = tierForEvent(e);
    if (tier >= 3) tier3Count += 1;
    if (tier > maxTier) {
      maxTier = tier;
      reasons.length = 0;
      reasons.push(e.name);
      matchedEvents.length = 0;
      matchedEvents.push(e.name);
    } else if (tier === maxTier && tier > 0) {
      matchedEvents.push(e.name);
      reasons.push(e.name);
    }
  }

  if (tier3Count >= 2 && maxTier < 4) {
    maxTier = 4;
    reasons.push(`${tier3Count} high-severity risk signals`);
  }

  return {
    tier: maxTier,
    reason: maxTier > 0 ? reasons.slice(0, 3).join("; ") : null,
    matchedEvents,
  };
}

export interface CrisisPriceRefs {
  listedReference: number;
  compSetP25?: number | null;
  compSetP50?: number | null;
}

/** Apply uniform crisis pricing adjustment (mirrors PriceGuard geopolitical tiers). */
export function applyCrisisAdjustment(
  price: number,
  tier: CrisisTier,
  refs: CrisisPriceRefs
): { price: number; note: string | null } {
  if (tier === 0 || price <= 0) return { price, note: null };

  switch (tier) {
    case 1: {
      const adjusted = Math.round(price * 0.95);
      return {
        price: adjusted,
        note: `[CRISIS T1] -5% defensive adjustment (minor market risk)`,
      };
    }
    case 2: {
      const softCap = refs.compSetP50 && refs.compSetP50 > 0 ? refs.compSetP50 : price * 0.9;
      const adjusted = Math.round(Math.min(price * 0.92, softCap));
      return {
        price: adjusted,
        note: `[CRISIS T2] Capped toward market p50 (${Math.round(softCap)}) — regional risk`,
      };
    }
    case 3: {
      const cap =
        refs.compSetP25 && refs.compSetP25 > 0
          ? refs.compSetP25
          : refs.compSetP50 && refs.compSetP50 > 0
            ? Math.round(refs.compSetP50 * 0.85)
            : Math.round(refs.listedReference * 0.9);
      const adjusted = Math.round(Math.min(price, cap));
      return {
        price: adjusted,
        note: `[CRISIS T3] Liquidity-first cap at ${cap} (severe travel disruption)`,
      };
    }
    case 4: {
      const cap =
        refs.compSetP25 && refs.compSetP25 > 0
          ? refs.compSetP25
          : Math.round(refs.listedReference * 0.85);
      const adjusted = Math.round(Math.min(price, cap));
      return {
        price: adjusted,
        note: `[CRISIS T4] Maximum defensive cap at ${cap} (host-market crisis)`,
      };
    }
    default:
      return { price, note: null };
  }
}