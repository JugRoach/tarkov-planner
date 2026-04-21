import React from 'react'
import ReactDOM from 'react-dom/client'
import DesktopApp from './DesktopApp.jsx'
import ScannerPopout from './components/ScannerPopout.jsx'
import TaskMapPopout from './components/TaskMapPopout.jsx'
import { supabase } from './supabase.js'

// Service worker handling. In Tauri the .exe bundles all frontend assets and
// the built-in updater replaces the binary wholesale — a PWA service worker
// from a previous install would cache stale JS/CSS across updates and make
// the auto-update effectively invisible until the webview cache is cleared.
// So: unregister any SW + purge cache storage on Tauri launch, and only
// register the SW in actual web (PWA) contexts.
const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
if ('serviceWorker' in navigator) {
  if (IS_TAURI) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => { for (const reg of regs) reg.unregister() })
      .catch(() => {})
    if (typeof caches !== 'undefined') {
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {})
    }
  } else {
    import('virtual:pwa-register')
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch(() => {})
  }
}


// Generate or retrieve a stable device ID
function getDeviceId() {
  let id = localStorage.getItem('tg-device-id')
  if (!id) {
    id = 'dev_' + crypto.randomUUID()
    localStorage.setItem('tg-device-id', id)
  }
  return id
}

const deviceId = getDeviceId()

// Warn once per session if cross-device sync is silently failing — avoids
// false "my data is synced" belief while also keeping the console quiet.
let syncWarned = false
function warnSyncOnce(op, err) {
  if (syncWarned) return
  syncWarned = true
  console.warn(`[TG] Supabase ${op} failed — data saved locally only. Cross-device sync disabled for this session.`, err)
}

// Cloud-backed storage with localStorage as fast cache
// Falls back to pure localStorage if Supabase is unavailable
window.storage = {
  get: async (key) => {
    // Fast path: read from localStorage
    const local = localStorage.getItem(key)
    if (local !== null) return { key, value: local }

    // Fallback: check Supabase if localStorage is empty
    if (supabase) {
      try {
        const { data } = await supabase
          .from('user_storage')
          .select('value')
          .eq('user_id', deviceId)
          .eq('key', key)
          .single()
        if (data?.value != null) {
          localStorage.setItem(key, data.value)
          return { key, value: data.value }
        }
      } catch (_) {}
    }
    return null
  },

  set: async (key, value) => {
    // Write to localStorage immediately
    localStorage.setItem(key, value)

    // Write-through to Supabase
    if (supabase) {
      try {
        const { error } = await supabase
          .from('user_storage')
          .upsert(
            { user_id: deviceId, key, value, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,key' }
          )
        if (error) warnSyncOnce('write', error)
      } catch (e) {
        warnSyncOnce('write', e)
      }
    }
    return { key, value }
  },

  delete: async (key) => {
    localStorage.removeItem(key)
    if (supabase) {
      try {
        await supabase
          .from('user_storage')
          .delete()
          .eq('user_id', deviceId)
          .eq('key', key)
      } catch (_) {}
    }
    return { key, deleted: true }
  },

  list: async (prefix = '') => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix))
    return { keys }
  }
}

// Detect which webview we're running in. URL query is the most reliable
// signal (set by the Rust-side WebviewUrl), with Tauri internals and async
// API as fallbacks so older installed builds that don't pass the query
// param still light up correctly.
const POPOUT_LABELS = ['scanner-popout', 'task-map-popout'];
function detectPopoutLabel() {
  if (typeof window === 'undefined') return null;
  const search = window.location?.search || '';
  for (const label of POPOUT_LABELS) {
    if (search.includes(`window=${label}`)) return label;
  }
  const metaLabel = window.__TAURI_INTERNALS__?.metadata?.currentWebview?.label;
  if (POPOUT_LABELS.includes(metaLabel)) return metaLabel;
  return null;
}

function AppRoot() {
  const [popoutLabel, setPopoutLabel] = React.useState(detectPopoutLabel);

  React.useEffect(() => {
    if (popoutLabel) return;
    (async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const label = getCurrentWebviewWindow().label;
        if (POPOUT_LABELS.includes(label)) setPopoutLabel(label);
      } catch (_) {}
    })();
  }, []);

  if (popoutLabel === 'scanner-popout') return <ScannerPopout />;
  if (popoutLabel === 'task-map-popout') return <TaskMapPopout />;
  return <DesktopApp />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>
)
