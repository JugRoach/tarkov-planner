import { useState, useEffect, useCallback, useRef } from "react";
import { T } from "../theme.js";

// Check if we're running inside Tauri
const isTauri = () => typeof window !== "undefined" && window.__TAURI_INTERNALS__;

// Eagerly loaded Tauri modules (populated on first use, then sync)
let tauriInvoke = null;
let tauriListen = null;
let tauriWindow = null;
let modulesReady = false;

async function loadTauriModules() {
  if (!isTauri() || modulesReady) return;
  const [core, event, win] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
    import("@tauri-apps/api/window"),
  ]);
  tauriInvoke = core.invoke;
  tauriListen = event.listen;
  tauriWindow = win.getCurrentWindow();
  modulesReady = true;
}

// Preload modules immediately if in Tauri
if (isTauri()) loadTauriModules();

export function startDragging() {
  // Synchronous — modules are already loaded by preload above
  if (tauriWindow) {
    tauriWindow.startDragging().catch(() => {});
  }
}

export function useOverlayMode() {
  const [overlayMode, setOverlayMode] = useState(false);
  const [locked, setLocked] = useState(false);
  const [opacity, setOpacity] = useState(0.85);
  const overlayRef = useRef(false);
  const lockedRef = useRef(false);

  // Keep refs in sync for use in event listeners
  overlayRef.current = overlayMode;
  lockedRef.current = locked;

  const toggleOverlay = useCallback(async () => {
    const next = !overlayRef.current;

    if (isTauri()) {
      await loadTauriModules();
      if (tauriInvoke) {
        try {
          await tauriInvoke("set_overlay_mode", { enabled: next });
        } catch (e) {
          console.warn("Failed to set overlay window mode:", e);
        }
      }
    }

    setOverlayMode(next);
    setLocked(false);
    if (!next) {
      document.documentElement.style.opacity = "1";
    }
  }, []);

  const updateOpacity = useCallback((val) => {
    setOpacity(val);
    document.documentElement.style.opacity = String(val);
  }, []);

  const toggleLock = useCallback(async () => {
    await loadTauriModules();
    if (!tauriInvoke) return;

    const next = !lockedRef.current;
    try {
      await tauriInvoke("set_click_through", { enabled: next });
      setLocked(next);
    } catch (e) {
      console.warn("Failed to toggle lock:", e);
    }
  }, []);

  // Listen for hotkeys from Rust backend
  useEffect(() => {
    if (!isTauri()) return;
    let unlistenOverlay, unlistenUnlock;
    (async () => {
      await loadTauriModules();
      if (!tauriListen) return;

      // Alt+O: toggle overlay mode, or unlock if locked
      unlistenOverlay = await tauriListen("toggle-overlay", async () => {
        if (lockedRef.current) {
          // Unlock click-through first
          try {
            await tauriInvoke("set_click_through", { enabled: false });
            setLocked(false);
          } catch (_) {}
        } else {
          // Toggle overlay mode
          const next = !overlayRef.current;
          try {
            await tauriInvoke("set_overlay_mode", { enabled: next });
            setOverlayMode(next);
            setLocked(false);
            if (!next) document.documentElement.style.opacity = "1";
          } catch (_) {}
        }
      });
    })();
    return () => {
      if (unlistenOverlay) unlistenOverlay();
      if (unlistenUnlock) unlistenUnlock();
    };
  }, []);

  return { overlayMode, toggleOverlay, locked, toggleLock, opacity, updateOpacity, isTauri: isTauri() };
}

export default function OverlayControls({ overlayMode, toggleOverlay, locked, toggleLock, opacity, updateOpacity }) {
  if (!isTauri()) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
    }}>
      {overlayMode && (
        <>
          <button
            onClick={toggleLock}
            title={locked ? "Unlock overlay (Alt+O)" : "Lock overlay — clicks pass through to game (Alt+O to unlock)"}
            style={{
              background: locked ? "rgba(210,175,120,0.15)" : "rgba(210,175,120,0.06)",
              border: `1px solid ${locked ? T.gold : "rgba(210,175,120,0.15)"}`,
              color: locked ? T.gold : T.textDim,
              padding: "3px 7px",
              fontSize: T.fs1,
              cursor: "pointer",
              fontFamily: T.sans,
              borderRadius: T.r1,
            }}
          >
            {locked ? "🔒" : "🔓"}
          </button>
          <input
            type="range"
            min="0.2"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(e) => updateOpacity(parseFloat(e.target.value))}
            title={`Opacity: ${Math.round(opacity * 100)}%`}
            style={{ width: 60, accentColor: T.gold, cursor: "pointer" }}
          />
        </>
      )}
      <button
        onClick={toggleOverlay}
        title={overlayMode ? "Exit overlay mode (Alt+O)" : "Enter overlay mode — always on top, no title bar (Alt+O)"}
        style={{
          background: overlayMode ? "rgba(210,175,120,0.15)" : "rgba(210,175,120,0.06)",
          border: `1px solid ${overlayMode ? T.gold : "rgba(210,175,120,0.15)"}`,
          color: overlayMode ? T.gold : T.textDim,
          padding: "3px 7px",
          fontSize: T.fs1,
          cursor: "pointer",
          fontFamily: T.sans,
          borderRadius: T.r1,
          letterSpacing: 0.5,
        }}
      >
        {overlayMode ? "EXIT" : "OVR"}
      </button>
    </div>
  );
}
