import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Tauri auto-updater hook.
 * Returns idle when running as PWA (no Tauri). When running in the desktop
 * app, exposes:
 *   - status: idle | checking | uptodate | available | downloading | installing | error
 *   - info:   { version, currentVersion, body } when status === "available"
 *   - progress: 0-1 during download
 *   - checkForUpdates(silent = false): kicks off a check
 *   - installUpdate(): downloads + applies + relaunches
 *
 * Pass silent=true on startup checks so we don't flash a "you're up to date"
 * toast for the common case.
 */
export function useUpdater({ autoCheck = false } = {}) {
  const isTauri = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  const [status, setStatus] = useState("idle");
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const updateRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const checkForUpdates = useCallback(async (silent = false) => {
    if (!isTauri) return;
    if (!silent) setStatus("checking");
    setError(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!mountedRef.current) return;
      if (update) {
        updateRef.current = update;
        setInfo({
          version: update.version,
          currentVersion: update.currentVersion,
          body: update.body || "",
          date: update.date || null,
        });
        setStatus("available");
      } else if (!silent) {
        setStatus("uptodate");
      } else {
        setStatus("idle");
      }
    } catch (e) {
      if (!mountedRef.current) return;
      if (!silent) {
        setError(String(e?.message || e));
        setStatus("error");
      } else {
        // Silent checks shouldn't surface errors — most likely offline.
        setStatus("idle");
      }
    }
  }, [isTauri]);

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    setStatus("downloading");
    setProgress(0);
    setError(null);
    try {
      let total = 0;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength ?? 0;
          if (mountedRef.current) setProgress(total ? downloaded / total : 0);
        } else if (event.event === "Finished") {
          if (mountedRef.current) {
            setProgress(1);
            setStatus("installing");
          }
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      if (!mountedRef.current) return;
      setError(String(e?.message || e));
      setStatus("error");
    }
  }, []);

  // Auto-check on mount (silent — no UI flash when already up-to-date)
  useEffect(() => {
    if (!autoCheck || !isTauri) return;
    // Small delay so the app is interactive before the network hit
    const t = setTimeout(() => { checkForUpdates(true); }, 2000);
    return () => clearTimeout(t);
  }, [autoCheck, isTauri, checkForUpdates]);

  return { isTauri, status, info, error, progress, checkForUpdates, installUpdate };
}
