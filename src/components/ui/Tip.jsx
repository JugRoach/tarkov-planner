import { useState } from "react";
import { T } from '../../theme.js';

export default function Tip({ text, step }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{
          width: 24, height: 24, borderRadius: "50%",
          background: open ? T.surfaceAlt : "transparent",
          border: `1px solid ${open ? T.gold : T.border}`,
          color: open ? T.gold : T.textDim,
          fontSize: 12, fontWeight: "bold", fontFamily: T.sans,
          cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
          padding: 0, marginLeft: 6, flexShrink: 0,
        }}
      >?</button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: 22, left: -8, zIndex: 50,
            background: T.surface, border: `1px solid ${T.gold}55`,
            borderLeft: `2px solid ${T.gold}`,
            padding: "8px 10px", minWidth: 220, maxWidth: 280,
            boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
          }}
        >
          {step && <div style={{ fontSize: T.fs2, letterSpacing: 1.5, color: T.gold, marginBottom: 4, fontFamily: T.sans }}>{step}</div>}
          <div style={{ fontSize: T.fs3, color: T.text, lineHeight: 1.6, fontFamily: T.sans }}>{text}</div>
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            style={{ background: "transparent", border: "none", color: T.textDim, fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, padding: "4px 0 0", letterSpacing: 0.5 }}
          >DISMISS</button>
        </div>
      )}
    </span>
  );
}
