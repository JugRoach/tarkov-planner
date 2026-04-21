// Applies log-watcher output to the persistent profile:
//   - Adds tasks the log shows as active that aren't already tracked.
//   - Removes tasks that the log shows as completed or failed.
// Pure function, idempotent — safe to run on every scan. Manually-added
// tasks in `myProfile.tasks` that logs don't know about are preserved,
// and metadata on existing task entries is left untouched.

export function applyLogSyncToProfile(myProfile, summary) {
  const noop = { nextProfile: myProfile, addedCount: 0, completedCount: 0, failedCount: 0 };
  if (!myProfile) return noop;

  const active = Array.isArray(summary?.activeTaskIds) ? summary.activeTaskIds : [];
  const completed = Array.isArray(summary?.completedTaskIds) ? summary.completedTaskIds : [];
  const failed = Array.isArray(summary?.failedTaskIds) ? summary.failedTaskIds : [];

  if (!active.length && !completed.length && !failed.length) return noop;

  const completedSet = new Set(completed);
  const failedSet = new Set(failed);
  const existingTasks = Array.isArray(myProfile.tasks) ? myProfile.tasks : [];

  // Remove tasks that logs say are completed or failed.
  const keptTasks = [];
  let completedCount = 0;
  let failedCount = 0;
  for (const t of existingTasks) {
    if (!t?.taskId) continue;
    if (completedSet.has(t.taskId)) { completedCount++; continue; }
    if (failedSet.has(t.taskId)) { failedCount++; continue; }
    keptTasks.push(t);
  }

  // Add active IDs that aren't tracked yet — skip any id that also
  // shows up in the completed/failed sets so a task that started AND
  // finished in the same scan doesn't get re-added.
  const keptIds = new Set(keptTasks.map((t) => t.taskId));
  const nextTasks = [...keptTasks];
  let addedCount = 0;
  for (const id of active) {
    if (!id) continue;
    if (keptIds.has(id)) continue;
    if (completedSet.has(id) || failedSet.has(id)) continue;
    nextTasks.push({ taskId: id });
    keptIds.add(id);
    addedCount++;
  }

  if (addedCount === 0 && completedCount === 0 && failedCount === 0) return noop;

  return {
    nextProfile: { ...myProfile, tasks: nextTasks },
    addedCount,
    completedCount,
    failedCount,
  };
}
