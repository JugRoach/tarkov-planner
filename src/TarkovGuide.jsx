import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { T, PLAYER_COLORS } from "./theme.js";
import { useStorage } from "./hooks/useStorage.js";
import { fetchAPI, MAPS_Q, TASKS_Q, HIDEOUT_Q, TRADERS_Q } from "./api.js";
import { EMAPS } from "./lib/mapData.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import WelcomeBanner from "./components/WelcomeBanner.jsx";
import BottomNav from "./components/BottomNav.jsx";
const TasksTab = lazy(() => import('./tabs/TasksTab.jsx'));
const RaidTab = lazy(() => import('./tabs/RaidTab.jsx'));
const BuildsTab = lazy(() => import('./tabs/BuildsTab.jsx'));
const IntelTab = lazy(() => import('./tabs/IntelTab.jsx'));
const ProfileTab = lazy(() => import('./tabs/ProfileTab.jsx'));

// ─── ROOT ─────────────────────────────────────────────────────
function TarkovGuideInner() {
  const [tab, setTab] = useState("tasks");
  const [myProfile, saveMyProfile, profileReady] = useStorage("tg-myprofile-v3", { id: "me_" + Math.random().toString(36).slice(2, 10), name: "", color: PLAYER_COLORS[0], tasks: [], progress: {} });
  const [apiMaps, setApiMaps] = useState(null);
  const [apiTasks, setApiTasks] = useState(null);
  const [apiHideout, setApiHideout] = useState(null);
  const [apiTraders, setApiTraders] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [hideoutLevels, saveHideoutLevels] = useStorage("tg-hideout-v1", {});
  const [hideoutTarget, saveHideoutTarget] = useStorage("tg-hideout-target-v1", null);
  const [savedBuilds, saveSavedBuilds] = useStorage("tg-builds-v1", []);

  useEffect(() => {
    if (apiMaps || apiLoading) return;
    setApiLoading(true);
    (async () => {
      try {
        const [mData, tData, hData, trData] = await Promise.all([fetchAPI(MAPS_Q), fetchAPI(TASKS_Q), fetchAPI(HIDEOUT_Q), fetchAPI(TRADERS_Q)]);
        const playable = ["customs", "factory", "woods", "interchange", "shoreline", "reserve", "lighthouse", "streets-of-tarkov", "the-lab", "ground-zero"];
        setApiMaps((mData?.maps || []).filter(m => playable.includes(m.normalizedName)));
        setApiTasks(tData?.tasks || []);
        setApiHideout(hData?.hideoutStations || []);
        setApiTraders(trData?.traders || []);
      } catch (e) { setApiError(true); }
      setApiLoading(false);
    })();
  }, []);

  const [pendingRouteTask, setPendingRouteTask] = useState(null);
  const [welcomed, saveWelcomed] = useStorage("tg-welcomed-v7", false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  useEffect(() => { if (profileReady && !welcomed) setShowWelcome(true); }, [profileReady, welcomed]);

  const searchResults = useMemo(() => {
    const q = searchQ.toLowerCase().trim();
    if (q.length < 2) return [];
    const results = [];
    (apiTasks || []).filter(t => t.name.toLowerCase().includes(q)).slice(0, 8).forEach(t => {
      results.push({ type: "Task", name: t.name, detail: `${t.trader?.name || ""}${t.map ? " · " + t.map.name : ""}` });
    });
    EMAPS.filter(m => m.name.toLowerCase().includes(q)).forEach(m => {
      results.push({ type: "Map", name: m.name, detail: m.tier });
    });
    EMAPS.forEach(m => {
      [...(m.pmcExtracts || []), ...(m.scavExtracts || [])].filter(e => e.name.toLowerCase().includes(q)).slice(0, 4).forEach(e => {
        results.push({ type: "Extract", name: e.name, detail: `${m.name} · ${e.type}` });
      });
    });
    (apiMaps || []).forEach(m => {
      (m.bosses || []).filter(b => b.boss?.name?.toLowerCase().includes(q)).forEach(b => {
        results.push({ type: "Boss", name: b.boss.name, detail: `${m.name} · ${Math.round((b.spawnChance || 0) * 100)}%` });
      });
    });
    return results;
  }, [searchQ, apiTasks, apiMaps]);

  const handleSearchAction = (type) => {
    if (type === "Task") { setTab("tasks"); setSearchOpen(false); }
    else if (type === "Map" || type === "Extract") { setTab("intel"); setSearchOpen(false); }
    else { setSearchOpen(false); }
  };

  return (
    <div style={{ height: "100vh", width: "100%", display: "flex", justifyContent: "center", background: T.bg }}>
    <div style={{ height: "100%", width: "100%", maxWidth: 960, background: T.bg, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")", color: T.text, fontFamily: T.sans, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      {showWelcome && <WelcomeBanner onDismiss={() => { setShowWelcome(false); saveWelcomed(true); }} />}
      {searchOpen && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(13,14,16,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 100, display: "flex", flexDirection: "column", padding: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus placeholder="Search tasks, maps, extracts, bosses..."
                style={{ flex: 1, background: T.surface, border: `1px solid ${T.borderBright}`, color: T.textBright, padding: "10px 12px", fontSize: T.fs3, fontFamily: T.sans, outline: "none" }} />
              <button onClick={() => setSearchOpen(false)} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "10px 14px", fontSize: T.fs3, cursor: "pointer", fontFamily: T.sans }}>ESC</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {searchQ.trim().length < 2 && <div style={{ color: T.textDim, fontSize: T.fs3, textAlign: "center", padding: 20 }}>Type at least 2 characters to search</div>}
              {searchQ.trim().length >= 2 && searchResults.length === 0 && <div style={{ color: T.textDim, fontSize: T.fs3, textAlign: "center", padding: 20 }}>No results for "{searchQ}"</div>}
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => handleSearchAction(r.type)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderLeft: `2px solid ${r.type === "Task" ? T.gold : r.type === "Map" ? T.blue : r.type === "Boss" ? T.error : T.success}`, padding: "10px 12px", marginBottom: 4, cursor: "pointer", textAlign: "left" }}>
                  <div>
                    <div style={{ color: T.textBright, fontSize: T.fs3, fontWeight: "bold" }}>{r.name}</div>
                    <div style={{ color: T.textDim, fontSize: T.fs1, marginTop: 2 }}>{r.detail}</div>
                  </div>
                  <span style={{ fontSize: T.fs1, color: T.textDim, fontFamily: T.sans, letterSpacing: 1 }}>{r.type.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>
      )}
      <div style={{ background: T.surface, borderBottom: `1px solid rgba(210,175,120,0.12)`, padding: "10px 14px 8px", flexShrink: 0 }}>
        <div style={{ fontSize: T.fs1, letterSpacing: 3, color: T.textDim, marginBottom: 2 }}>PvE FIELD REFERENCE</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: T.fs6, fontWeight: "bold", color: T.gold, letterSpacing: 2.5 }}>TARKOV GUIDE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button aria-label="Search" onClick={() => { setSearchOpen(true); setSearchQ(""); }} style={{ background: "rgba(210,175,120,0.06)", border: `1px solid rgba(210,175,120,0.15)`, color: T.text, padding: "3px 8px", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, borderRadius: T.r1 }}>🔍</button>
            {myProfile.name && <div style={{ fontSize: T.fs3, color: myProfile.color, fontFamily: T.sans }}>{myProfile.name}</div>}
            <div style={{ fontSize: T.fs1, color: apiError ? T.errorBorder : T.successBorder, display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: apiError ? T.error : T.success }} />
              {apiError ? "OFFLINE" : "LIVE DATA"}
            </div>
          </div>
        </div>
      </div>
      <Suspense fallback={<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim, fontSize: T.fs4, fontFamily: T.sans }}>Loading...</div>}>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tab === "tasks" && <TasksTab myProfile={myProfile} saveMyProfile={saveMyProfile} apiTasks={apiTasks} apiTraders={apiTraders} loading={apiLoading} apiError={apiError} apiHideout={apiHideout} hideoutLevels={hideoutLevels} saveHideoutLevels={saveHideoutLevels} hideoutTarget={hideoutTarget} saveHideoutTarget={saveHideoutTarget} onRouteTask={(taskId, mapId) => { setPendingRouteTask({ taskId, mapId }); setTab("raid"); }} />}
        {tab === "raid" && <RaidTab myProfile={myProfile} saveMyProfile={saveMyProfile} apiMaps={apiMaps} apiTasks={apiTasks} apiTraders={apiTraders} loading={apiLoading} apiError={apiError} hideoutTarget={hideoutTarget} apiHideout={apiHideout} hideoutLevels={hideoutLevels} pendingRouteTask={pendingRouteTask} clearPendingRouteTask={() => setPendingRouteTask(null)} />}
        {tab === "builds" && <BuildsTab savedBuilds={savedBuilds} saveSavedBuilds={saveSavedBuilds} />}
        {tab === "intel" && <IntelTab />}
        {tab === "profile" && <ProfileTab myProfile={myProfile} saveMyProfile={saveMyProfile} setTab={setTab} />}
      </main>
      </Suspense>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
    </div>
  );
}
export default function TarkovGuide() {
  return <ErrorBoundary><TarkovGuideInner /></ErrorBoundary>;
}
