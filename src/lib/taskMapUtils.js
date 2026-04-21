// Helpers for the Task Map popout.
//   - taskColor: deterministic per-task color so the same task keeps its
//     chit color across sessions.
//   - buildObjectiveMarkers: flat marker list filtered to objectives with
//     real coordinates on the given map.
//   - tasksWithObjectivesOnMap: which active tasks have at least one
//     plottable marker (drives the task dropdown).

import { worldToPct, getObjMeta, progressKey } from "./utils.js";
import { MAP_BOUNDS } from "./mapData.js";

// Palette picked for visibility on the dark bg, avoiding red/green
// (reserved for success/error) and collisions with the gold accent.
// Twelve hues — more than a player tends to have active on one map.
export const TASK_PALETTE = [
  "#e89a4a", // orange
  "#5aa8e8", // blue
  "#c878d4", // magenta
  "#5ad4a0", // teal
  "#b89a5a", // amber
  "#a07ae8", // violet
  "#5ac8c8", // cyan
  "#e86a9e", // pink
  "#95c878", // lime
  "#e8d45a", // yellow
  "#7a9ae8", // periwinkle
  "#d47878", // rose
];

// djb2-style string hash — deterministic across sessions.
export function taskColor(taskId) {
  if (!taskId) return TASK_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    hash = ((hash << 5) - hash) + taskId.charCodeAt(i);
    hash |= 0;
  }
  return TASK_PALETTE[Math.abs(hash) % TASK_PALETTE.length];
}

const TYPE_GLYPHS = {
  visit: "\u{1F4CD}",            // 📍
  mark: "\u{1F3F7}",             // 🏷
  findQuestItem: "\u{1F4E6}",    // 📦
  giveQuestItem: "\u{1F4E6}",
  findItem: "\u{1F4E6}",
  giveItem: "\u{1F4E6}",
  sellItem: "\u{1F4E6}",
  useItem: "✋",             // ✋
  shoot: "☠",               // ☠
};

export function objectiveTypeGlyph(type) {
  return TYPE_GLYPHS[type] || "●"; // ●
}

// Objective types the tarkov.dev schema fragments with zone/location data.
// Any other type (skill, traderLevel, extract, etc.) is skipped outright.
const POSITIONAL_TYPES = new Set([
  "visit", "mark",
  "findQuestItem", "giveQuestItem",
  "findItem", "giveItem", "sellItem",
  "useItem",
  "shoot",
]);

// Normalize an objective's locations into a flat array of
// `{mapId, position}`. QuestItem objectives use `possibleLocations[]` for
// pickup spawns; others use `zones[]`. We plot only entries that have a
// concrete position — shoot zones frequently lack one, which is fine.
function locationsOf(obj) {
  const out = [];
  const zones = Array.isArray(obj?.zones) ? obj.zones : [];
  for (const z of zones) {
    if (z?.position && z?.map?.id) out.push({ mapId: z.map.id, position: z.position });
  }
  const possible = Array.isArray(obj?.possibleLocations) ? obj.possibleLocations : [];
  for (const p of possible) {
    const mapId = p?.map?.id;
    if (!mapId) continue;
    const positions = Array.isArray(p.positions) ? p.positions : [];
    for (const pos of positions) {
      if (pos) out.push({ mapId, position: pos });
    }
  }
  return out;
}

// MAP_BOUNDS keys off our normalizedName; API objectives reference
// `map.id`. Combine the two via the selected map object.
function boundsForMap(apiMap) {
  if (!apiMap?.normalizedName) return null;
  return MAP_BOUNDS[apiMap.normalizedName] || null;
}

// For the task dropdown filter — which active tasks actually have at
// least one marker we can plot on this map. Cheaper than calling
// buildObjectiveMarkers and counting.
export function tasksWithObjectivesOnMap(apiTasks, activeTaskIds, apiMap) {
  if (!apiMap?.id || !apiTasks?.length) return [];
  const bounds = boundsForMap(apiMap);
  if (!bounds) return [];
  const activeSet = new Set(activeTaskIds || []);
  const out = [];
  for (const task of apiTasks) {
    if (!activeSet.has(task.id)) continue;
    const objectives = Array.isArray(task.objectives) ? task.objectives : [];
    const hasMappable = objectives.some((obj) => {
      if (!POSITIONAL_TYPES.has(obj?.type)) return false;
      const locs = locationsOf(obj);
      return locs.some((l) => l.mapId === apiMap.id && worldToPct(l.position, bounds));
    });
    if (hasMappable) out.push(task);
  }
  return out;
}

// Flat list of chits to render. Each marker carries a stable id, the
// task's deterministic color, and a pct-space position ready for Leaflet.
export function buildObjectiveMarkers(apiTasks, selectedTaskIds, apiMap, myProfile) {
  if (!apiMap?.id || !apiTasks?.length) return [];
  const bounds = boundsForMap(apiMap);
  if (!bounds) return [];
  const selected = new Set(selectedTaskIds || []);
  const profileId = myProfile?.id;
  const progress = myProfile?.progress || {};
  const markers = [];
  for (const task of apiTasks) {
    if (!selected.has(task.id)) continue;
    const color = taskColor(task.id);
    const objectives = Array.isArray(task.objectives) ? task.objectives : [];
    for (const obj of objectives) {
      if (!POSITIONAL_TYPES.has(obj?.type)) continue;
      const meta = getObjMeta(obj);
      const done = progress[progressKey(profileId, task.id, obj.id)] || 0;
      const total = meta.total || 1;
      const complete = done >= total;
      const glyph = objectiveTypeGlyph(obj.type);
      const locs = locationsOf(obj);
      let idx = 0;
      for (const loc of locs) {
        if (loc.mapId !== apiMap.id) continue;
        const pct = worldToPct(loc.position, bounds);
        if (!pct) continue;
        markers.push({
          id: `${task.id}-${obj.id}-${idx++}`,
          taskId: task.id,
          taskName: task.name,
          objectiveId: obj.id,
          type: obj.type,
          glyph,
          color,
          pct,
          description: meta.summary || obj.description || obj.type,
          progressDone: done,
          progressTotal: total,
          complete,
          optional: !!obj.optional,
        });
      }
    }
  }
  return markers;
}
