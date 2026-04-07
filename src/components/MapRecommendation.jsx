import { useState } from "react";
import { T } from '../theme.js';
import { SL, Badge, Btn, Tip } from './ui/index.js';
import { getObjMeta } from '../lib/utils.js';
import { computeMapRecommendation, computeItemRecommendation } from '../lib/computeUtils.js';
import { LOOK_CATS, rankMapsByTags } from '../lib/configData.js';
import { EMAPS } from '../lib/mapData.js';

export default function MapRecommendation({ allProfiles, activeIds, apiTasks, apiTraders, apiMaps, onSelectMap, selectedMapId, hideoutTarget, apiHideout }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState("tasks"); // "tasks", "hideout", "looking"
  const [lookPath, setLookPath] = useState([]); // drill-down path of category ids
  const [expandedTask, setExpandedTask] = useState(null);
  const traderImgMap = Object.fromEntries((apiTraders || []).map(t => [t.name, t.imageLink]));

  const profiles = activeIds.size > 0
    ? allProfiles.filter(p => activeIds.has(p.id))
    : allProfiles;
  const scope = activeIds.size > 0 ? `${activeIds.size} active` : "all";

  const taskRanked = computeMapRecommendation(profiles, apiTasks);

  // Item-based recommendation
  let itemRanked = [];
  let targetStation = null;
  let targetLevel = null;
  if (hideoutTarget && apiHideout) {
    targetStation = apiHideout.find(s => s.id === hideoutTarget.stationId);
    targetLevel = targetStation?.levels.find(l => l.level === hideoutTarget.level);
    if (targetLevel) {
      const neededItems = targetLevel.itemRequirements
        .filter(r => r.item.name !== "Roubles")
        .map(r => ({ id: r.item.id, name: r.item.name, shortName: r.item.shortName, count: r.count }));
      itemRanked = computeItemRecommendation(neededItems, apiMaps);
    }
  }

  // "Looking for" drill-down
  const getCurrentLookCat = () => {
    let cats = LOOK_CATS;
    let current = null;
    for (const id of lookPath) {
      current = cats.find(c => c.id === id);
      if (!current) break;
      cats = current.subs || [];
    }
    return { current, children: current?.subs || (lookPath.length === 0 ? LOOK_CATS : []) };
  };
  const { current: lookCurrent, children: lookChildren } = getCurrentLookCat();
  const lookTags = lookCurrent?.tags || [];
  const lookRanked = lookTags.length > 0 ? rankMapsByTags(lookTags) : [];
  const lookTop = lookRanked[0];

  const hasTaskData = taskRanked.length > 0;
  const hasItemData = itemRanked.length > 0;
  if (!hasTaskData && !hasItemData && mode === "tasks") return null;

  // Summary for collapsed bar
  const getTopInfo = () => {
    if (mode === "looking" && lookTop) return { name: lookTop.mapName, desc: `${lookTop.matchCount} loot spot${lookTop.matchCount !== 1 ? "s" : ""} · ${lookCurrent?.label || ""}` };
    if (mode === "hideout" && itemRanked[0]) return { name: itemRanked[0].mapName, desc: `${itemRanked[0].totalContainers} containers · hideout items` };
    if (taskRanked[0]) return { name: taskRanked[0].mapName, desc: `${taskRanked[0].totalTasks} task${taskRanked[0].totalTasks !== 1 ? "s" : ""} · ${taskRanked[0].playerCount} player${taskRanked[0].playerCount !== 1 ? "s" : ""}` };
    return null;
  };
  const topInfo = getTopInfo();
  if (!topInfo && mode !== "looking") return null;

  // Find the API map id for an EMAPS slug
  const emapToApiId = (slug) => apiMaps?.find(m => m.normalizedName === slug)?.id;

  return (
    <div style={{ marginTop: 8, marginBottom: 2 }}>
      {/* Collapsed summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", background: T.cyanBg, border: `1px solid ${T.cyanBorder}`,
          borderLeft: `2px solid ${T.cyan}`, padding: "8px 10px",
          cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
          fontFamily: T.sans, textAlign: "left",
        }}
      >
        <div>
          <span style={{ fontSize: T.fs2, letterSpacing: 1, color: T.cyan }}>{topInfo ? "RECOMMENDED: " : "FIND YOUR MAP: "}</span>
          {topInfo ? <>
            <span style={{ fontSize: T.fs4, color: T.textBright, fontWeight: "bold" }}>{topInfo.name}</span>
            <span style={{ fontSize: T.fs3, color: T.textDim, marginLeft: 6 }}>{topInfo.desc}</span>
          </> : <span style={{ fontSize: T.fs4, color: T.textDim }}>Select what you're looking for</span>}
        </div>
        <span style={{ fontSize: T.fs4, color: T.cyan, flexShrink: 0 }}>{expanded ? "▴" : "▾"}</span>
      </button>

      {/* Expanded breakdown */}
      {expanded && (
        <div style={{ background: T.inputBg, border: `1px solid ${T.cyanBorder}`, borderTop: "none", padding: 12 }}>
          {/* Mode toggle — 3 options */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[
              {id:"tasks",label:"BY TASKS",color:T.cyan,disabled:!hasTaskData},
              {id:"hideout",label:"BY HIDEOUT",color:T.orange,disabled:!hasItemData},
              {id:"looking",label:"LOOKING FOR...",color:T.purple,disabled:false},
            ].map(m => (
              <button key={m.id} onClick={() => { if (!m.disabled) setMode(m.id); }} style={{
                flex: 1, padding: "5px 0", fontSize: T.fs1, letterSpacing: 1, fontFamily: T.sans,
                background: mode === m.id ? m.color + "22" : "transparent",
                border: `1px solid ${mode === m.id ? m.color : T.border}`,
                color: m.disabled ? "#2a3a3a" : (mode === m.id ? m.color : T.textDim),
                cursor: m.disabled ? "default" : "pointer",
              }}>{m.label}</button>
            ))}
          </div>

          {/* TASKS MODE */}
          {mode === "tasks" && hasTaskData && (() => {
            const top = taskRanked[0]; const isTopSel = selectedMapId === top.mapId;
            return <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: T.fs2, letterSpacing: 1.5, color: T.cyan, marginBottom: 3 }}>BEST MAP FOR TASKS ({scope})</div>
                  <div style={{ fontSize: T.fs2, color: T.textBright, fontWeight: "bold" }}>{top.mapName}</div>
                  <div style={{ fontSize: T.fs3, color: T.textDim, marginTop: 2 }}>{top.totalTasks} task{top.totalTasks !== 1 ? "s" : ""} · {top.totalIncomplete} objective{top.totalIncomplete !== 1 ? "s" : ""}</div>
                </div>
                {!isTopSel ? <button onClick={(e) => { e.stopPropagation(); onSelectMap(top.mapId); }} style={{ background: T.cyan + "22", border: `1px solid ${T.cyan}`, color: T.cyan, padding: "6px 12px", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1, whiteSpace: "nowrap", flexShrink: 0 }}>SELECT</button> : <Badge label="SELECTED" color={T.cyan} />}
              </div>
              {top.playerList.map(pl => (
                <div key={pl.name} style={{ borderLeft: `2px solid ${pl.color}`, paddingLeft: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: T.fs3, color: pl.color, fontWeight: "bold", marginBottom: 3 }}>{pl.name}{pl.isMe ? <span style={{ fontSize: T.fs1, color: T.textDim, fontWeight: "normal", marginLeft: 4 }}>YOU</span> : ""}</div>
                  {pl.tasks.map(t => {
                    const apiTask = apiTasks?.find(x => x.id === t.taskId);
                    if (!apiTask) return <div key={t.taskId} style={{ fontSize: T.fs3, color: T.textDim, marginBottom: 2, paddingLeft: 4 }}>★ {t.taskName} — <span style={{ color: t.remaining === t.total ? "#7a8a7a" : "#ba9a4a" }}>{t.remaining}/{t.total} obj</span></div>;
                    const reqObjs = (apiTask.objectives || []).filter(o => !o.optional);
                    const completedObjs = reqObjs.filter(obj => { const k = `${pl.id}-${t.taskId}-${obj.id}`; const meta = getObjMeta(obj); return (pl.progress[k] || 0) >= meta.total; }).length;
                    const totalObjs = reqObjs.length;
                    const isComplete = completedObjs >= totalObjs && totalObjs > 0;
                    const traderName = apiTask.trader?.name || "Unknown";
                    const incompleteObjs = reqObjs.filter(obj => { const k = `${pl.id}-${t.taskId}-${obj.id}`; const meta = getObjMeta(obj); return (pl.progress[k] || 0) < meta.total; });
                    const eKey = `${pl.id}-${t.taskId}`;
                    return (
                      <div key={t.taskId} style={{ background: isComplete ? T.successBg : T.surface, border: `1px solid ${isComplete ? T.successBorder : T.border}`, borderLeft: `2px solid ${isComplete ? T.success : pl.color}`, padding: 10, marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          {traderImgMap[traderName] && <img src={traderImgMap[traderName]} alt={traderName} style={{ width: 24, height: 24, borderRadius: "50%", border: `1px solid ${pl.color}44`, objectFit: "cover", flexShrink: 0, marginTop: 2 }} />}
                          <div style={{ flex: 1 }}>
                            <div style={{ color: isComplete ? T.success : T.textBright, fontSize: T.fs2, fontWeight: "bold", textDecoration: isComplete ? "line-through" : "none", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{apiTask.name}{apiTask.wikiLink && <a href={apiTask.wikiLink} target="_blank" rel="noreferrer" style={{ background: T.blue + "22", color: T.blue, border: `1px solid ${T.blue}44`, padding: "2px 6px", fontSize: T.fs1, letterSpacing: 0.5, fontFamily: T.sans, whiteSpace: "nowrap", textDecoration: "none", fontWeight: "normal" }}>WIKI ↗</a>}</div>
                            <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                              <Badge label={traderName} color={pl.color} />
                              {apiTask.map ? <Badge label={apiTask.map.name} color={T.blue} /> : <Badge label="ANY MAP" color={T.cyan} />}
                              <span style={{ fontSize: T.fs2, color: isComplete ? T.success : T.textDim }}>{completedObjs}/{totalObjs} obj</span>
                            </div>
                            {!isComplete && (() => {
                              const showAll = incompleteObjs.length <= 6;
                              const visible = showAll ? incompleteObjs : incompleteObjs.slice(0, 2);
                              return <>
                                {visible.map(obj => {
                                  const meta = getObjMeta(obj);
                                  return <div key={obj.id} style={{ fontSize: T.fs1, color: T.textDim, marginTop: 3 }}><span style={{ color: meta.color }}>{meta.icon}</span> {obj.description}</div>;
                                })}
                                {!showAll && <button onClick={() => setExpandedTask(expandedTask === eKey ? null : eKey)} style={{ background: "transparent", border: "none", color: T.blue, fontSize: T.fs1, cursor: "pointer", padding: 0, marginTop: 3, fontFamily: T.sans }}>{expandedTask === eKey ? "▴ show less" : `▾ +${incompleteObjs.length - 2} more`}</button>}
                                {!showAll && expandedTask === eKey && incompleteObjs.slice(2).map(obj => {
                                  const meta = getObjMeta(obj);
                                  return <div key={obj.id} style={{ fontSize: T.fs1, color: T.textDim, marginTop: 3 }}><span style={{ color: meta.color }}>{meta.icon}</span> {obj.description}</div>;
                                })}
                              </>;
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </>;
          })()}

          {/* HIDEOUT MODE */}
          {mode === "hideout" && hasItemData && (() => {
            const top = itemRanked[0]; const isTopSel = selectedMapId === top.mapId;
            return <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: T.fs2, letterSpacing: 1.5, color: T.orange, marginBottom: 3 }}>BEST MAP FOR HIDEOUT ITEMS</div>
                  <div style={{ fontSize: T.fs2, color: T.textBright, fontWeight: "bold" }}>{top.mapName}</div>
                  <div style={{ fontSize: T.fs3, color: T.textDim, marginTop: 2 }}>{top.totalContainers} containers · {top.affinityScore > 0 ? "high" : "average"} relevance</div>
                </div>
                {!isTopSel ? <button onClick={(e) => { e.stopPropagation(); onSelectMap(top.mapId); }} style={{ background: T.orange + "22", border: `1px solid ${T.orange}`, color: T.orange, padding: "6px 12px", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1, whiteSpace: "nowrap", flexShrink: 0 }}>SELECT</button> : <Badge label="SELECTED" color={T.orange} />}
              </div>
              {targetStation && targetLevel && (
                <div style={{ borderLeft: `2px solid ${T.orange}`, paddingLeft: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: T.fs3, color: T.orange, fontWeight: "bold", marginBottom: 4 }}>{targetStation.name} → Level {hideoutTarget.level}</div>
                  {targetLevel.itemRequirements.filter(r => r.item.name !== "Roubles").map((r, i) => <div key={i} style={{ fontSize: T.fs3, color: T.textDim, marginBottom: 2, paddingLeft: 4 }}>◈ {r.item.name} ×{r.count}</div>)}
                </div>
              )}
            </>;
          })()}
          {mode === "hideout" && !hasItemData && (
            <div style={{ fontSize: T.fs3, color: T.textDim, textAlign: "center", padding: 12 }}>Set a hideout target in Tasks → Hideout to enable this.</div>
          )}

          {/* LOOKING FOR MODE */}
          {mode === "looking" && (
            <div>
              {/* Breadcrumb */}
              {lookPath.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                  <button onClick={() => setLookPath([])} style={{ background: "transparent", border: "none", color: T.purple, fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, padding: 0 }}>ALL</button>
                  {lookPath.map((id, i) => {
                    let cats = LOOK_CATS;
                    let cat = null;
                    for (let j = 0; j <= i; j++) { cat = cats.find(c => c.id === lookPath[j]); cats = cat?.subs || []; }
                    return <span key={id} style={{ fontSize: T.fs2, color: T.textDim }}><span style={{ margin: "0 2px" }}>›</span><button onClick={() => setLookPath(lookPath.slice(0, i + 1))} style={{ background: "transparent", border: "none", color: i === lookPath.length - 1 ? T.purple : T.textDim, fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, padding: 0 }}>{cat?.label}</button></span>;
                  })}
                </div>
              )}

              {/* Category grid */}
              <div style={{ fontSize: T.fs2, letterSpacing: 1, color: T.purple, marginBottom: 6 }}>
                {lookPath.length === 0 ? "WHAT ARE YOU LOOKING FOR?" : lookCurrent?.label ? `${lookCurrent.label} — NARROW DOWN (OPTIONAL)` : "SELECT"}
                <Tip text="Pick a broad category to see which maps are best. Optionally drill down to subcategories for more specific results." />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 4, marginBottom: 10 }}>
                {(lookPath.length === 0 ? LOOK_CATS : lookChildren).map(cat => (
                  <button key={cat.id} onClick={() => setLookPath([...lookPath, cat.id])} style={{
                    background: T.purple + "11", border: `1px solid ${T.purpleBorder}`,
                    color: T.textBright, padding: "8px 6px", fontSize: T.fs3, cursor: "pointer",
                    fontFamily: T.sans, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  }}>
                    {lookPath.length === 0 && <span style={{ fontSize: 12 }}>{cat.icon}</span>}
                    <span>{cat.label}</span>
                    {cat.subs && <span style={{ fontSize: T.fs1, color: T.purple }}>▾ {cat.subs.length} types</span>}
                  </button>
                ))}
              </div>

              {/* Map recommendation based on selection */}
              {lookRanked.length > 0 && (
                <div style={{ borderTop: `1px solid ${T.purpleBorder}`, paddingTop: 8 }}>
                  <div style={{ fontSize: T.fs2, letterSpacing: 1.5, color: T.purple, marginBottom: 6 }}>BEST MAPS FOR {(lookCurrent?.label || "").toUpperCase()}</div>
                  {lookRanked.slice(0, 5).map((m, i) => {
                    const apiId = emapToApiId(m.mapId);
                    const isSel = selectedMapId === apiId;
                    return (
                      <div key={m.mapId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", marginBottom: 4, background: isSel ? T.purple + "11" : "transparent", border: `1px solid ${isSel ? T.purpleBorder : T.border}` }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: T.fs4, color: i === 0 ? T.purple : T.textDim, fontWeight: i === 0 ? "bold" : "normal" }}>#{i + 1} {m.mapName}</span>
                            <span style={{ fontSize: T.fs2, color: T.textDim }}>{m.matchCount} spot{m.matchCount !== 1 ? "s" : ""}</span>
                          </div>
                          <div style={{ fontSize: T.fs2, color: T.textDim, marginTop: 2 }}>{m.matchingSpots.slice(0, 3).join(", ")}{m.matchingSpots.length > 3 ? ` +${m.matchingSpots.length - 3}` : ""}</div>
                        </div>
                        {apiId && !isSel && <button onClick={(e) => { e.stopPropagation(); onSelectMap(apiId); }} style={{ background: T.purple + "22", border: `1px solid ${T.purple}`, color: T.purple, padding: "4px 10px", fontSize: T.fs1, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1, flexShrink: 0 }}>SELECT</button>}
                        {isSel && <Badge label="SELECTED" color={T.purple} />}
                      </div>
                    );
                  })}
                </div>
              )}
              {lookPath.length > 0 && lookRanked.length === 0 && (
                <div style={{ fontSize: T.fs3, color: T.textDim, textAlign: "center", padding: 8 }}>No maps have tagged loot spots for this category.</div>
              )}
            </div>
          )}

          {/* Runner-up maps (tasks & hideout modes) */}
          {(mode === "tasks" || mode === "hideout") && (() => {
            const ranked = mode === "hideout" ? itemRanked : taskRanked;
            return ranked.length > 1 ? (
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 4 }}>
                <div style={{ fontSize: T.fs2, letterSpacing: 1.5, color: T.textDim, marginBottom: 6 }}>OTHER OPTIONS</div>
                {ranked.slice(1, 4).map(m => (
                  <button key={m.mapId} onClick={(e) => { e.stopPropagation(); onSelectMap(m.mapId); }}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: selectedMapId === m.mapId ? T.cyan + "11" : "transparent", border: `1px solid ${selectedMapId === m.mapId ? T.cyanBorder : T.border}`, padding: "5px 8px", marginBottom: 4, cursor: "pointer", fontFamily: T.sans }}>
                    <span style={{ fontSize: T.fs3, color: selectedMapId === m.mapId ? T.cyan : T.textDim }}>#{m.rank} {m.mapName}</span>
                    <span style={{ fontSize: T.fs2, color: T.textDim }}>{mode === "tasks" ? `${m.totalTasks} task${m.totalTasks !== 1 ? "s" : ""}` : `${m.totalContainers} containers`}</span>
                  </button>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
