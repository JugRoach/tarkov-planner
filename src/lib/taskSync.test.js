import { describe, it, expect } from "vitest";
import { applyLogSyncToProfile } from "./taskSync.js";

const baseProfile = () => ({
  id: "me_test",
  name: "Test",
  tasks: [{ taskId: "existing1" }, { taskId: "existing2" }],
  progress: {},
});

describe("applyLogSyncToProfile", () => {
  it("adds active tasks that aren't already in the profile", () => {
    const p = baseProfile();
    const r = applyLogSyncToProfile(p, {
      activeTaskIds: ["new1", "new2", "existing1"],
      completedTaskIds: [],
      failedTaskIds: [],
    });
    expect(r.addedCount).toBe(2);
    const ids = r.nextProfile.tasks.map((t) => t.taskId);
    expect(ids).toEqual(expect.arrayContaining(["existing1", "existing2", "new1", "new2"]));
    expect(ids).toHaveLength(4);
  });

  it("removes tasks that appear in completedTaskIds", () => {
    const p = baseProfile();
    const r = applyLogSyncToProfile(p, {
      activeTaskIds: [],
      completedTaskIds: ["existing1"],
      failedTaskIds: [],
    });
    expect(r.completedCount).toBe(1);
    expect(r.nextProfile.tasks.map((t) => t.taskId)).toEqual(["existing2"]);
  });

  it("removes tasks that appear in failedTaskIds", () => {
    const p = baseProfile();
    const r = applyLogSyncToProfile(p, {
      activeTaskIds: [],
      completedTaskIds: [],
      failedTaskIds: ["existing2"],
    });
    expect(r.failedCount).toBe(1);
    expect(r.nextProfile.tasks.map((t) => t.taskId)).toEqual(["existing1"]);
  });

  it("preserves metadata on existing task entries that aren't removed", () => {
    const p = {
      ...baseProfile(),
      tasks: [{ taskId: "existing1", addedBy: "manual", color: "red", note: "for squad" }],
    };
    const r = applyLogSyncToProfile(p, {
      activeTaskIds: ["new1"],
      completedTaskIds: [],
      failedTaskIds: [],
    });
    const kept = r.nextProfile.tasks.find((t) => t.taskId === "existing1");
    expect(kept).toEqual({ taskId: "existing1", addedBy: "manual", color: "red", note: "for squad" });
  });

  it("is idempotent — running twice produces the same result as running once", () => {
    const p = baseProfile();
    const first = applyLogSyncToProfile(p, {
      activeTaskIds: ["new1"],
      completedTaskIds: ["existing1"],
      failedTaskIds: [],
    });
    const second = applyLogSyncToProfile(first.nextProfile, {
      activeTaskIds: ["new1"],
      completedTaskIds: ["existing1"],
      failedTaskIds: [],
    });
    expect(second.addedCount).toBe(0);
    expect(second.completedCount).toBe(0);
    expect(second.failedCount).toBe(0);
    // No-op returns the original reference unchanged.
    expect(second.nextProfile).toBe(first.nextProfile);
  });

  it("returns the same profile reference when nothing changes", () => {
    const p = baseProfile();
    const r = applyLogSyncToProfile(p, {
      activeTaskIds: ["existing1"],
      completedTaskIds: [],
      failedTaskIds: [],
    });
    expect(r.nextProfile).toBe(p);
    expect(r.addedCount).toBe(0);
  });

  it("handles null / undefined summary gracefully", () => {
    const p = baseProfile();
    expect(applyLogSyncToProfile(p, null).nextProfile).toBe(p);
    expect(applyLogSyncToProfile(p, undefined).nextProfile).toBe(p);
    expect(applyLogSyncToProfile(p, {}).nextProfile).toBe(p);
  });

  it("handles null profile gracefully", () => {
    const r = applyLogSyncToProfile(null, { activeTaskIds: ["a"] });
    expect(r.addedCount).toBe(0);
    expect(r.nextProfile).toBeNull();
  });

  it("does not add an id that appears in both activeTaskIds and completedTaskIds", () => {
    const p = baseProfile();
    const r = applyLogSyncToProfile(p, {
      activeTaskIds: ["new1"],
      completedTaskIds: ["new1"],
      failedTaskIds: [],
    });
    expect(r.addedCount).toBe(0);
    expect(r.nextProfile.tasks.find((t) => t.taskId === "new1")).toBeUndefined();
  });

  it("does not mutate the input profile", () => {
    const p = baseProfile();
    const pTasksRef = p.tasks;
    applyLogSyncToProfile(p, {
      activeTaskIds: ["new1"],
      completedTaskIds: ["existing1"],
      failedTaskIds: [],
    });
    expect(p.tasks).toBe(pTasksRef);
    expect(p.tasks).toHaveLength(2);
  });

  it("drops entries with a falsy taskId", () => {
    const p = { ...baseProfile(), tasks: [{ taskId: "existing1" }, { taskId: null }, { taskId: "" }] };
    const r = applyLogSyncToProfile(p, {
      activeTaskIds: ["new1"],
      completedTaskIds: [],
      failedTaskIds: [],
    });
    const ids = r.nextProfile.tasks.map((t) => t.taskId);
    expect(ids).toEqual(["existing1", "new1"]);
  });
});
