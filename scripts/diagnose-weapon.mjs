// Quick diagnostic on a single weapon's mod tree — counts items, conflict
// pairs, and items-involved-in-conflicts. Tells us what kind of conflict
// graph we're up against for algorithmic choice.
//
// Usage: node scripts/diagnose-weapon.mjs "M4A1"

const API_URL = "https://api.tarkov.dev/graphql";
const GAME_MODE = "pve";

const WEAPONS_LIST_Q = `{ items(types: [gun]) { id name shortName } }`;

const PRICE_FRAG = `buyFor { priceRUB }`;
const CONFLICTS_FRAG = `conflictingItems { id }`;
const MOD_PROPS = `... on ItemPropertiesWeaponMod { ergonomics recoilModifier } ... on ItemPropertiesScope { ergonomics recoilModifier } ... on ItemPropertiesMagazine { ergonomics recoilModifier } ... on ItemPropertiesBarrel { ergonomics recoilModifier }`;
const MOD_FIELDS_L3 = `id name ${CONFLICTS_FRAG} properties { ${MOD_PROPS} }`;
const SLOT_FRAG = (inner) =>
  `slots { nameId filters { allowedItems { ${inner} } } }`;
const MOD_PROPS_WITH_SLOTS = (inner) =>
  `... on ItemPropertiesWeaponMod { ergonomics recoilModifier ${SLOT_FRAG(inner)} } ... on ItemPropertiesScope { ergonomics recoilModifier ${SLOT_FRAG(inner)} } ... on ItemPropertiesMagazine { ergonomics recoilModifier ${SLOT_FRAG(inner)} } ... on ItemPropertiesBarrel { ergonomics recoilModifier ${SLOT_FRAG(inner)} }`;
const MOD_FIELDS_L2 = `id name ${CONFLICTS_FRAG} properties { ${MOD_PROPS_WITH_SLOTS(MOD_FIELDS_L3)} }`;
const MOD_FIELDS_L1 = `id name ${CONFLICTS_FRAG} properties { ${MOD_PROPS_WITH_SLOTS(MOD_FIELDS_L2)} }`;
const weaponDetailQ = (id) =>
  `{ item(id: "${id}", gameMode: ${GAME_MODE}) { id name properties { ... on ItemPropertiesWeapon { slots { nameId filters { allowedItems { ${MOD_FIELDS_L1} } } } } } } }`;

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

function walkItems(slots, visit) {
  if (!slots) return;
  for (const slot of slots) {
    for (const item of slot.filters?.allowedItems || []) {
      visit(item, slot);
      walkItems(item.properties?.slots, visit);
    }
  }
}

async function main() {
  const target = process.argv[2] || "M4A1";
  console.log(`Fetching weapons list to find "${target}"...`);
  const list = await fetchAPI(WEAPONS_LIST_Q);
  const weapons = list?.items || [];
  const weapon = weapons.find(
    (w) => w.shortName === target || w.name === target
  );
  if (!weapon) {
    console.error(`No weapon found matching "${target}".`);
    process.exit(1);
  }
  console.log(`Found ${weapon.name} (${weapon.id}). Fetching full tree...`);

  const resp = await fetchAPI(weaponDetailQ(weapon.id));
  const detail = resp?.item;
  if (!detail) {
    console.error("Detail fetch returned null.");
    process.exit(1);
  }

  const slotNameIds = new Set();
  // Map id → set of slot paths this item could be picked into.
  const itemSlotPaths = new Map();
  const allItems = new Map(); // id → item
  const itemsWithConflicts = new Set();
  const conflictPairs = new Set();

  const slots = detail.properties?.slots || [];
  for (const slot of slots) slotNameIds.add(slot.nameId);

  // Walk the tree, tracking each item's possible slot paths.
  function walkWithPath(slots, prefix) {
    if (!slots) return;
    for (const slot of slots) {
      const path = prefix ? `${prefix}.${slot.nameId}` : slot.nameId;
      for (const item of slot.filters?.allowedItems || []) {
        if (!itemSlotPaths.has(item.id)) itemSlotPaths.set(item.id, new Set());
        itemSlotPaths.get(item.id).add(path);
        allItems.set(item.id, { name: item.name });
        const conflicts = item.conflictingItems || [];
        for (const c of conflicts) {
          itemsWithConflicts.add(item.id);
          itemsWithConflicts.add(c.id);
          const key = [item.id, c.id].sort().join("|");
          conflictPairs.add(key);
        }
        walkWithPath(item.properties?.slots, path);
      }
    }
  }
  walkWithPath(slots, "");

  // Classify conflicts: intra-slot (same path) vs cross-slot.
  let intraSlot = 0;
  let crossSlot = 0;
  const crossSlotPairs = [];
  for (const key of conflictPairs) {
    const [a, b] = key.split("|");
    const pathsA = itemSlotPaths.get(a) || new Set();
    const pathsB = itemSlotPaths.get(b) || new Set();
    // Intra-slot iff every possible path for A matches every possible
    // path for B (they can only live in the same slot, so picking both
    // is already impossible from slot uniqueness alone).
    let shareAllPaths = true;
    if (pathsA.size !== pathsB.size) shareAllPaths = false;
    else {
      for (const p of pathsA) if (!pathsB.has(p)) { shareAllPaths = false; break; }
    }
    if (shareAllPaths && pathsA.size > 0) {
      intraSlot++;
    } else {
      crossSlot++;
      if (crossSlotPairs.length < 15) crossSlotPairs.push([a, b]);
    }
  }

  // Build adjacency.
  const adj = new Map();
  for (const key of conflictPairs) {
    const [a, b] = key.split("|");
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  }

  // Components via BFS.
  const components = [];
  const visited = new Set();
  for (const node of adj.keys()) {
    if (visited.has(node)) continue;
    const comp = [];
    const queue = [node];
    while (queue.length) {
      const n = queue.shift();
      if (visited.has(n)) continue;
      visited.add(n);
      comp.push(n);
      for (const nb of adj.get(n) || []) {
        if (!visited.has(nb)) queue.push(nb);
      }
    }
    components.push(comp);
  }

  console.log(`\nWeapon: ${detail.name}`);
  console.log(`Top-level slots: ${slots.length}`);
  console.log(`Total items in mod tree: ${allItems.size}`);
  console.log(`Items with conflicts: ${itemsWithConflicts.size}`);
  console.log(`Unique conflict pairs: ${conflictPairs.size}`);
  console.log(`  intra-slot (redundant — DP handles): ${intraSlot}`);
  console.log(`  cross-slot (must respect): ${crossSlot}`);
  console.log(`Conflict graph components: ${components.length}`);
  if (components.length) {
    const sizes = components.map((c) => c.length).sort((a, b) => b - a);
    console.log(`Component sizes (largest first): ${sizes.join(", ")}`);
  }

  // Show a sample of CROSS-slot conflicts — these are the ones that
  // actually matter for the optimizer.
  if (crossSlotPairs.length > 0) {
    console.log(`\nCross-slot conflict pairs (sample):`);
    for (const [a, b] of crossSlotPairs) {
      const aName = allItems.get(a)?.name || a.slice(0, 8);
      const bName = allItems.get(b)?.name || b.slice(0, 8);
      const pathsA = [...(itemSlotPaths.get(a) || [])].join(",");
      const pathsB = [...(itemSlotPaths.get(b) || [])].join(",");
      console.log(`  ${aName} [${pathsA}] <-> ${bName} [${pathsB}]`);
    }
  } else {
    console.log(`\nNo cross-slot conflicts — all conflicts are within a single slot.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
