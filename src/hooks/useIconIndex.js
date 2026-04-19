import { useState, useEffect, useRef } from "react";
import { buildIconIndex, serializeIndex, deserializeIndex } from "../lib/iconHash.js";
import { API_URL } from "../constants.js";

const STORAGE_KEY = "tg-icon-index-v1";
const VERSION_KEY = "tg-icon-index-version";
// Bump when the hash format changes so stale indexes get rebuilt.
const INDEX_VERSION = 1;

const ITEM_LIST_Q = `{items(gameMode:pve){id name shortName width height gridImageLink}}`;

async function fetchItemList() {
  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: ITEM_LIST_Q }),
  });
  return (await r.json()).data?.items || [];
}

// localStorage can hold strings up to ~5MB per origin; our serialized index
// is ~400KB binary. Base64 encoding inflates to ~530KB. Safe.
function saveIndex(index) {
  const buf = serializeIndex(index);
  let bin = "";
  const bytes = new Uint8Array(buf);
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  localStorage.setItem(STORAGE_KEY, btoa(bin));
  localStorage.setItem(VERSION_KEY, String(INDEX_VERSION));
}

function loadIndex() {
  try {
    const v = Number(localStorage.getItem(VERSION_KEY));
    if (v !== INDEX_VERSION) return null;
    const b64 = localStorage.getItem(STORAGE_KEY);
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return deserializeIndex(bytes.buffer);
  } catch (_) {
    return null;
  }
}

/**
 * Manages the icon-hash index lifecycle.
 *   - On mount: load from localStorage if fresh.
 *   - On demand (or first mount if empty): rebuild from tarkov.dev.
 * Exposes { index, status: 'idle'|'loading'|'building'|'ready'|'error', progress, rebuild }.
 */
export function useIconIndex({ autoBuild = true } = {}) {
  const [index, setIndex] = useState(null);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const buildingRef = useRef(false);

  const rebuild = async () => {
    if (buildingRef.current) return;
    buildingRef.current = true;
    try {
      setStatus("loading");
      const items = await fetchItemList();
      setStatus("building");
      setProgress({ done: 0, total: items.length });
      const built = await buildIconIndex(items, {
        concurrency: 8,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setIndex(built);
      setStatus("ready");
      try { saveIndex(built); } catch (e) { console.warn("[iconIndex] save failed:", e); }
    } catch (e) {
      console.error("[iconIndex] build failed:", e);
      setStatus("error");
    } finally {
      buildingRef.current = false;
    }
  };

  useEffect(() => {
    const cached = loadIndex();
    if (cached?.length) {
      setIndex(cached);
      setStatus("ready");
      return;
    }
    if (autoBuild) rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBuild]);

  return { index, status, progress, rebuild };
}
