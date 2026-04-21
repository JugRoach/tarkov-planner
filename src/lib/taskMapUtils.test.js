import { describe, it, expect } from "vitest";
import {
  taskColor,
  objectiveTypeGlyph,
  buildObjectiveMarkers,
  tasksWithObjectivesOnMap,
  TASK_PALETTE,
} from "./taskMapUtils.js";

// ─── taskColor ──────────────────────────────────────────────────────────
describe("taskColor", () => {
  it("is deterministic — same id returns same color", () => {
    const a = taskColor("5b485c6a86f77419ff178ada");
    const b = taskColor("5b485c6a86f77419ff178ada");
    expect(a).toBe(b);
  });

  it("returns a color from the palette", () => {
    expect(TASK_PALETTE).toContain(taskColor("anything"));
  });

  it("usually differs across different ids (smoke test)", () => {
    const colors = new Set(
      ["aaa", "bbb", "ccc", "ddd", "eee", "fff"].map(taskColor)
    );
    expect(colors.size).toBeGreaterThan(1);
  });

  it("handles empty / null / undefined id", () => {
    expect(TASK_PALETTE).toContain(taskColor(""));
    expect(TASK_PALETTE).toContain(taskColor(null));
    expect(TASK_PALETTE).toContain(taskColor(undefined));
  });
});

// ─── objectiveTypeGlyph ─────────────────────────────────────────────────
describe("objectiveTypeGlyph", () => {
  it("returns a glyph for known types", () => {
    expect(objectiveTypeGlyph("visit")).toBeTruthy();
    expect(objectiveTypeGlyph("mark")).toBeTruthy();
    expect(objectiveTypeGlyph("findQuestItem")).toBeTruthy();
    expect(objectiveTypeGlyph("useItem")).toBeTruthy();
    expect(objectiveTypeGlyph("shoot")).toBeTruthy();
  });

  it("returns a fallback for unknown types", () => {
    expect(objectiveTypeGlyph("playerLevel")).toBe("●");
    expect(objectiveTypeGlyph(null)).toBe("●");
  });
});

// ─── buildObjectiveMarkers ──────────────────────────────────────────────
describe("buildObjectiveMarkers", () => {
  const customsMap = { id: "map-customs", normalizedName: "customs" };
  const mkProfile = () => ({ id: "me_test", tasks: [], progress: {} });

  const visitTask = {
    id: "task-visit",
    name: "Debut",
    objectives: [
      {
        id: "obj-1",
        type: "visit",
        description: "Reach the USEC camp",
        zones: [
          { id: "z1", map: { id: "map-customs" }, position: { x: 100, y: 0, z: 100 } },
          { id: "z2", map: { id: "map-customs" }, position: { x: -100, y: 0, z: -100 } },
        ],
      },
    ],
  };

  const questItemTask = {
    id: "task-questitem",
    name: "Delivery",
    objectives: [
      {
        id: "obj-2",
        type: "findQuestItem",
        count: 1,
        questItem: { name: "Package" },
        possibleLocations: [
          {
            map: { id: "map-customs" },
            positions: [
              { x: 50, y: 0, z: 50 },
              { x: 200, y: 0, z: 0 },
            ],
          },
        ],
      },
    ],
  };

  const shootTaskNoPos = {
    id: "task-shoot-nopos",
    name: "Some Kills",
    objectives: [
      {
        id: "obj-3",
        type: "shoot",
        count: 5,
        zones: [{ id: "z3", map: { id: "map-customs" } }],
      },
    ],
  };

  const shootTaskWithPos = {
    id: "task-shoot-pos",
    name: "Sniper",
    objectives: [
      {
        id: "obj-4",
        type: "shoot",
        count: 3,
        zones: [{ id: "z4", map: { id: "map-customs" }, position: { x: 0, y: 0, z: 0 } }],
      },
    ],
  };

  const wrongMapTask = {
    id: "task-wrong-map",
    name: "On Woods",
    objectives: [
      {
        id: "obj-5",
        type: "visit",
        zones: [{ id: "z5", map: { id: "map-woods" }, position: { x: 0, y: 0, z: 0 } }],
      },
    ],
  };

  const skillTask = {
    id: "task-skill",
    name: "Get skilled",
    objectives: [{ id: "obj-6", type: "skill", skillLevel: { name: "Strength", level: 5 } }],
  };

  it("returns empty when no tasks selected", () => {
    expect(buildObjectiveMarkers([visitTask], [], customsMap, mkProfile())).toEqual([]);
  });

  it("returns empty for an unknown or null map", () => {
    expect(buildObjectiveMarkers([visitTask], [visitTask.id], null, mkProfile())).toEqual([]);
    expect(
      buildObjectiveMarkers([visitTask], [visitTask.id], { id: "x", normalizedName: "nope" }, mkProfile())
    ).toEqual([]);
  });

  it("builds one marker per zone with a position", () => {
    const markers = buildObjectiveMarkers([visitTask], [visitTask.id], customsMap, mkProfile());
    expect(markers).toHaveLength(2);
    expect(markers[0].taskId).toBe("task-visit");
    expect(markers[0].pct).toBeTruthy();
  });

  it("builds markers from possibleLocations for quest items", () => {
    const markers = buildObjectiveMarkers([questItemTask], [questItemTask.id], customsMap, mkProfile());
    expect(markers).toHaveLength(2);
    expect(markers[0].taskName).toBe("Delivery");
  });

  it("skips shoot objectives whose zones carry no position", () => {
    const markers = buildObjectiveMarkers(
      [shootTaskNoPos],
      [shootTaskNoPos.id],
      customsMap,
      mkProfile()
    );
    expect(markers).toEqual([]);
  });

  it("includes shoot objectives whose zones DO have a position", () => {
    const markers = buildObjectiveMarkers(
      [shootTaskWithPos],
      [shootTaskWithPos.id],
      customsMap,
      mkProfile()
    );
    expect(markers).toHaveLength(1);
  });

  it("excludes zones that belong to a different map", () => {
    const markers = buildObjectiveMarkers(
      [wrongMapTask],
      [wrongMapTask.id],
      customsMap,
      mkProfile()
    );
    expect(markers).toEqual([]);
  });

  it("skips objective types outside the positional set", () => {
    const markers = buildObjectiveMarkers([skillTask], [skillTask.id], customsMap, mkProfile());
    expect(markers).toEqual([]);
  });

  it("assigns each task its deterministic color across all its markers", () => {
    const markers = buildObjectiveMarkers(
      [visitTask, questItemTask],
      [visitTask.id, questItemTask.id],
      customsMap,
      mkProfile()
    );
    const visitColor = taskColor(visitTask.id);
    const qiColor = taskColor(questItemTask.id);
    expect(markers.filter((m) => m.taskId === visitTask.id).every((m) => m.color === visitColor)).toBe(true);
    expect(markers.filter((m) => m.taskId === questItemTask.id).every((m) => m.color === qiColor)).toBe(true);
  });

  it("marks objectives complete when progress meets total", () => {
    const profile = {
      id: "me_test",
      tasks: [],
      // visit.total is 1; any progress >= 1 is complete.
      progress: { "me_test-task-visit-obj-1": 1 },
    };
    const markers = buildObjectiveMarkers([visitTask], [visitTask.id], customsMap, profile);
    expect(markers.every((m) => m.complete)).toBe(true);
  });
});

// ─── tasksWithObjectivesOnMap ───────────────────────────────────────────
describe("tasksWithObjectivesOnMap", () => {
  const customsMap = { id: "map-customs", normalizedName: "customs" };

  const customsTask = {
    id: "t1",
    objectives: [
      {
        id: "o1",
        type: "visit",
        zones: [{ map: { id: "map-customs" }, position: { x: 0, y: 0, z: 0 } }],
      },
    ],
  };
  const woodsTask = {
    id: "t2",
    objectives: [
      {
        id: "o2",
        type: "visit",
        zones: [{ map: { id: "map-woods" }, position: { x: 0, y: 0, z: 0 } }],
      },
    ],
  };
  const nonPositionalTask = {
    id: "t3",
    objectives: [{ id: "o3", type: "skill", skillLevel: { name: "Strength", level: 5 } }],
  };

  it("returns only tasks with markers on the queried map", () => {
    const result = tasksWithObjectivesOnMap(
      [customsTask, woodsTask, nonPositionalTask],
      ["t1", "t2", "t3"],
      customsMap
    );
    expect(result.map((t) => t.id)).toEqual(["t1"]);
  });

  it("returns empty when no tasks are active", () => {
    expect(tasksWithObjectivesOnMap([customsTask, woodsTask], [], customsMap)).toEqual([]);
  });

  it("returns empty for null map", () => {
    expect(tasksWithObjectivesOnMap([customsTask], ["t1"], null)).toEqual([]);
  });

  it("returns empty for a map with no bounds", () => {
    expect(
      tasksWithObjectivesOnMap([customsTask], ["t1"], { id: "x", normalizedName: "unknown" })
    ).toEqual([]);
  });
});
