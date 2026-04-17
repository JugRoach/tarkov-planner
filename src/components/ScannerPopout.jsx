import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme.js";
import { API_URL } from "../constants.js";
import { findBestMatch } from "../lib/fuzzyMatch.js";

const ALL_ITEMS_Q = `{items(gameMode:pve){id name shortName width height}}`;

const ITEM_PRICE_Q = (id, gameMode = "pve") =>
  `{item(id:"${id}", gameMode:${gameMode}){
    id name shortName width height gridImageLink
    avg24hPrice basePrice changeLast48hPercent
    sellFor { price priceRUB currency vendor { name } }
    buyFor { price priceRUB currency vendor { ... on TraderOffer { name minTraderLevel } ... on FleaMarket { name } } }
  }}`;

async function fetchGql(query) {
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return (await r.json()).data;
}

function formatPrice(price) {
  if (!price && price !== 0) return "\u2014";
  return price.toLocaleString() + " \u20BD";
}

export default function ScannerPopout() {
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);
  const [item, setItem] = useState(null);
  const [itemDb, setItemDb] = useState(null);
  const [dbLoading, setDbLoading] = useState(true);
  const lastScanRef = useRef("");
  const scanIntervalRef = useRef(null);
  const tauriInvokeRef = useRef(null);

  // Load item database
  useEffect(() => {
    fetchGql(ALL_ITEMS_Q)
      .then((data) => setItemDb(data?.items || []))
      .catch(() => setItemDb([]))
      .finally(() => setDbLoading(false));
  }, []);

  // Load Tauri invoke
  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        tauriInvokeRef.current = invoke;
      } catch (_) {}
    })();
  }, []);

  const cleanOcr = useCallback((raw) => {
    return raw.replace(/[,.:;!|{}\[\]()]/g, "").replace(/\s+/g, " ").trim();
  }, []);

  const runScan = useCallback(async () => {
    if (!tauriInvokeRef.current || !itemDb?.length) return;
    try {
      const lines = await tauriInvokeRef.current("scan_at_cursor");
      if (!lines || lines.length === 0) return;

      const raw = lines.join(" ").trim();
      const cleaned = cleanOcr(raw);
      if (cleaned === lastScanRef.current || cleaned.length < 2) return;
      lastScanRef.current = cleaned;

      let bestMatch = findBestMatch(cleaned, itemDb);
      if (!bestMatch) {
        const words = cleaned.split(/\s+/).filter((w) => w.length >= 2);
        words.sort((a, b) => b.length - a.length);
        for (const word of words) {
          const match = findBestMatch(word, itemDb);
          if (match && (!bestMatch || match.score > bestMatch.score)) {
            bestMatch = match;
          }
        }
      }

      if (bestMatch) {
        const { item: matched, score } = bestMatch;
        setScanStatus(`"${cleaned}" \u2192 ${matched.shortName} (${Math.round(score * 100)}%)`);
        const priced = await fetchGql(ITEM_PRICE_Q(matched.id));
        if (priced?.item) setItem(priced.item);
      } else {
        setScanStatus(`No match: "${cleaned}"`);
      }
    } catch (_) {}
  }, [cleanOcr, itemDb]);

  // Toggle scanning
  const toggleScanning = useCallback(() => {
    setScanning((prev) => {
      const next = !prev;
      if (next) {
        lastScanRef.current = "";
        runScan();
        scanIntervalRef.current = setInterval(runScan, 750);
      } else {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return next;
    });
  }, [runScan]);

  // Auto-start scanning once DB is loaded
  useEffect(() => {
    if (!dbLoading && itemDb?.length && tauriInvokeRef.current && !scanning) {
      toggleScanning();
    }
  }, [dbLoading, itemDb]);

  // Cleanup
  useEffect(() => {
    return () => { if (scanIntervalRef.current) clearInterval(scanIntervalRef.current); };
  }, []);

  // Listen for Alt+S hotkey
  useEffect(() => {
    let unlisten;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("toggle-scan", () => toggleScanning());
      } catch (_) {}
    })();
    return () => { if (unlisten) unlisten(); };
  }, [toggleScanning]);

  // Derived price data
  const bestSell = item?.sellFor
    ?.filter((s) => s.priceRUB > 0)
    .sort((a, b) => b.priceRUB - a.priceRUB)[0];
  const fleaPrice = item?.avg24hPrice;
  const slots = (item?.width || 1) * (item?.height || 1);
  const perSlot = fleaPrice ? Math.round(fleaPrice / slots) : null;
  const change = item?.changeLast48hPercent;

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
                <span style={{ color: perSlot ? T.textBright : T.textDim }}>{perSlot ? formatPrice(perSlot) : "\u2014"}</span>
                <span style={{ color: T.textDim, fontSize: T.fs1 }}> ({slots}s)</span>
              </div>
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
