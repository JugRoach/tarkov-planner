// Decide whether the user can currently acquire a given item, based on
// their PMC level and trader loyalty levels. An item is "available" if at
// least one of its buyFor entries is unlocked for this profile:
//   - Flea Market listing: PMC level >= 15
//   - Trader listing: profile trader level >= vendor.minTraderLevel

export const FLEA_UNLOCK_LEVEL = 15;

// Stable trader list for the profile UI. Fence omitted — his inventory
// isn't governed by loyalty levels the same way, so it makes no sense to
// track an LL for him in the availability filter.
export const TRADERS = [
  "Prapor",
  "Therapist",
  "Skier",
  "Peacekeeper",
  "Mechanic",
  "Ragman",
  "Jaeger",
];

export function isAvailableForProfile(item, profile) {
  const pmcLevel = profile?.pmcLevel ?? 1;
  const traderLevels = profile?.traderLevels || {};
  const offers = item?.buyFor;
  if (!offers?.length) return false;
  for (const bf of offers) {
    const name = bf?.vendor?.name;
    if (!name) continue;
    if (name === "Flea Market") {
      if (pmcLevel >= FLEA_UNLOCK_LEVEL) return true;
      continue;
    }
    const min = bf.vendor.minTraderLevel || 1;
    const current = traderLevels[name] || 0;
    if (current >= min) return true;
  }
  return false;
}
