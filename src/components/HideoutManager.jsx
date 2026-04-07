import { useState } from "react";
import { T } from '../theme.js';
import { SL, Badge, Tip } from './ui/index.js';

export default function HideoutManager({ apiHideout, hideoutLevels, saveHideoutLevels, hideoutTarget, saveHideoutTarget, onBack }) {
  const [prereqPrompt, setPrereqPrompt] = useState(null); // { stationName, level, unmet: [{stationId, stationName, level}] }
  if (!apiHideout?.length) return <div style={{ color: T.textDim, fontSize: T.fs4, padding: 20, textAlign: "center" }}>Loading hideout data...</div>;

  const stations = apiHideout.filter(s => s.levels.length > 0).sort((a, b) => a.name.localeCompare(b.name));
  const target = hideoutTarget ? stations.find(s => s.id === hideoutTarget.stationId) : null;
  const targetLevel = target?.levels.find(l => l.level === hideoutTarget?.level);

  // Check if station level requirements are met
  const canBuild = (station, level) => {
    const lvl = station.levels.find(l => l.level === level);
    if (!lvl) return false;
    return (lvl.stationLevelRequirements || []).every(req =>
      (hideoutLevels[req.station.id] || 0) >= req.level
    );
  };

  // Get unmet prerequisites for a station level
  const getUnmetPrereqs = (station, level) => {
    const lvl = station.levels.find(l => l.level === level);
    if (!lvl) return [];
    return (lvl.stationLevelRequirements || [])
      .filter(req => (hideoutLevels[req.station.id] || 0) < req.level)
      .map(req => ({ stationId: req.station.id, stationName: req.station.name, level: req.level }));
  };

  // Handle target button click — show prereq prompt if needed
  const handleTargetClick = (station, level, isThisTarget) => {
    if (isThisTarget) { saveHideoutTarget(null); return; }
    const unmet = getUnmetPrereqs(station, level);
    if (unmet.length > 0) {
      setPrereqPrompt({ stationName: station.name, stationId: station.id, level, unmet });
    } else {
      saveHideoutTarget({ stationId: station.id, level });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "10px 14px" }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", color: T.textDim, fontSize: T.fs3, letterSpacing: 1, cursor: "pointer", fontFamily: T.sans, padding: 0, marginBottom: 8 }}>← BACK</button>
        <SL c={<>HIDEOUT UPGRADES<Tip text="Set your current hideout levels, then pick which upgrade you're working toward. The Raid tab will recommend maps where you're most likely to find the items you need." /></>} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {/* Target upgrade selection */}
        {target && targetLevel && (
          <div style={{ background: T.cyanBg, border: `1px solid ${T.cyanBorder}`, borderLeft: `2px solid ${T.cyan}`, padding: 12, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: T.fs2, letterSpacing: 1.5, color: T.cyan, marginBottom: 2 }}>TARGET UPGRADE</div>
                <div style={{ fontSize: T.fs3, color: T.textBright, fontWeight: "bold" }}>{target.name} → Level {hideoutTarget.level}</div>
              </div>
              <button onClick={() => saveHideoutTarget(null)} style={{ background: "transparent", border: `1px solid ${T.errorBorder}`, color: T.error, padding: "4px 8px", fontSize: T.fs3, cursor: "pointer", fontFamily: T.sans }}>CLEAR</button>
            </div>
            <div style={{ fontSize: T.fs2, letterSpacing: 1, color: T.textDim, marginBottom: 6 }}>ITEMS NEEDED:</div>
            {targetLevel.itemRequirements.map((req, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: T.fs2, color: T.text }}>{req.item.name}</span>
                <Badge label={`×${req.count}`} color={T.cyan} small />
              </div>
            ))}
            {targetLevel.traderRequirements?.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {targetLevel.traderRequirements.map((req, i) => (
                  <div key={i} style={{ fontSize: T.fs3, color: T.orange, marginTop: 2 }}>Requires {req.trader.name} LL{req.level}</div>
                ))}
              </div>
            )}
            {targetLevel.stationLevelRequirements?.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {targetLevel.stationLevelRequirements.map((req, i) => {
                  const met = (hideoutLevels[req.station.id] || 0) >= req.level;
                  return <div key={i} style={{ fontSize: T.fs3, color: met ? T.success : T.error, marginTop: 2 }}>{met ? "✓" : "✕"} {req.station.name} Level {req.level}</div>;
                })}
              </div>
            )}
          </div>
        )}

        {/* Prerequisite prompt */}
        {prereqPrompt && (
          <div style={{ background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderLeft: `2px solid ${T.orange}`, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: T.fs2, letterSpacing: 1.5, color: T.orange, marginBottom: 6 }}>PREREQUISITES NEEDED</div>
            <div style={{ fontSize: T.fs2, color: T.text, lineHeight: 1.6, marginBottom: 10 }}>
              <span style={{ color: T.textBright, fontWeight: "bold" }}>{prereqPrompt.stationName} Level {prereqPrompt.level}</span> requires upgrades you don't have yet. Target a prerequisite first?
            </div>
            {prereqPrompt.unmet.map((req, i) => {
              const prereqStation = stations.find(s => s.id === req.stationId);
              const prereqItems = prereqStation?.levels.find(l => l.level === req.level)?.itemRequirements?.filter(r => r.item.name !== "Roubles") || [];
              return (
                <button key={i} onClick={() => { saveHideoutTarget({ stationId: req.stationId, level: req.level }); setPrereqPrompt(null); }}
                  style={{ width: "100%", background: T.cyanBg, border: `1px solid ${T.cyanBorder}`, padding: "8px 10px", marginBottom: 4, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: T.fs2, color: T.cyan, fontWeight: "bold" }}>{req.stationName} → Level {req.level}</div>
                  {prereqItems.length > 0 && <div style={{ fontSize: T.fs2, color: T.textDim, marginTop: 2 }}>{prereqItems.slice(0, 4).map(r => `${r.item.shortName || r.item.name} ×${r.count}`).join(", ")}{prereqItems.length > 4 ? " ..." : ""}</div>}
                </button>
              );
            })}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={() => { saveHideoutTarget({ stationId: prereqPrompt.stationId, level: prereqPrompt.level }); setPrereqPrompt(null); }}
                style={{ flex: 1, background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "6px 0", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1 }}>TARGET ANYWAY</button>
              <button onClick={() => setPrereqPrompt(null)}
                style={{ flex: 1, background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "6px 0", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1 }}>CANCEL</button>
            </div>
          </div>
        )}

        {/* Station grid */}
        <SL c={<>YOUR HIDEOUT LEVELS<Tip text="Tap the number buttons to set your current level for each station. Then tap a 'TARGET' button on any station to mark the upgrade you're saving items for." /></>} s={{ marginBottom: 10 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {stations.map(station => {
            const curLevel = hideoutLevels[station.id] || 0;
            const maxLevel = Math.max(...station.levels.map(l => l.level));
            const isTarget = hideoutTarget?.stationId === station.id;

            return (
              <div key={station.id} style={{
                background: isTarget ? T.cyanBg : T.surface,
                border: `1px solid ${isTarget ? T.cyan + "44" : T.border}`,
                borderLeft: `2px solid ${curLevel >= maxLevel ? T.successBorder : (isTarget ? T.cyan : T.borderBright)}`,
                padding: "8px 10px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: T.fs2, color: curLevel >= maxLevel ? T.success : T.textBright, fontWeight: "bold" }}>
                    {station.name}
                    {curLevel >= maxLevel && <span style={{ fontSize: T.fs2, color: T.successBorder, marginLeft: 5 }}>MAX</span>}
                  </div>
                  <div style={{ fontSize: T.fs3, color: T.textDim }}>Lv {curLevel}/{maxLevel}</div>
                </div>

                {/* Level selector */}
                <div style={{ display: "flex", gap: 4, marginBottom: 4, flexWrap: "wrap" }}>
                  {Array.from({ length: maxLevel + 1 }, (_, i) => (
                    <button key={i} onClick={() => saveHideoutLevels({ ...hideoutLevels, [station.id]: i })}
                      style={{
                        width: 28, height: 24, fontSize: T.fs3, fontFamily: T.mono,
                        background: curLevel === i ? T.gold + "22" : "transparent",
                        border: `1px solid ${curLevel === i ? T.gold : T.border}`,
                        color: curLevel === i ? T.gold : (i <= curLevel ? T.success : T.textDim),
                        cursor: "pointer",
                      }}>{i}</button>
                  ))}
                </div>

                {/* Set as target buttons for levels above current */}
                {curLevel < maxLevel && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {station.levels.filter(l => l.level > curLevel).map(l => {
                      const isThisTarget = isTarget && hideoutTarget.level === l.level;
                      const buildable = canBuild(station, l.level);
                      return (
                        <button key={l.level}
                          onClick={() => handleTargetClick(station, l.level, isThisTarget)}
                          style={{
                            background: isThisTarget ? T.cyan + "22" : "transparent",
                            border: `1px solid ${isThisTarget ? T.cyan : T.border}`,
                            color: isThisTarget ? T.cyan : (buildable ? T.textDim : T.errorBorder),
                            padding: "2px 8px", fontSize: T.fs1, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1,
                          }}
                        >{isThisTarget ? "★ " : ""}TARGET L{l.level}{!buildable ? " (prereq)" : ""}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ height: 20 }} />
      </div>
    </div>
  );
}
