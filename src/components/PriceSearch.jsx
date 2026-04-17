import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme.js";
import { API_URL } from "../constants.js";
import { findBestMatch } from "../lib/fuzzyMatch.js";

// Query for manual search (with prices)
const PRICE_SEARCH_Q = (term, gameMode = "pve") =>
  `{items(name:"${term.replace(/["\\\n\r]/g, "")}", limit:10, gameMode:${gameMode}){
    id name shortName width height gridImageLink
    avg24hPrice basePrice changeLast48hPercent
    sellFor { price priceRUB currency vendor { name } }
    buyFor { price priceRUB currency vendor { ... on TraderOffer { name minTraderLevel } ... on FleaMarket { name } } }
  }}`;

// Query to load full item database (lightweight — just names and IDs)
const ALL_ITEMS_Q = `{items(gameMode:pve){id name shortName width height}}`;

// Query to get price for a specific item by ID
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

async function searchItems(term) {
  if (term.length < 2) return [];
  const data = await fetchGql(PRICE_SEARCH_Q(term));
  return data?.items || [];
}

async function getItemPrice(id) {
  const data = await fetchGql(ITEM_PRICE_Q(id));
  return data?.item || null;
}

function formatPrice(price) {
  if (!price && price !== 0) return "—";
  return price.toLocaleString() + " ₽";
}

function ItemPriceCard({ item }) {
  const bestSell = item.sellFor
    ?.filter((s) => s.priceRUB > 0)
    .sort((a, b) => b.priceRUB - a.priceRUB)[0];
  const fleaPrice = item.avg24hPrice;
  const slots = (item.width || 1) * (item.height || 1);
  const perSlot = fleaPrice ? Math.round(fleaPrice / slots) : null;
  const change = item.changeLast48hPercent;

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${T.gold}`,
        padding: "8px 10px",
        marginBottom: 4,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: T.fs2, color: T.textBright, fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.shortName}
          </div>
          <div style={{ fontSize: T.fs1, color: T.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.name}
          </div>
        </div>
        {item.gridImageLink && (
          <img
            src={item.gridImageLink}
            alt=""
            style={{ width: 48, height: 48, objectFit: "contain", flexShrink: 0, opacity: 0.8 }}
          />
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginTop: 6, fontSize: T.fs1 }}>
        <div>
          <span style={{ color: T.textDim }}>Flea: </span>
          <span style={{ color: fleaPrice ? T.textBright : T.textDim }}>{formatPrice(fleaPrice)}</span>
          {change != null && change !== 0 && (
            <span style={{ color: change > 0 ? T.success : T.error, marginLeft: 4 }}>
              {change > 0 ? "+" : ""}{Math.round(change)}%
            </span>
          )}
        </div>
        <div>
          <span style={{ color: T.textDim }}>Per slot: </span>
          <span style={{ color: perSlot ? T.textBright : T.textDim }}>{perSlot ? formatPrice(perSlot) : "—"}</span>
          <span style={{ color: T.textDim, marginLeft: 2 }}>({slots}s)</span>
        </div>
        {bestSell && (
          <div style={{ gridColumn: "1 / -1" }}>
            <span style={{ color: T.textDim }}>Best sell: </span>
            <span style={{ color: T.gold }}>{formatPrice(bestSell.priceRUB)}</span>
            <span style={{ color: T.textDim }}> → {bestSell.vendor?.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PriceSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);
  const [itemDb, setItemDb] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [popoutTip, setPopoutTip] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const lastScanRef = useRef("");
  const scanIntervalRef = useRef(null);
  const tauriInvokeRef = useRef(null);

  // Load full item database on mount
  useEffect(() => {
    setDbLoading(true);
    fetchGql(ALL_ITEMS_Q)
      .then((data) => setItemDb(data?.items || []))
      .catch(() => setItemDb([]))
      .finally(() => setDbLoading(false));
  }, []);

  // Manual search (typing)
  const doSearch = useCallback((term) => {
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    searchItems(term)
      .then((items) => setResults(items))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (scanning) return; // Don't run manual search while scanning
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query), 200);
    return () => clearTimeout(debounceRef.current);
  }, [query, doSearch, scanning]);

  // Load Tauri invoke
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        tauriInvokeRef.current = invoke;
      } catch (_) {}
    })();
  }, []);

  // Clean OCR text — only strip punctuation, don't replace digits
  const cleanOcr = useCallback((raw) => {
    return raw
      .replace(/[,.:;!|{}\[\]()]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  // Run a single scan — fuzzy match against local item DB
  const runScan = useCallback(async () => {
    if (!tauriInvokeRef.current || !itemDb?.length) return;
    try {
      const lines = await tauriInvokeRef.current("scan_at_cursor");
      if (!lines || lines.length === 0) return;

      const raw = lines.join(" ").trim();
      const cleaned = cleanOcr(raw);
      if (cleaned === lastScanRef.current || cleaned.length < 2) return;
      lastScanRef.current = cleaned;

      // Always try the full string first — it has the most context. Only
      // fall back to individual words if the full string doesn't match above
      // threshold (avoids single-token false positives like "Striker"
      // matching "Lucky Strike Cigarettes" and beating the correct answer).
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
        const { item, score } = bestMatch;
        setScanStatus(`"${cleaned}" → ${item.shortName} (${Math.round(score * 100)}%)`);
        setQuery(item.shortName);

        // Fetch full price data for the matched item
        const priced = await getItemPrice(item.id);
        if (priced) {
          setResults([priced]);
          setLoading(false);
        }
      } else {
        setScanStatus(`No match: "${cleaned}"`);
      }
    } catch (e) {
      // Silently ignore
    }
  }, [cleanOcr, itemDb]);

  // Toggle continuous scanning
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
        setScanStatus(null);
      }
      return next;
    });
  }, [runScan]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, []);

  // Listen for Alt+S hotkey
  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return;
    let unlisten;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("toggle-scan", () => {
          toggleScanning();
        });
      } catch (_) {}
    })();
    return () => { if (unlisten) unlisten(); };
  }, [toggleScanning]);

  return (
    <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); lastScanRef.current = ""; }}
          placeholder="Type item name or use Auto Scan..."
          style={{
            ...T.input,
            flex: 1,
            fontSize: T.fs2,
            borderColor: scanning ? T.cyan : T.gold,
          }}
        />
        {window.__TAURI_INTERNALS__ && (
          <>
            <button
              onClick={toggleScanning}
              disabled={dbLoading}
              title={scanning ? "Stop auto-scan (Alt+S)" : "Start auto-scan — reads item names as you hover (Alt+S)"}
              style={{
                background: scanning ? T.cyanBg : "rgba(210,175,120,0.06)",
                border: `1px solid ${scanning ? T.cyan : T.border}`,
                color: scanning ? T.cyan : T.textDim,
                padding: "0 12px",
                fontSize: T.fs1,
                fontFamily: T.sans,
                cursor: dbLoading ? "wait" : "pointer",
                borderRadius: T.r1,
                letterSpacing: 0.5,
                whiteSpace: "nowrap",
                fontWeight: scanning ? "bold" : "normal",
                opacity: dbLoading ? 0.5 : 1,
              }}
            >
              {dbLoading ? "LOADING..." : scanning ? "■ STOP" : "▶ SCAN"}
            </button>
            <div style={{ position: "relative" }}>
              <button
                onClick={async () => {
                  try {
                    const { invoke } = await import("@tauri-apps/api/core");
                    await invoke("open_scanner_popout");
                  } catch (_) {}
                }}
                onMouseEnter={() => setPopoutTip(true)}
                onMouseLeave={() => setPopoutTip(false)}
                title="Pop out scanner into a mini overlay (Alt+P)"
                style={{
                  background: "rgba(210,175,120,0.06)",
                  border: `1px solid ${T.border}`,
                  color: T.textDim,
                  padding: "0 10px",
                  fontSize: T.fs1,
                  fontFamily: T.sans,
                  cursor: "pointer",
                  borderRadius: T.r1,
                  whiteSpace: "nowrap",
                }}
              >
                POP
              </button>
              {popoutTip && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 4,
                  padding: "6px 10px",
                  background: T.surface,
                  border: `1px solid ${T.gold}`,
                  borderRadius: T.r1,
                  fontSize: T.fs1,
                  color: T.text,
                  whiteSpace: "nowrap",
                  zIndex: 100,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}>
                  <span style={{ color: T.gold, fontWeight: "bold" }}>Tip:</span> Opens a tiny always-on-top scanner window.
                  <br />Auto-scans items as you hover in-game. (Alt+P)
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {scanStatus && (
        <div style={{
          padding: "4px 10px",
          marginBottom: 6,
          background: T.cyanBg,
          border: `1px solid ${T.cyanBorder}`,
          color: T.cyan,
          fontSize: T.fs1,
          borderRadius: T.r1,
        }}>
          {scanStatus}
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div style={{ color: T.textDim, fontSize: T.fs1, padding: 8, textAlign: "center" }}>Searching...</div>}
        {!loading && query.length >= 2 && results.length === 0 && (
          <div style={{ color: T.textDim, fontSize: T.fs1, padding: 8, textAlign: "center" }}>No items found</div>
        )}
        {results.map((item) => (
          <ItemPriceCard key={item.id} item={item} />
        ))}
        {!query && !scanning && (
          <div style={{ color: T.textDim, fontSize: T.fs1, padding: 12, textAlign: "center", lineHeight: 1.8 }}>
            <div style={{ marginBottom: 8 }}>Type an item name to check prices</div>
            <div style={{ color: T.cyan, fontSize: T.fs2, fontWeight: "bold", marginBottom: 4 }}>▶ SCAN or Alt+S</div>
            <div>Hover over items in Tarkov and prices appear automatically.</div>
            {itemDb && <div style={{ marginTop: 8, color: T.textDim }}>{itemDb.length.toLocaleString()} items loaded for matching</div>}
          </div>
        )}
      </div>
    </div>
  );
}
