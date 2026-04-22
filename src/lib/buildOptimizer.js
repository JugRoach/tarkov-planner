import PRECOMPUTED_BUILDS from "../data/precomputed-builds.json";

// Conflict-aware branch-and-bound optimizer for Tarkov weapon builds.
//
// Each mod in tarkov.dev has a `conflictingItems` array — items that cannot
// be installed on the same weapon at the same time (e.g. an underbarrel
// grenade launcher conflicts with handguards that extend over the barrel).
//
// Two B&B variants live in this file:
//
// 1. `optimizeSlots` (scalar) — used by "ergo" and "recoil" modes. For each
//    slot tries "skip" (if optional) and every compatible candidate; for
//    each pick recurses into the candidate's sub-slots. Partial scores are
//    additive and pruned via a per-slot upper bound (unconstrained per-item
//    max sum over the subtree) and UB-sorted slot order. Globally optimal
//    given its scalar scoring function.
//
// 2. `optimizeTargeted` (two-axis) — used by "recoil-balanced" mode. Tracks
//    `(totalRecoil, totalErgo)` separately through a flat dynamic-stack DFS.
//    The objective is whole-build, not additive per mod:
//        score = totalRecoil - BAL_ERGO_PENALTY × max(0, target - totalErgo)
//    where `target` is half the weapon's max achievable ergo (computed via
//    an OPT ERGO pass first). The penalty is asymmetric: below target hurts,
//    above target is free, so the optimizer chases target-ergo-then-recoil
//    rather than blindly maximizing both. This formulation finds
//    Pareto-interior builds that no weighted-sum scalarization could ever
//    pick.

// Scope, sight, and magazine slots are skipped by default — players usually
// have strong personal preferences there (zoom level, mag capacity) that
// an optimizer shouldn't override. The caller can pass a custom `skipSlot`
// predicate if they want different behavior.
const DEFAULT_SKIP = /scope|sight|magazine/i;
function defaultSkipSlot(nameId) {
  return DEFAULT_SKIP.test(nameId || "");
}

// Legacy weight for the deprecated weighted-sum formulation of
// "recoil-balanced". Unused by the new target-based optimizer but kept at
// 1.0 as a neutral baseline in case anything still calls scoreMod with
// mode="recoil-balanced".
const BAL_RECOIL_WEIGHT = 1.0;

// How many recoil points are forfeited per 1 ergo below target. λ=1 means
// a mod buying 1% recoil reduction (1 pt) must close at least 1 ergo of
// target-gap to be worth taking. Tune upward to tighten the target band.
const BAL_ERGO_PENALTY = 1.0;

function scoreMod(mp, mode) {
  if (!mp) return 0;
  if (mode === "ergo") return mp.ergonomics || 0;
  if (mode === "recoil-balanced") {
    const rec = -(mp.recoilModifier || 0) * 100 * BAL_RECOIL_WEIGHT;
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

const EMPTY_SET = Object.freeze(new Set());

// Admissible upper bound on the score a slot can contribute, ignoring all
// conflicts. Computed as the per-item-max recursion over the subtree: at
// each slot pick the item with the highest (score + sum of sub-UBs).
// Memoized on the slot object identity.
function ubForSlot(slot, ctx) {
  if (ctx.skipSlot(slot.nameId)) return 0;
  if (ctx.ubCache.has(slot)) return ctx.ubCache.get(slot);
  const items = slot?.filters?.allowedItems || [];
  if (items.length === 0) {
    ctx.ubCache.set(slot, 0);
    return 0;
  }
  let maxItemUB = slot.required ? -Infinity : 0;
  for (const item of items) {
    if (ctx.isAvailable && !ctx.isAvailable(item)) continue;
    let total = scoreMod(item.properties, ctx.mode);
    const subSlots = item.properties?.slots || [];
    for (const sub of subSlots) total += ubForSlot(sub, ctx);
    if (total > maxItemUB) maxItemUB = total;
  }
  ctx.ubCache.set(slot, maxItemUB);
  return maxItemUB;
}

// Greedy subtree evaluator — used only to seed scalar B&B with a
// non-trivial lower bound. Depth-first, natural sibling order; not
// guaranteed optimal when conflicts appear between siblings or across
// slots.
function greedySubtree(slot, path, ctx, chosenIds, conflictPool) {
  if (ctx.skipSlot(slot.nameId)) return { score: 0, mods: {}, picked: [] };
  const items = slot?.filters?.allowedItems || [];
  if (items.length === 0) return { score: 0, mods: {}, picked: [] };

  let best = slot.required
    ? { score: -Infinity, mods: {}, picked: [] }
    : { score: 0, mods: {}, picked: [] };

  for (const item of items) {
    if (ctx.isAvailable && !ctx.isAvailable(item)) continue;
    if (!isCompatible(item, chosenIds, conflictPool)) continue;

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
      const subBest = greedySubtree(sub, subPath, ctx, localChosen, localConflicts);
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

    const total = scoreMod(item.properties, ctx.mode) + subScore;
    if (total > best.score) {
      best = { score: total, mods: subMods, picked: subPicked };
    }
  }
  return best;
}

// Greedy fill over a list of slots, UB-sorted. Produces a valid
// configuration used as the B&B seed.
function greedyFillSlots(active, pathPrefix, ctx, initialChosen, initialConflicts) {
  let score = 0;
  const mods = {};
  const picked = [];
  const chosenIds = new Set(initialChosen);
  const conflictPool = new Set(initialConflicts);

  for (const slot of active) {
    const path = pathPrefix ? `${pathPrefix}.${slot.nameId}` : slot.nameId;
    const sub = greedySubtree(slot, path, ctx, chosenIds, conflictPool);
    if (sub.score === -Infinity) return { score: -Infinity, mods: {}, picked: [] };
    score += sub.score;
    Object.assign(mods, sub.mods);
    for (const m of sub.picked) {
      picked.push(m);
      chosenIds.add(m.id);
      if (m.conflictingItems) {
        for (const c of m.conflictingItems) conflictPool.add(c.id);
      }
    }
  }
  return { score, mods, picked };
}

// Scalar B&B over a list of slots. For each slot, try skipping (if not
// required) and every compatible candidate; for each candidate, recurse
// into its sub-slots. Prune when the best-case completion can't beat the
// current best.
function optimizeSlots(slots, pathPrefix, ctx, initialChosen, initialConflicts) {
  const active = slots
    .filter((s) => !ctx.skipSlot(s.nameId) && (s?.filters?.allowedItems?.length > 0))
    .slice()
    .sort((a, b) => ubForSlot(b, ctx) - ubForSlot(a, ctx));

  if (active.length === 0) return { score: 0, mods: {}, picked: [] };

  const ubs = active.map((s) => ubForSlot(s, ctx));
  const suffixUB = new Array(active.length + 1).fill(0);
  for (let i = active.length - 1; i >= 0; i--) {
    suffixUB[i] = suffixUB[i + 1] + ubs[i];
  }

  let best = greedyFillSlots(active, pathPrefix, ctx, initialChosen, initialConflicts);

  function dfs(i, curScore, curMods, curPicked, curChosen, curConflicts) {
    if (curScore + suffixUB[i] <= best.score) return;
    if (i === active.length) {
      if (curScore > best.score) {
        best = { score: curScore, mods: curMods, picked: curPicked };
      }
      return;
    }
    const slot = active[i];
    const path = pathPrefix ? `${pathPrefix}.${slot.nameId}` : slot.nameId;

    if (!slot.required) {
      dfs(i + 1, curScore, curMods, curPicked, curChosen, curConflicts);
    }

    const items = slot.filters.allowedItems;
    const compatible = [];
    for (const it of items) {
      if (ctx.isAvailable && !ctx.isAvailable(it)) continue;
      if (!isCompatible(it, curChosen, curConflicts)) continue;
      compatible.push(it);
    }
    compatible.sort(
      (a, b) => scoreMod(b.properties, ctx.mode) - scoreMod(a.properties, ctx.mode)
    );

    for (const it of compatible) {
      const newChosen = new Set(curChosen);
      newChosen.add(it.id);
      const newConflicts = new Set(curConflicts);
      if (it.conflictingItems) {
        for (const c of it.conflictingItems) newConflicts.add(c.id);
      }

      const subSlots = it.properties?.slots || [];
      const subBest = optimizeSlots(subSlots, path, ctx, newChosen, newConflicts);
      if (subBest.score === -Infinity) continue;

      for (const m of subBest.picked) {
        newChosen.add(m.id);
        if (m.conflictingItems) {
          for (const c of m.conflictingItems) newConflicts.add(c.id);
        }
      }

      const itemScore = scoreMod(it.properties, ctx.mode);
      dfs(
        i + 1,
        curScore + itemScore + subBest.score,
        { ...curMods, [path]: it.id, ...subBest.mods },
        [...curPicked, it, ...subBest.picked],
        newChosen,
        newConflicts
      );
    }
  }

  dfs(0, 0, {}, [], initialChosen, initialConflicts);
  return best;
}

// ---- Target-ergo (two-axis) optimizer for "recoil-balanced" mode ----

function recoilContrib(mp) {
  return -(mp?.recoilModifier || 0) * 100;
}

function ergoContrib(mp) {
  return mp?.ergonomics || 0;
}

// Sum a build's total ergo from the weapon's base ergo plus each picked
// mod's contribution, walking the mod tree via the mods map's keyed paths.
function computeTotalErgo(weapon, mods) {
  let total = weapon?.properties?.ergonomics || 0;
  const walk = (slots, prefix) => {
    if (!slots) return;
    for (const slot of slots) {
      const path = prefix ? `${prefix}.${slot.nameId}` : slot.nameId;
      const modId = mods[path];
      if (!modId) continue;
      const mod = slot.filters?.allowedItems?.find((i) => i.id === modId);
      if (!mod) continue;
      total += mod.properties?.ergonomics || 0;
      if (mod.properties?.slots) walk(mod.properties.slots, path);
    }
  };
  walk(weapon?.properties?.slots || [], "");
  return total;
}

// Same walk for recoil — needed to seed optimizeTargeted with OPT ERGO's
// score under the target-ergo objective.
function computeTotalRecoil(weapon, mods) {
  let total = 0;
  const walk = (slots, prefix) => {
    if (!slots) return;
    for (const slot of slots) {
      const path = prefix ? `${prefix}.${slot.nameId}` : slot.nameId;
      const modId = mods[path];
      if (!modId) continue;
      const mod = slot.filters?.allowedItems?.find((i) => i.id === modId);
      if (!mod) continue;
      total += recoilContrib(mod.properties);
      if (mod.properties?.slots) walk(mod.properties.slots, path);
    }
  };
  walk(weapon?.properties?.slots || [], "");
  return total;
}


// Target-ergo optimizer: flat-stack B&B maximizing recoil reduction
// subject to a hard ergo floor (total ergo >= target). Reuses the same
// conflict-aware, dual-axis UB infrastructure as the old 2-axis B&B, but
// with a SCALAR objective (max recoil, so UB is tight) and an added
// feasibility prune (infeasible branches get cut outright). The
// combination of tight R pruning + hard feasibility check prunes
// aggressively even on conflict-heavy weapons.
//
// Why a hard floor rather than a soft penalty: matches the stated
// methodology ("best recoil while ergo stays near half the max"), and
// feasibility pruning kills whole subtrees whose max achievable ergo
// can't reach the floor — much more effective than merely downweighting
// them.

function optimizeTargeted(weapon, ctx, targetTotalErgo) {
  const baseErgo = weapon?.properties?.ergonomics || 0;
  const targetModErgo = targetTotalErgo - baseErgo;
  const topSlots = weapon?.properties?.slots || [];

  // Per-slot scalar UBs for both R (what we maximize) and E (for
  // feasibility). Reuse the existing scalar ubForSlot by constructing
  // two throwaway contexts pointing at independent caches.
  const rCtx = { ...ctx, mode: "recoil", ubCache: new WeakMap() };
  const eCtx = { ...ctx, mode: "ergo", ubCache: new WeakMap() };

  const stack = [];
  for (const s of topSlots) {
    if (ctx.skipSlot(s.nameId)) continue;
    if (!(s?.filters?.allowedItems?.length > 0)) continue;
    stack.push({ slot: s, pathPrefix: "" });
  }
  // LIFO: highest-R-UB slot processed first so a promising solution
  // surfaces early and tightens the bound.
  stack.sort((a, b) => ubForSlot(a.slot, rCtx) - ubForSlot(b.slot, rCtx));

  let restR = 0;
  let restE = 0;
  for (const e of stack) {
    restR += ubForSlot(e.slot, rCtx);
    restE += ubForSlot(e.slot, eCtx);
  }

  // Infeasibility: even with every max-ergo pick we can't reach target.
  // Shouldn't happen when target = max_ergo/2 but guard anyway.
  if (restE < targetModErgo) return null;

  let best = {
    score: -Infinity,
    mods: {},
    picked: [],
    totalRecoil: 0,
    totalErgo: baseErgo,
  };

  function dfs(curR, curE, curMods, curPicked, curChosen, curConflicts) {
    // Recoil UB: can we beat current best?
    if (curR + restR <= best.score) return;
    // Feasibility UB: can we still reach target ergo?
    if (curE + restE < targetModErgo) return;

    if (stack.length === 0) {
      if (curE >= targetModErgo && curR > best.score) {
        best = {
          score: curR,
          mods: curMods,
          picked: curPicked,
          totalRecoil: curR,
          totalErgo: baseErgo + curE,
        };
      }
      return;
    }

    const top = stack.pop();
    const slot = top.slot;
    const path = top.pathPrefix ? `${top.pathPrefix}.${slot.nameId}` : slot.nameId;
    const slotUR = ubForSlot(slot, rCtx);
    const slotUE = ubForSlot(slot, eCtx);
    restR -= slotUR;
    restE -= slotUE;

    if (!slot.required) {
      dfs(curR, curE, curMods, curPicked, curChosen, curConflicts);
    }

    const items = slot.filters.allowedItems;
    const compatible = [];
    for (const it of items) {
      if (ctx.isAvailable && !ctx.isAvailable(it)) continue;
      if (!isCompatible(it, curChosen, curConflicts)) continue;
      compatible.push(it);
    }
    // Sort by recoil contribution desc so a high-recoil build surfaces
    // early and tightens the bound for later pruning.
    compatible.sort(
      (a, b) => recoilContrib(b.properties) - recoilContrib(a.properties)
    );

    for (const it of compatible) {
      const newChosen = new Set(curChosen);
      newChosen.add(it.id);
      const newConflicts = new Set(curConflicts);
      if (it.conflictingItems) {
        for (const c of it.conflictingItems) newConflicts.add(c.id);
      }

      const itemR = recoilContrib(it.properties);
      const itemE = ergoContrib(it.properties);

      // Push sub-slots of this candidate.
      const subSlots = it.properties?.slots || [];
      const pushed = [];
      for (const s of subSlots) {
        if (ctx.skipSlot(s.nameId)) continue;
        if (!(s?.filters?.allowedItems?.length > 0)) continue;
        pushed.push({ slot: s, pathPrefix: path });
      }
      pushed.sort((a, b) => ubForSlot(a.slot, rCtx) - ubForSlot(b.slot, rCtx));
      for (const entry of pushed) {
        stack.push(entry);
        restR += ubForSlot(entry.slot, rCtx);
        restE += ubForSlot(entry.slot, eCtx);
      }

      dfs(
        curR + itemR,
        curE + itemE,
        { ...curMods, [path]: it.id },
        [...curPicked, it],
        newChosen,
        newConflicts
      );

      // Unwind.
      for (let j = 0; j < pushed.length; j++) {
        const entry = stack.pop();
        restR -= ubForSlot(entry.slot, rCtx);
        restE -= ubForSlot(entry.slot, eCtx);
      }
    }

    stack.push(top);
    restR += slotUR;
    restE += slotUE;
  }

  dfs(0, 0, {}, [], EMPTY_SET, EMPTY_SET);
  return best.score === -Infinity ? null : best;
}

/**
 * Given a full weapon detail object (from weaponDetailQ with
 * conflictingItems in the query) and a mode ("recoil" | "ergo" |
 * "recoil-balanced"), return a `mods` object compatible with BuildsTab's
 * state: `{ [slotPath]: modItemId }`.
 *
 * "ergo" and "recoil" use the scalar B&B with additive scoring.
 * "recoil-balanced" runs OPT ERGO first to find the weapon's max
 * achievable ergo, sets target = max_ergo / 2, then runs the two-axis
 * B&B to maximize recoil reduction while penalizing ergo below target.
 *
 * Skipped slots (scope/sight/magazine by default) are never touched; if
 * the caller provides `currentMods`, their picks for those slots are
 * preserved in the result.
 */
export function optimizeBuild(weapon, mode, options = {}) {
  const { currentMods = {}, skipSlot = defaultSkipSlot, isAvailable = null } = options;
  const slots = weapon?.properties?.slots || [];

  // Fast path: look up a precomputed globally-optimal build. Precomputed
  // results ignore trader-level availability (they're global optima over
  // every mod), so we skip this path when the caller passes isAvailable
  // and let the B&B run with the user's filter. Rerun scripts/precompute-
  // builds.mjs after game balance patches or scoring-constant changes.
  if (!isAvailable && weapon?.id) {
    const precomputed = PRECOMPUTED_BUILDS[weapon.id]?.modes?.[mode];
    if (precomputed) {
      const result = { ...precomputed };
      for (const [path, id] of Object.entries(currentMods)) {
        const segments = path.split(".");
        const leaf = segments[segments.length - 1];
        if (skipSlot(leaf)) {
          result[path] = id;
        }
      }
      return result;
    }
  }

  let mods;
  if (mode === "recoil-balanced") {
    // Phase 1: find max achievable ergo via scalar B&B.
    const ergoCtx = {
      mode: "ergo",
      skipSlot,
      isAvailable,
      ubCache: new WeakMap(),
    };
    const ergoResult = optimizeSlots(slots, "", ergoCtx, EMPTY_SET, EMPTY_SET);
    const maxErgo = computeTotalErgo(weapon, ergoResult.mods);
    const target = maxErgo / 2;

    // Phase 2: DP-over-ergo with target-ergo objective + conflict resolution.
    const ctx = {
      skipSlot,
      isAvailable,
      ergoPenalty: BAL_ERGO_PENALTY,
    };
    const targeted = optimizeTargeted(weapon, ctx, target);
    mods = targeted ? targeted.mods : ergoResult.mods;
  } else {
    const ctx = {
      mode,
      skipSlot,
      isAvailable,
      ubCache: new WeakMap(),
    };
    mods = optimizeSlots(slots, "", ctx, EMPTY_SET, EMPTY_SET).mods;
  }

  const result = { ...mods };

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
