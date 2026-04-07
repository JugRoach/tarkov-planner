import { T } from '../theme.js';

export default function BottomNav({ tab, setTab }) {
  const items = [{ id: "tasks", label: "Tasks", icon: "★" }, { id: "raid", label: "Raid", icon: "▶" }, { id: "builds", label: "Builds", icon: "⚙" }, { id: "intel", label: "Intel", icon: "◎" }, { id: "profile", label: "Profile", icon: "▲" }];
  return (
    <nav role="navigation" aria-label="Main navigation" style={{ display: "flex", borderTop: `1px solid rgba(210,175,120,0.15)`, background: T.surface, flexShrink: 0 }}>
      {items.map(item => <button key={item.id} onClick={() => setTab(item.id)} aria-label={item.label} aria-current={tab === item.id ? "page" : undefined} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 4px 10px", background: tab === item.id ? "rgba(210,175,120,0.08)" : "transparent", border: "none", cursor: "pointer", borderTop: `2px solid ${tab === item.id ? T.gold : "transparent"}`, transition: "all 0.15s ease" }}><span style={{ fontSize: T.fs4, marginBottom: 3, opacity: tab === item.id ? 1 : 0.5 }}>{item.icon}</span><span style={{ fontSize: T.fs2, letterSpacing: 0.8, fontWeight: tab === item.id ? "bold" : "normal", fontFamily: T.sans, textTransform: "uppercase", color: tab === item.id ? T.gold : T.textDim }}>{item.label}</span></button>)}
    </nav>
  );
}
