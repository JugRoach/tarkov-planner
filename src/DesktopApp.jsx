import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { T, PLAYER_COLORS } from "./theme.js";
import { useStorage } from "./hooks/useStorage.js";
import { fetchAPI, MAPS_Q, TASKS_Q, HIDEOUT_Q, TRADERS_Q } from "./api.js";
import { EMAPS } from "./lib/mapData.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

const TasksTab = lazy(() => import("./tabs/TasksTab.jsx"));
const RaidTab = lazy(() => import("./tabs/RaidTab.jsx"));
const BuildsTab = lazy(() => import("./tabs/BuildsTab.jsx"));
const IntelTab = lazy(() => import("./tabs/IntelTab.jsx"));
const ProfileTab = lazy(() => import("./tabs/ProfileTab.jsx"));
const PriceSearch = lazy(() => import("./components/PriceSearch.jsx"));

const NAV_ITEMS = [
  { id: "tasks", label: "Tasks", icon: "★" },
  { id: "raid", label: "Raid", icon: "▶" },
  { id: "prices", label: "Prices", icon: "₽" },
  { id: "builds", label: "Builds", icon: "⚙" },
  { id: "intel", label: "Intel", icon: "◎" },
  { id: "profile", label: "Profile", icon: "▲" },
];

// Tauri API helpers — loaded lazily
let tauriInvoke = null;
async function loadTauri() {
  if (tauriInvoke) return;
  try {
    const core = await import("@tauri-apps/api/core");
    tauriInvoke = core.invoke;
  } catch (_) {}
}

function DesktopAppInner() {
  const [tab, setTab] = useState("tasks");
  const [overlayMode, setOverlayMode] = useState(false);
  const [myProfile, saveMyProfile, profileReady] = useStorage(
    "tg-myprofile-v3",
    { id: "me_" + Math.random().toString(36).slice(2, 10), name: "", color: PLAYER_COLORS[0], tasks: [], progress: {} }
  );
  const [apiMaps, setApiMaps] = useState(null);
  const [apiTasks, setApiTasks] = useState(null);
  const [apiHideout, setApiHideout] = useState(null);
  const [apiTraders, setApiTraders] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [hideoutLevels, saveHideoutLevels] = useStorage("tg-hideout-v1", {});
  const [hideoutTarget, saveHideoutTarget] = useStorage("tg-hideout-target-v1", null);
  const [savedBuilds, saveSavedBuilds] = useStorage("tg-builds-v1", []);
  const [pendingRouteTask, setPendingRouteTask] = useState(null);

  // Fetch API data
  useEffect(() => {
    if (apiMaps || apiLoading) return;
    setApiLoading(true);
    (async () => {
      try {
        const [mData, tData, hData, trData] = await Promise.all([
          fetchAPI(MAPS_Q), fetchAPI(TASKS_Q), fetchAPI(HIDEOUT_Q), fetchAPI(TRADERS_Q),
        ]);
        const playable = ["customs","factory","woods","interchange","shoreline","reserve","lighthouse","streets-of-tarkov","the-lab","ground-zero"];
        setApiMaps((mData?.maps || []).filter((m) => playable.includes(m.normalizedName)));
        const seenNames = new Set();
        setApiTasks((tData?.tasks || []).filter((t) => {
          const key = t.name + "|" + (t.trader?.name || "");
          if (seenNames.has(key)) return false;
          seenNames.add(key);
          return true;
        }));
        setApiHideout(hData?.hideoutStations || []);
        setApiTraders(trData?.traders || []);
      } catch (e) {
        setApiError(true);
      }
      setApiLoading(false);
    })();
  }, []);

  // Overlay toggle
  const toggleOverlay = async () => {
    const next = !overlayMode;
    await loadTauri();
    if (tauriInvoke) {
      try {
        await tauriInvoke("set_overlay_mode", { enabled: next });
      } catch (_) {}
    }
    setOverlayMode(next);
  };

  // Sidebar width
  const sideW = overlayMode ? 48 : 140;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${sideW}px 1fr`,
        height: "100vh",
        width: "100vw",
        background: T.bg,
        color: T.text,
        fontFamily: T.sans,
        overflow: "hidden",
      }}
    >
      {/* ─── SIDEBAR NAV ─────────────────────────────── */}
      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          background: T.surface,
          borderRight: `1px solid ${T.border}`,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: overlayMode ? "8px 4px" : "12px 10px 8px",
            borderBottom: `1px solid ${T.border}`,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: overlayMode ? T.fs1 : T.fs3, fontWeight: "bold", color: T.gold, letterSpacing: 1.5 }}>
            {overlayMode ? "TG" : "TARKOV"}
          </div>
          {!overlayMode && (
            <div style={{ fontSize: T.fs1, color: T.textDim, letterSpacing: 2, marginTop: 2 }}>GUIDE</div>
          )}
        </div>

        {/* Nav items */}
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: overlayMode ? "10px 0" : "10px 12px",
              justifyContent: overlayMode ? "center" : "flex-start",
              background: tab === item.id ? "rgba(210,175,120,0.1)" : "transparent",
              border: "none",
              borderLeft: `3px solid ${tab === item.id ? T.gold : "transparent"}`,
              cursor: "pointer",
              color: tab === item.id ? T.gold : T.textDim,
              fontFamily: T.sans,
              fontSize: T.fs2,
              fontWeight: tab === item.id ? "bold" : "normal",
              letterSpacing: 0.5,
              transition: "all 0.15s ease",
              width: "100%",
            }}
          >
            <span style={{ fontSize: T.fs4, flexShrink: 0 }}>{item.icon}</span>
            {!overlayMode && <span style={{ textTransform: "uppercase" }}>{item.label}</span>}
          </button>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Status + Overlay toggle */}
        <div style={{ padding: overlayMode ? "8px 4px" : "8px 10px", borderTop: `1px solid ${T.border}` }}>
          {!overlayMode && (
            <div
              style={{
                fontSize: T.fs1,
                color: apiError ? T.error : T.success,
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginBottom: 8,
              }}
            >
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: apiError ? T.error : T.success }} />
              {apiError ? "OFFLINE" : "LIVE"}
            </div>
          )}
          <button
            onClick={toggleOverlay}
            title={overlayMode ? "Exit overlay (Alt+O)" : "Overlay mode — always on top"}
            style={{
              width: "100%",
              padding: "6px 0",
              background: overlayMode ? "rgba(210,175,120,0.15)" : "rgba(210,175,120,0.06)",
              border: `1px solid ${overlayMode ? T.gold : T.border}`,
              color: overlayMode ? T.gold : T.textDim,
              fontSize: T.fs1,
              fontFamily: T.sans,
              cursor: "pointer",
              borderRadius: T.r1,
              letterSpacing: 1,
            }}
          >
            {overlayMode ? "EXIT" : "OVR"}
          </button>
        </div>
      </nav>

      {/* ─── CONTENT AREA ────────────────────────────── */}
      <main style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Suspense
          fallback={
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: T.textDim,
                fontSize: T.fs4,
              }}
            >
              Loading...
            </div>
          }
        >
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {tab === "tasks" && (
              <TasksTab
                myProfile={myProfile}
                saveMyProfile={saveMyProfile}
                apiTasks={apiTasks}
                apiTraders={apiTraders}
                loading={apiLoading}
                apiError={apiError}
                apiHideout={apiHideout}
                hideoutLevels={hideoutLevels}
                saveHideoutLevels={saveHideoutLevels}
                hideoutTarget={hideoutTarget}
                saveHideoutTarget={saveHideoutTarget}
                onRouteTask={(taskId, mapId) => {
                  setPendingRouteTask({ taskId, mapId });
                  setTab("raid");
                }}
              />
            )}
            {tab === "raid" && (
              <RaidTab
                myProfile={myProfile}
                saveMyProfile={saveMyProfile}
                apiMaps={apiMaps}
                apiTasks={apiTasks}
                apiTraders={apiTraders}
                loading={apiLoading}
                apiError={apiError}
                hideoutTarget={hideoutTarget}
                apiHideout={apiHideout}
                hideoutLevels={hideoutLevels}
                pendingRouteTask={pendingRouteTask}
                clearPendingRouteTask={() => setPendingRouteTask(null)}
              />
            )}
            {tab === "prices" && <PriceSearch />}
            {tab === "builds" && <BuildsTab savedBuilds={savedBuilds} saveSavedBuilds={saveSavedBuilds} />}
            {tab === "intel" && <IntelTab />}
            {tab === "profile" && <ProfileTab myProfile={myProfile} saveMyProfile={saveMyProfile} setTab={setTab} />}
          </div>
        </Suspense>
      </main>
    </div>
  );
}

export default function DesktopApp() {
  return (
    <ErrorBoundary>
      <DesktopAppInner />
    </ErrorBoundary>
  );
}
