// Conflict-aware greedy tree optimizer for Tarkov weapon builds.
//
// Each mod in tarkov.dev has a `conflictingItems` array — items that cannot
// be installed on the same weapon at the same time (e.g. an underbarrel
// grenade launcher conflicts with handguards that extend over the barrel).
//
// Strategy:
// - Within a single sub-tree (one top-level slot and all its descendants),
//   use tree DP: for each candidate mod, recursively find the best config
//   of its sub-slots, sum scores, pick the winner.
// - Conflicts propagate down the recursion: sibling sub-slots under the
//   same chosen mod see the items picked by earlier siblings, so an
//   already-chosen mod blocks its conflicts further down.
// - Between top-level slots, commit the winning sub-tree's picks before
//   evaluating the next top-level slot. Handles cross-slot conflicts like
//   handguard vs. underbarrel grenade launcher.
//
// This is not globally optimal (the order of top-level slots affects which
// conflicts win), but it produces buildable configurations and tends to
// pick the highest-scoring mod first when conflicts are rare.

// Scope, sight, and magazine slots are skipped by default — players usually
// have strong personal preferences there (zoom level, mag capacity) that
// an optimizer shouldn't override. The caller can pass a custom `skipSlot`
// predicate if they want different behavior.
const DEFAULT_SKIP = /scope|sight|magazine/i;
function defaultSkipSlot(nameId) {
  return DEFAULT_SKIP.test(nameId || "");
}

function scoreMod(mp, mode) {
  if (!mp) return 0;
  if (mode === "ergo") return mp.ergonomics || 0;
  if (mode === "recoil-balanced") {
    // Heavy recoil emphasis with soft penalties for ergo / accuracy loss.
    // Recoil and accuracy come through the API as decimals (-0.20 = -20%),
    // so scaling them by 100 puts all three axes on a roughly comparable
    // "points" scale: 1 recoil% ≈ 1 ergo point ≈ 1 accuracy%. A mod that
    // buys 20% recoil reduction for a 20-point ergo hit nets zero, while
    // a mod that buys 10% recoil cleanly nets +10 and wins.
    const rec = -(mp.recoilModifier || 0) * 100;
    const ergo = mp.ergonomics || 0;
    const acc = (mp.accuracyModifier || 0) * 100;
    return rec + ergo + acc;
  }
  return -(mp.recoilModifier || 0);
}

function isCompatible(item, chosenIds, conflictPool) {
  if (conflictPool.has(item.id)) return false;
  const cis = item.conflictingItems;
  if (cis) {
    for (const c of cis) {
      if (chosenIds.has(c.id)) return false;
    }
  }
  return true;
}

/**
 * Recursively find the best config for one slot's sub-tree. Returns
 * { score, mods, picked } where `mods` maps paths to IDs and `picked` is
 * the list of chosen items (needed so the caller can propagate conflicts).
 * `chosenIds` and `conflictPool` are read-only snapshots at this call;
 * sub-slot traversal within the chosen branch maintains its own mutable
 * copies so siblings can see each other's picks.
 */
function optimizeSubtree(slot, path, mode, chosenIds, conflictPool, skipSlot) {
  if (skipSlot(slot.nameId)) return { score: 0, mods: {}, picked: [] };
  const items = slot?.filters?.allowedItems || [];
  if (items.length === 0) return { score: 0, mods: {}, picked: [] };

  let best = slot.required
    ? { score: -Infinity, mods: {}, picked: [] }
    : { score: 0, mods: {}, picked: [] };

  for (const item of items) {
    if (!isCompatible(item, chosenIds, conflictPool)) continue;

    // Start a local snapshot for this candidate's sub-tree so siblings
    // under this mod can see each other's picks.
    const localChosen = new Set(chosenIds);
    localChosen.add(item.id);
    const localConflicts = new Set(conflictPool);
    if (item.conflictingItems) {
      for (const c of item.conflictingItems) localConflicts.add(c.id);
    }

    let subScore = 0;
    const subMods = { [path]: item.id };
    const subPicked = [item];
    const subSlots = item.properties?.slots || [];
    for (const sub of subSlots) {
      const subPath = `${path}.${sub.nameId}`;
      const subBest = optimizeSubtree(sub, subPath, mode, localChosen, localConflicts, skipSlot);
      subScore += subBest.score;
      Object.assign(subMods, subBest.mods);
      for (const m of subBest.picked) {
        subPicked.push(m);
        localChosen.add(m.id);
        if (m.conflictingItems) {
          for (const c of m.conflictingItems) localConflicts.add(c.id);
        }
      }
    }

    const total = scoreMod(item.properties, mode) + subScore;
    if (total > best.score) {
      best = { score: total, mods: subMods, picked: subPicked };
    }
  }
  return best;
}

/**
 * Given a full weapon detail object (from weaponDetailQ with
 * conflictingItems in the query) and a mode ("recoil" | "ergo"), return a
 * `mods` object compatible with BuildsTab's state: `{ [slotPath]: modItemId }`.
 *
 * Top-level slots are processed in descending order of their unconstrained
 * max score, so the slot with the biggest potential wins when its top
 * choice conflicts with another slot's top choice. E.g., if an underbarrel
 * grenade launcher has a larger recoil reduction than any handguard offers
 * directly, the underbarrel slot is filled first and the handguard is
 * forced to skip any mod that conflicts with the launcher.
 */
export function optimizeBuild(weapon, mode, options = {}) {
  const { currentMods = {}, skipSlot = defaultSkipSlot } = options;
  const slots = weapon?.properties?.slots || [];

  // Pre-compute each slot's best unconstrained score (skipped slots are
  // already filtered inside optimizeSubtree and return 0).
  const EMPTY = Object.freeze(new Set());
  const ranked = slots
    .filter((slot) => !skipSlot(slot.nameId))
    .map((slot) => ({
      slot,
      maxScore: optimizeSubtree(slot, slot.nameId, mode, EMPTY, EMPTY, skipSlot).score,
    }));
  ranked.sort((a, b) => b.maxScore - a.maxScore);

  const result = {};
  const chosenIds = new Set();
  const conflictPool = new Set();

  for (const { slot } of ranked) {
    const { mods, picked } = optimizeSubtree(slot, slot.nameId, mode, chosenIds, conflictPool, skipSlot);
    Object.assign(result, mods);
    for (const m of picked) {
      chosenIds.add(m.id);
      if (m.conflictingItems) {
        for (const c of m.conflictingItems) conflictPool.add(c.id);
      }
    }
  }

  // Preserve the user's current picks for any skipped slot — e.g., their
  // chosen scope or magazine — whether top-level or nested under another
  // slot's path.
  for (const [path, id] of Object.entries(currentMods)) {
    const segments = path.split(".");
    const leaf = segments[segments.length - 1];
    if (skipSlot(leaf)) {
      result[path] = id;
    }
  }

  return result;
}
