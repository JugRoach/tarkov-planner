// Precompute optimal weapon builds across all guns and all scoring modes.
//
// Fetches the full weapon + mod tree from tarkov.dev once, runs the
// optimizer for each (weapon × mode), and writes the result to
// src/data/precomputed-builds.json. Saves incrementally so a Ctrl-C
// doesn't lose progress.
//
// Run: npm run precompute
// Regenerate after: game balance patches, scoring constant changes
// (BAL_ERGO_PENALTY), or any change to the optimizer algorithm.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { optimizeBuild } from "../src/lib/buildOptimizer.js";

const API_URL = "https://api.tarkov.dev/graphql";
const GAME_MODE = "pve";
const MODES = ["ergo", "recoil", "recoil-balanced"];

// Query fragments — kept in sync with src/api.js. Inlined here so the
// script is self-contained and doesn't pull in constants.js / fetchAPI.
const WEAPONS_LIST_Q = `{ items(types: [gun]) { id name shortName properties { ... on ItemPropertiesWeapon { caliber } } } }`;
const PRICE_FRAG = `buyFor { price priceRUB currency vendor { ... on TraderOffer { name minTraderLevel } ... on FleaMarket { name } } }`;
const CONFLICTS_FRAG = `conflictingItems { id }`;
const MOD_PROPS = `... on ItemPropertiesWeaponMod { ergonomics recoilModifier accuracyModifier } ... on ItemPropertiesScope { ergonomics recoilModifier zoomLevels sightingRange sightModes } ... on ItemPropertiesMagazine { ergonomics recoilModifier capacity loadModifier ammoCheckModifier malfunctionChance } ... on ItemPropertiesBarrel { ergonomics recoilModifier centerOfImpact deviationCurve deviationMax }`;
const MOD_FIELDS_L3 = `id name shortName iconLink gridImageLink weight velocity loudness ${CONFLICTS_FRAG} ${PRICE_FRAG} properties { ${MOD_PROPS} }`;
const SLOT_FRAG = (inner) =>
  `slots { id name nameId required filters { allowedItems { ${inner} } } }`;
const MOD_PROPS_WITH_SLOTS = (inner) =>
  `... on ItemPropertiesWeaponMod { ergonomics recoilModifier accuracyModifier ${SLOT_FRAG(inner)} } ... on ItemPropertiesScope { ergonomics recoilModifier zoomLevels sightingRange sightModes ${SLOT_FRAG(inner)} } ... on ItemPropertiesMagazine { ergonomics recoilModifier capacity loadModifier ammoCheckModifier malfunctionChance ${SLOT_FRAG(inner)} } ... on ItemPropertiesBarrel { ergonomics recoilModifier centerOfImpact deviationCurve deviationMax ${SLOT_FRAG(inner)} }`;
const MOD_FIELDS_L2 = `id name shortName iconLink gridImageLink weight velocity loudness ${CONFLICTS_FRAG} ${PRICE_FRAG} properties { ${MOD_PROPS_WITH_SLOTS(MOD_FIELDS_L3)} }`;
const MOD_FIELDS_L1 = `id name shortName iconLink gridImageLink weight velocity loudness ${CONFLICTS_FRAG} ${PRICE_FRAG} properties { ${MOD_PROPS_WITH_SLOTS(MOD_FIELDS_L2)} }`;
const weaponDetailQ = (id) =>
  `{ item(id: "${id}", gameMode: ${GAME_MODE}) { id name shortName properties { ... on ItemPropertiesWeapon { caliber ergonomics recoilVertical recoilHorizontal fireRate fireModes slots { id name nameId required filters { allowedItems { ${MOD_FIELDS_L1} } } } } } } }`;

async function fetchAPI(query) {
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await r.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outputPath = resolve(
    __dirname,
    "..",
    "src",
    "data",
    "precomputed-builds.json"
  );
  await mkdir(dirname(outputPath), { recursive: true });

  console.log("Fetching weapons list...");
  const listData = await fetchAPI(WEAPONS_LIST_Q);
  const weapons = (listData?.items || []).filter((w) => w.properties?.caliber);
  console.log(`Found ${weapons.length} guns.\n`);

  const overallStart = Date.now();
  const result = {};

  for (let i = 0; i < weapons.length; i++) {
    const w = weapons[i];
    const label = `[${i + 1}/${weapons.length}] ${w.shortName || w.name}`;
    console.log(`${label}`);

    let detail;
    try {
      const t = Date.now();
      const resp = await fetchAPI(weaponDetailQ(w.id));
      detail = resp?.item;
      console.log(`  fetch          ${fmtMs(Date.now() - t)}`);
    } catch (e) {
      console.error(`  fetch FAILED: ${e.message}`);
      continue;
    }
    if (!detail) {
      console.warn(`  no detail returned — skipping`);
      continue;
    }

    const entry = {
      name: w.name,
      shortName: w.shortName,
      caliber: w.properties?.caliber,
      modes: {},
    };

    for (const mode of MODES) {
      const t = Date.now();
      try {
        const mods = optimizeBuild(detail, mode);
        const ms = Date.now() - t;
        entry.modes[mode] = mods;
        console.log(
          `  ${mode.padEnd(16)} ${fmtMs(ms).padEnd(8)} (${
            Object.keys(mods).length
          } slots)`
        );
      } catch (e) {
        const ms = Date.now() - t;
        console.error(
          `  ${mode.padEnd(16)} ${fmtMs(ms).padEnd(8)} FAILED: ${e.message}`
        );
      }
    }

    result[w.id] = entry;
    // Incremental save so Ctrl-C doesn't lose progress.
    await writeFile(outputPath, JSON.stringify(result, null, 2));
  }

  console.log(
    `\nDone in ${fmtMs(Date.now() - overallStart)}. Wrote ${
      Object.keys(result).length
    } weapons to ${outputPath}.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
