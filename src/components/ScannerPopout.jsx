import { useEffect, useState } from "react";
import { T } from "../theme.js";
import { useScanAndFetch } from "../hooks/useScanAndFetch.js";

const FLEA_UNLOCK_LEVEL = 15;

function formatPrice(price) {
  if (!price && price !== 0) return "\u2014";
  return price.toLocaleString() + " \u20BD";
}

// Subscribe to the profile stored in localStorage by the main window so the
// scanner popout can honor the user's pickup threshold + PMC level without
// a prop drill (the popout lives in a separate Tauri webview).
function useProfileSettings() {
  const [settings, setSettings] = useState({ threshold: 20000, pmcLevel: 1 });
  useEffect(() => {
    const refresh = () => {
      try {
        const raw = localStorage.getItem("tg-myprofile-v3");
        if (!raw) return;
        const p = JSON.parse(raw);
        const threshold = typeof p?.scannerThreshold === "number" ? p.scannerThreshold : 20000;
        const pmcLevel = typeof p?.pmcLevel === "number" ? p.pmcLevel : 1;
        setSettings({ threshold, pmcLevel });
      } catch (_) {}
    };
    refresh();
    const handler = (e) => { if (!e.key || e.key === "tg-myprofile-v3") refresh(); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  return settings;
}

export default function ScannerPopout() {
  const { scanning, scanStatus, item, dbLoading, toggleScanning } = useScanAndFetch({ autoStart: true });
  const { threshold, pmcLevel } = useProfileSettings();

  const bestSell = item?.sellFor
    ?.filter((s) => s.priceRUB > 0)
    .sort((a, b) => b.priceRUB - a.priceRUB)[0];
  const fleaPrice = item?.avg24hPrice || 0;
  const slots = (item?.width || 1) * (item?.height || 1);
  const change = item?.changeLast48hPercent;

  // Effective "best sell price" — flea only counts if the user has unlocked it.
  const canUseFlea = pmcLevel >= FLEA_UNLOCK_LEVEL;
  const fleaEligible = canUseFlea ? fleaPrice : 0;
  const bestSellRUB = bestSell?.priceRUB || 0;
  const bestRUB = Math.max(bestSellRUB, fleaEligible);
  const perSlot = bestRUB ? Math.round(bestRUB / slots) : null;
  const source =
    bestRUB === 0 ? null :
    bestSellRUB > fleaEligible ? (bestSell?.vendor?.name || "Trader") :
    "Flea";

  // Pickup decision: only render the ✓/✗ + border when we have real data.
  const hasVerdict = item && perSlot != null;
  const above = hasVerdict && perSlot >= threshold;
  const verdictColor = !hasVerdict ? null : above ? T.success : T.error;
  const verdictSymbol = !hasVerdict ? "" : above ? "\u2713" : "\u2717";

  return (
    <div style={{
      background: T.bg,
      color: T.text,
      fontFamily: T.sans,
      height: "100vh",
      width: "100vw",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      userSelect: "none",
      boxSizing: "border-box",
      borderLeft: `4px solid ${verdictColor || "transparent"}`,
    }}>
      {/* Header bar — scan status + controls */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        borderBottom: `1px solid ${T.border}`,
        background: T.surface,
        flexShrink: 0,
      }}>
        <button
          onClick={toggleScanning}
          disabled={dbLoading}
          style={{
            background: scanning ? T.cyanBg : "rgba(210,175,120,0.06)",
            border: `1px solid ${scanning ? T.cyan : T.border}`,
            color: scanning ? T.cyan : T.textDim,
            padding: "2px 10px",
            fontSize: T.fs1,
            fontFamily: T.sans,
            cursor: dbLoading ? "wait" : "pointer",
            borderRadius: T.r1,
            fontWeight: scanning ? "bold" : "normal",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {dbLoading ? "..." : scanning ? "\u25A0" : "\u25B6"}
        </button>
        <div style={{
          flex: 1,
          fontSize: T.fs1,
          color: scanning ? T.cyan : T.textDim,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {dbLoading ? "Loading items..." : scanStatus || (scanning ? "Scanning..." : "Paused")}
        </div>
      </div>

      {/* Item result */}
      <div style={{ flex: 1, padding: "6px 8px", overflow: "hidden" }}>
        {item ? (
          <div>
            {/* Item name row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: T.fs3,
                  color: T.textBright,
                  fontWeight: "bold",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {item.shortName}
                </div>
                <div style={{
                  fontSize: T.fs1,
                  color: T.textDim,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {item.name}
                </div>
              </div>
              {item.gridImageLink && (
                <img
                  src={item.gridImageLink}
                  alt=""
                  style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0, opacity: 0.8 }}
                />
              )}
            </div>

            {/* Price grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 10px", fontSize: T.fs2 }}>
              <div>
                <span style={{ color: T.textDim }}>Flea: </span>
                <span style={{ color: fleaPrice ? T.textBright : T.textDim }}>{formatPrice(fleaPrice)}</span>
                {change != null && change !== 0 && (
                  <span style={{ color: change > 0 ? T.success : T.error, marginLeft: 4, fontSize: T.fs1 }}>
                    {change > 0 ? "+" : ""}{Math.round(change)}%
                  </span>
                )}
              </div>
              <div>
                <span style={{ color: T.textDim }}>Per slot: </span>
                <span style={{ color: verdictColor || (perSlot ? T.textBright : T.textDim), fontWeight: hasVerdict ? "bold" : "normal" }}>
                  {perSlot ? formatPrice(perSlot) : "\u2014"}
                </span>
                {hasVerdict && (
                  <span style={{ color: verdictColor, marginLeft: 4 }}>{verdictSymbol}</span>
                )}
                <span style={{ color: T.textDim, fontSize: T.fs1 }}> ({slots}s)</span>
              </div>
              {hasVerdict && source && (
                <div style={{ gridColumn: "1 / -1", fontSize: T.fs1, color: T.textDim }}>
                  Best source: <span style={{ color: T.gold }}>{source}</span>
                  {" \u00B7 "}threshold {formatPrice(threshold)}/slot
                </div>
              )}
              {bestSell && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <span style={{ color: T.textDim }}>Sell: </span>
                  <span style={{ color: T.gold }}>{formatPrice(bestSell.priceRUB)}</span>
                  <span style={{ color: T.textDim }}> \u2192 {bestSell.vendor?.name}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: T.textDim,
            fontSize: T.fs2,
            textAlign: "center",
            lineHeight: 1.6,
          }}>
            {dbLoading ? "Loading item database..." : "Hover over items in Tarkov\nto see prices here"}
          </div>
        )}
      </div>
    </div>
  );
}
