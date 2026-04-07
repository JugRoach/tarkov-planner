import { useState } from "react";
import { T } from '../theme.js';

export default function PostRaidTracker({ route, myProfile, onSave, onClose }) {
  const [updates, setUpdates] = useState({});
  const myId = myProfile.id;
  const trackable = [];
  route.forEach(w => !w.isExtract && w.players?.filter(p => p.playerId === myId).forEach(p => { if (p.isCountable) trackable.push({ ...p }); }));
  const key = p => `${p.playerId}-${p.taskId}-${p.objId}`;
  const set = (k, v) => setUpdates(u => ({ ...u, [k]: v }));
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(13,14,16,0.94)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", zIndex: 70, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "12px 14px", flexShrink: 0 }}>
        <div style={{ fontSize: T.fs2, color: T.textDim, letterSpacing: 1.5, marginBottom: 4 }}>POST-RAID — MY PROGRESS</div>
        <div style={{ fontSize: T.fs4, color: T.textBright, fontWeight: "bold" }}>How did your raid go?</div>
        <div style={{ fontSize: T.fs2, color: T.textDim, marginTop: 3 }}>Only your objectives. Copy updated code after saving.</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {trackable.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: T.fs2, textAlign: "center", padding: 32, fontFamily: T.sans }}>No countable objectives this raid.</div>
        ) : trackable.map((p, i) => {
          const k = key(p); const cur = updates[k]; const done = (myProfile.progress || {})[k] || 0; const remaining = Math.max(0, p.total - done);
          return (
            <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `2px solid ${p.color || T.gold}`, padding: 10, marginBottom: 8 }}>
              <div style={{ fontSize: T.fs2, color: T.textBright, fontWeight: "bold", marginBottom: 4 }}>{p.objective}</div>
              <div style={{ fontSize: T.fs3, color: T.textDim, marginBottom: 8 }}>Progress: {done}/{p.total} — need {remaining} more</div>
              {p.total === 1 ? (
                <div style={{ display: "flex", gap: 8 }}>
                  {["Done ✓", "Not done"].map((opt, oi) => (
                    <button key={opt} onClick={() => set(k, oi === 0 ? 1 : 0)} style={{ flex: 1, padding: "7px 0", background: cur === (oi === 0 ? 1 : 0) && cur !== undefined ? (oi === 0 ? T.successBg : T.errorBg) : "transparent", border: `1px solid ${cur === (oi === 0 ? 1 : 0) && cur !== undefined ? (oi === 0 ? T.successBorder : T.errorBorder) : T.border}`, color: cur === (oi === 0 ? 1 : 0) && cur !== undefined ? (oi === 0 ? T.success : T.error) : T.textDim, cursor: "pointer", fontFamily: T.sans, fontSize: 9 }}>{opt.toUpperCase()}</button>
                  ))}
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: T.fs2, color: T.textDim, letterSpacing: 1, marginBottom: 6 }}>COMPLETED THIS RAID:</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {Array.from({ length: Math.min(remaining + 1, 10) }, (_, n) => (
                      <button key={n} onClick={() => set(k, n)} style={{ width: 36, height: 36, background: cur === n ? (p.color || T.gold) + "22" : "transparent", border: `1px solid ${cur === n ? (p.color || T.gold) : T.border}`, color: cur === n ? (p.color || T.gold) : T.textDim, cursor: "pointer", fontFamily: T.sans, fontSize: 12 }}>{n}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ padding: 12, display: "flex", gap: 8, borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button onClick={onClose} style={{ flex: 1, background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "10px 0", fontSize: T.fs4, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1, textTransform: "uppercase" }}>Cancel</button>
        <button onClick={() => { const newProg = { ...(myProfile.progress || {}) }; Object.entries(updates).forEach(([k, v]) => { newProg[k] = Math.min((newProg[k] || 0) + v, 9999); }); onSave(newProg); onClose(); }} style={{ flex: 2, background: T.success + "22", border: `1px solid ${T.successBorder}`, color: T.success, padding: "10px 0", fontSize: T.fs4, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1, textTransform: "uppercase", fontWeight: "bold" }}>✓ SAVE MY PROGRESS</button>
      </div>
    </div>
  );
}
