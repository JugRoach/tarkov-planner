// Pure stat-aggregation for a weapon build. Given a full weapon detail
// (from weaponDetailQ) and a mods map ({slotPath: modItemId}), walks the
// slot tree, sums each mod's contributions, and returns the rolled-up
// stats used by both the BuildsTab editor and the Phase-2 leaderboard.

export function getCheapestPrice(item) {
  if (!item?.buyFor?.length) return null;
  const sorted = [...item.buyFor].sort(
    (a, b) => (a.priceRUB || Infinity) - (b.priceRUB || Infinity)
  );
  return sorted[0];
}

const EMPTY_STATS = Object.freeze({
  ergo: 0, recoilV: 0, recoilH: 0, weight: 0, accMod: 0, magCapacity: 0,
  fireRate: 0, fireModes: [], sightingRange: 0, zoomLevels: [],
  deviationMax: 0, centerOfImpact: 0, loudness: 0, velocity: 0,
  loadMod: 0, checkMod: 0, malfChance: 0, totalCost: 0, modCount: 0,
  effectiveDist: 0, convergence: 0,
});

export function calcStats(weapon, mods) {
  if (!weapon) return { ...EMPTY_STATS };
  const wp = weapon.properties;
  const m = mods || {};
  let ergo = wp.ergonomics || 0;
  let recoilMod = 0;
  let accMod = 0;
  let weight = weapon.weight || 0;
  let magCapacity = 0;
  let sightingRange = wp.sightingRange || 0;
  let zoomLevels = [];
  let deviationMax = 0;
  let centerOfImpact = wp.centerOfImpact || 0;
  let loudness = 0;
  let velocity = 0;
  let loadMod = 0;
  let checkMod = 0;
  let malfChance = 0;
  let totalCost = 0;
  let modCount = 0;

  const wpPrice = getCheapestPrice(weapon);
  if (wpPrice) totalCost += wpPrice.priceRUB || 0;

  const walk = (slots, pathPrefix) => {
    if (!slots) return;
    for (const slot of slots) {
      const path = pathPrefix ? `${pathPrefix}.${slot.nameId}` : slot.nameId;
      const modId = m[path];
      if (!modId) continue;
      const mod = slot.filters?.allowedItems?.find((i) => i.id === modId);
      if (!mod) continue;
      const mp = mod.properties;
      modCount++;
      if (mp?.ergonomics) ergo += mp.ergonomics;
      if (mp?.recoilModifier) recoilMod += mp.recoilModifier;
      if (mp?.accuracyModifier) accMod += mp.accuracyModifier;
      if (mod.weight) weight += mod.weight;
      if (mod.velocity) velocity += mod.velocity;
      if (mod.loudness) loudness += mod.loudness;
      if (mp?.capacity) magCapacity = mp.capacity;
      if (mp?.loadModifier) loadMod = mp.loadModifier;
      if (mp?.ammoCheckModifier) checkMod = mp.ammoCheckModifier;
      if (mp?.malfunctionChance) malfChance = mp.malfunctionChance;
      if (mp?.sightingRange && mp.sightingRange > sightingRange) sightingRange = mp.sightingRange;
      if (mp?.zoomLevels?.length) zoomLevels = mp.zoomLevels;
      if (mp?.deviationMax) deviationMax = mp.deviationMax;
      if (mp?.centerOfImpact) centerOfImpact = mp.centerOfImpact;
      const modPrice = getCheapestPrice(mod);
      if (modPrice) totalCost += modPrice.priceRUB || 0;
      if (mp?.slots) walk(mp.slots, path);
    }
  };
  walk(wp.slots, "");

  return {
    ergo: Math.round(ergo),
    recoilV: Math.round((wp.recoilVertical || 0) * (1 + recoilMod)),
    recoilH: Math.round((wp.recoilHorizontal || 0) * (1 + recoilMod)),
    weight: Math.round(weight * 100) / 100,
    accMod: Math.round(accMod * 100),
    magCapacity,
    fireRate: wp.fireRate || 0,
    fireModes: wp.fireModes || [],
    sightingRange,
    zoomLevels,
    deviationMax,
    centerOfImpact: Math.round(centerOfImpact * 100) / 100,
    loudness,
    velocity: Math.round(velocity),
    loadMod: Math.round(loadMod * 100),
    checkMod: Math.round(checkMod * 100),
    malfChance: Math.round(malfChance * 100),
    totalCost,
    modCount,
    effectiveDist: wp.effectiveDistance || 0,
    convergence: wp.convergence || 0,
  };
}
