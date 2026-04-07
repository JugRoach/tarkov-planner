import { useState } from "react";
import { T } from '../theme.js';
import { SL, Badge } from './ui/index.js';
import { ET_CONFIG } from '../lib/configData.js';

export default function ExtractSelector({ player, mapData, faction, choice, onChoice }) {
  const [pendingExtract, setPendingExtract] = useState(null); // extract being confirmed
  const [itemChecks, setItemChecks] = useState({}); // {itemName: true/false}

  const extracts = faction === "pmc" ? mapData.pmcExtracts : mapData.scavExtracts;
  const usable = extracts.filter(e => e.type !== "coop");

  const handleSelect = (ext) => {
    if (ext.requireItems.length === 0) {
      // Open extract — confirm immediately
      onChoice({ extract: ext, confirmed: true, missingItems: [] });
      setPendingExtract(null);
    } else {
      // Non-open — show item check
      setPendingExtract(ext);
      setItemChecks({});
    }
  };

  const confirmItems = () => {
    const missing = pendingExtract.requireItems.filter(item => !itemChecks[item]);
    onChoice({ extract: pendingExtract, confirmed: missing.length === 0, missingItems: missing });
    setPendingExtract(null);
  };

  const cfg = choice?.extract ? ET_CONFIG[choice.extract.type] : null;

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Current selection display */}
      {choice?.extract ? (
        <div style={{
          background: choice.confirmed ? cfg.bg : T.errorBg,
          border: `1px solid ${choice.confirmed ? cfg.border : T.errorBorder}`,
          borderLeft: `2px solid ${choice.confirmed ? cfg.color : T.error}`,
          padding: "8px 10px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: T.fs3, color: choice.confirmed ? cfg.color : T.error, fontWeight: "bold" }}>
                {choice.confirmed ? "⬆ " : "⚠ "}{choice.extract.name}
              </span>
              <Badge label={ET_CONFIG[choice.extract.type].label} color={cfg.color} small />
            </div>
            <button onClick={() => onChoice(null)} style={{ background: "transparent", border: "none", color: T.textDim, cursor: "pointer", fontSize: T.fs3, fontFamily: T.sans }}>
              CHANGE
            </button>
          </div>
          {!choice.confirmed && choice.missingItems?.length > 0 && (
            <div style={{ fontSize: T.fs3, color: T.error, marginTop: 5, lineHeight: 1.5 }}>
              ⚠ Missing: {choice.missingItems.join(", ")} — this extract may not be usable. Consider a different exit.
            </div>
          )}
          {choice.confirmed && choice.extract.type !== "open" && (
            <div style={{ fontSize: T.fs3, color: cfg.color, marginTop: 4, opacity: 0.8 }}>
              ✓ Items confirmed — extract added as final route waypoint
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: T.surface, border: `1px dashed ${T.border}`, padding: "8px 10px" }}>
          <div style={{ fontSize: T.fs3, color: T.textDim, marginBottom: 7 }}>Select extract for {player.name}:</div>
          <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {usable.map(ext => {
              const c = ET_CONFIG[ext.type];
              const isSelected = choice?.extract?.name === ext.name;
              return (
                <button key={ext.name} role="radio" aria-checked={isSelected} onClick={() => handleSelect(ext)} style={{
                  background: "transparent", border: `1px solid ${c.border}`,
                  borderLeft: `2px solid ${c.color}`, color: T.textBright,
                  padding: "7px 10px", textAlign: "left", cursor: "pointer",
                  fontFamily: T.sans, fontSize: T.fs4, display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span>{ext.name}</span>
                  <span style={{ fontSize: T.fs2, color: c.color }}>{c.icon} {c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Item check modal */}
      {pendingExtract && (
        <div style={{ background: T.errorBg, border: `1px solid ${T.errorBorder}`, borderLeft: `2px solid ${T.error}`, padding: 12, marginTop: 6 }}>
          <div style={{ fontSize: T.fs3, color: T.error, letterSpacing: 1, marginBottom: 6 }}>EXTRACT REQUIREMENTS CHECK</div>
          <div style={{ fontSize: T.fs3, color: T.textBright, fontWeight: "bold", marginBottom: 6 }}>{pendingExtract.name}</div>
          <div style={{ fontSize: T.fs2, color: T.text, lineHeight: 1.6, marginBottom: 10 }}>{pendingExtract.note}</div>
          <SL c="DO YOU HAVE THESE ITEMS IN YOUR LOADOUT?" s={{ marginBottom: 8 }} />
          {pendingExtract.requireItems.map(item => (
            <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <button onClick={() => setItemChecks(c => ({ ...c, [item]: !c[item] }))} style={{
                width: 20, height: 20, flexShrink: 0,
                background: itemChecks[item] ? T.successBg : "transparent",
                border: `1px solid ${itemChecks[item] ? T.successBorder : T.borderBright}`,
                color: itemChecks[item] ? T.success : T.textDim,
                cursor: "pointer", fontSize: T.fs3, display: "flex", alignItems: "center", justifyContent: "center",
              }}>{itemChecks[item] ? "✓" : ""}</button>
              <span style={{ fontSize: T.fs4, color: itemChecks[item] ? T.success : T.textBright }}>{item}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => setPendingExtract(null)} style={{ flex: 1, background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "8px 0", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1 }}>
              ← PICK ANOTHER
            </button>
            <button onClick={confirmItems} style={{
              flex: 2,
              background: pendingExtract.requireItems.every(i => itemChecks[i]) ? T.successBg : T.errorBg,
              border: `1px solid ${pendingExtract.requireItems.every(i => itemChecks[i]) ? T.successBorder : T.errorBorder}`,
              color: pendingExtract.requireItems.every(i => itemChecks[i]) ? T.success : T.error,
              padding: "8px 0", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1,
            }}>
              {pendingExtract.requireItems.every(i => itemChecks[i]) ? "✓ CONFIRM — ADD TO ROUTE" : "⚠ CONFIRM ANYWAY (MISSING ITEMS)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
