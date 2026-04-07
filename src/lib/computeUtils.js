import { getObjMeta, progressKey } from './utils.js';

// ─── MAP RECOMMENDATION ──────────────────────────────────────
export function computeMapRecommendation(profiles, apiTasks) {
  if (!profiles?.length || !apiTasks?.length) return [];
  const mapStats = {}; // mapId -> { mapId, mapName, totalTasks, totalIncomplete, players: { pid -> { name, color, tasks: [{ taskName, remaining, total }] } } }

  profiles.forEach(profile => {
    (profile.tasks || []).forEach(({ taskId }) => {
      const apiTask = apiTasks.find(t => t.id === taskId);
      if (!apiTask?.map?.id) return;

      const objs = (apiTask.objectives || []).filter(o => !o.optional);
      const totalObjs = objs.length;
      const doneObjs = objs.filter(obj => {
        const k = `${profile.id}-${taskId}-${obj.id}`;
        return ((profile.progress || {})[k] || 0) >= getObjMeta(obj).total;
      }).length;

      if (doneObjs >= totalObjs && totalObjs > 0) return; // fully complete

      const mid = apiTask.map.id;
      if (!mapStats[mid]) mapStats[mid] = { mapId: mid, mapName: apiTask.map.name, totalTasks: 0, totalIncomplete: 0, players: {} };
      const ms = mapStats[mid];

      if (!ms.players[profile.id]) ms.players[profile.id] = { name: profile.name, color: profile.color, isMe: !profile.imported, id: profile.id, progress: profile.progress || {}, tasks: [] };
      ms.players[profile.id].tasks.push({ taskId, taskName: apiTask.name, remaining: totalObjs - doneObjs, total: totalObjs });
      ms.totalTasks++;
      ms.totalIncomplete += (totalObjs - doneObjs);
    });
  });

  return Object.values(mapStats)
    .sort((a, b) => b.totalTasks - a.totalTasks || b.totalIncomplete - a.totalIncomplete)
    .map((ms, i) => ({ ...ms, rank: i + 1, playerCount: Object.keys(ms.players).length, playerList: Object.values(ms.players) }));
}

export function computeQuickTasks(profiles, mapId, apiTasks, tasksPerPerson) {
  const result = {};
  profiles.forEach(profile => {
    const incomplete = (profile.tasks || []).filter(t => {
      const at = apiTasks?.find(x => x.id === t.taskId);
      if (!at || at.map?.id !== mapId) return false;
      const objs = (at.objectives || []).filter(o => !o.optional);
      if (!objs.length) return false;
      const done = objs.filter(obj => {
        const k = `${profile.id}-${t.taskId}-${obj.id}`;
        return ((profile.progress || {})[k] || 0) >= getObjMeta(obj).total;
      }).length;
      return done < objs.length;
    });
    result[profile.id] = incomplete.slice(0, tasksPerPerson).map(t => t.taskId);
  });
  return result;
}

// Convert item name to loot-point category tags via heuristics
export function itemNameToCategories(name) {
  const cats = [];
  const n = (name || "").toLowerCase();
  if (n.includes("gpu") || n.includes("graphics") || n.includes("circuit") || n.includes("wire") || n.includes("relay") || n.includes("tetriz") || n.includes("vpx") || n.includes("flash drive") || n.includes("ssd") || n.includes("phase") || n.includes("capacitor") || n.includes("cable") || n.includes("processor")) cats.push("Electronics");
  if (n.includes("ledx") || n.includes("ophthalmoscope") || n.includes("defib") || n.includes("salewa") || n.includes("medic") || n.includes("surv12") || n.includes("cms") || n.includes("vaseline")) cats.push("Medical supplies");
  if (n.includes("salewa") || n.includes("grizzly") || n.includes("ifak") || n.includes("afak") || n.includes("cms") || n.includes("surv")) cats.push("Meds");
  if (n.includes("stim") || n.includes("propital") || n.includes("etg") || n.includes("sj")) cats.push("Stimulant");
  if (n.includes("bolt") || n.includes("screw") || n.includes("nail") || n.includes("duct tape") || n.includes("insulating") || n.includes("bulb") || n.includes("cable") || n.includes("capacitor")) cats.push("Building material");
  if (n.includes("wrench") || n.includes("plier") || n.includes("screwdriver") || n.includes("multitool")) cats.push("Tool");
  if (n.includes("hose") || n.includes("pipe") || n.includes("motor") || n.includes("filter") || n.includes("tube") || n.includes("corrugated")) cats.push("Household goods");
  if (n.includes("fuel") || n.includes("propane") || n.includes("expeditionary")) cats.push("Fuel");
  if (n.includes("weapon") || n.includes("gun") || n.includes("rifle") || n.includes("pistol") || n.includes("ak-") || n.includes("m4a1")) cats.push("Weapon");
  if (n.includes("intel") || n.includes("folder") || n.includes("diary") || n.includes("sas drive")) cats.push("Info");
  if (n.includes("key") && !n.includes("keyboard")) cats.push("Key");
  if (n.includes("gold") || n.includes("bitcoin") || n.includes("lion") || n.includes("cat figurine") || n.includes("horse") || n.includes("chain") || n.includes("roler")) cats.push("Jewelry");
  if (n.includes("battery") || n.includes("military") || n.includes("gyro") || n.includes("power")) cats.push("Electronics");
  if (cats.length === 0) { cats.push("Barter item"); cats.push("Building material"); }
  return [...new Set(cats)].map(c => ({ name: c }));
}

// Container type → item keyword affinity for scoring
export const CONTAINER_AFFINITY = {
  "PC block": ["circuit","cpu","fan","ram","ssd","hdd","flash","drive","wire","cable","capacitor","processor","graphics","board"],
  "Toolbox": ["bolt","screw","nut","nail","wrench","plier","tape","hose","drill","clamp","pipe","tube","relay","motor","bulb","wire","cable","tool","awl","cutter"],
  "Medcase": ["bandage","medkit","saline","medicine","pills","injector","splint","tourniquet","surgical","balsam","balm","ibuprofen","analgin"],
  "Medbag SMU06": ["bandage","medkit","saline","medicine","pills","injector","splint","tourniquet","surgical","balsam","balm"],
  "Technical supply crate": ["battery","military","filter","gyro","cable","power","relay","corrugated"],
  "Drawer": ["diary","folder","intel","flash","key","chain","match","lighter","book"],
  "Jacket": ["key","match","lighter"],
  "Safe": ["roler","bitcoin","lion","gold","chain","ring","figurine"],
  "Weapon box": ["gun lube","weapon","silicone"],
};

export function computeItemRecommendation(neededItems, apiMaps) {
  if (!neededItems?.length || !apiMaps?.length) return [];
  const playable = ["customs","factory","woods","interchange","shoreline","reserve","lighthouse","streets-of-tarkov","the-lab"];

  // Build container counts per map
  const mapScores = {};
  apiMaps.filter(m => playable.includes(m.normalizedName)).forEach(m => {
    const containerCounts = {};
    (m.lootContainers || []).forEach(c => {
      const n = c.lootContainer.name;
      containerCounts[n] = (containerCounts[n] || 0) + 1;
    });
    const totalContainers = Object.values(containerCounts).reduce((a, b) => a + b, 0);

    // Score: base from total containers + bonus for containers matching needed item types
    let affinityScore = 0;
    neededItems.forEach(item => {
      const nameLower = item.name.toLowerCase();
      Object.entries(CONTAINER_AFFINITY).forEach(([containerType, keywords]) => {
        if (keywords.some(kw => nameLower.includes(kw))) {
          affinityScore += (containerCounts[containerType] || 0) * item.count;
        }
      });
    });

    mapScores[m.id] = {
      mapId: m.id, mapName: m.name,
      totalContainers,
      affinityScore,
      score: totalContainers + affinityScore * 2,
      neededItems: neededItems.map(i => ({ ...i })),
    };
  });

  return Object.values(mapScores)
    .sort((a, b) => b.score - a.score)
    .map((ms, i) => ({ ...ms, rank: i + 1 }));
}
