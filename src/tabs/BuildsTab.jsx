import { useState, useEffect } from "react";
import { T } from '../theme.js';
import { SL, Badge, Btn, Tip } from '../components/ui/index.js';
import { fetchAPI, WEAPONS_LIST_Q, weaponDetailQ } from '../api.js';
import { encodeBuild, decodeBuild } from '../lib/shareCodes.js';
import { optimizeBuild } from '../lib/buildOptimizer.js';

// Compact per-mod stat badges — green for helpful, red for costly, cyan/orange
// for neutral stats like capacity / malfunction / zoom. Shared by the mod picker
// overlay and the tree view so each slot shows what its installed mod actually
// contributes to the build.
function ModStats({ mod }) {
  if (!mod) return null;
  const mp = mod.properties;
  const ergo = mp?.ergonomics || 0;
  const recoil = mp?.recoilModifier || 0;
  const acc = mp?.accuracyModifier || 0;
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
      {ergo !== 0 && <span style={{ fontSize: T.fs1, color: ergo > 0 ? T.success : T.error }}>{ergo > 0 ? "+" : ""}{ergo} ergo</span>}
      {recoil !== 0 && <span style={{ fontSize: T.fs1, color: recoil < 0 ? T.success : T.error }}>{recoil > 0 ? "+" : ""}{Math.round(recoil * 100)}% recoil</span>}
      {acc !== 0 && <span style={{ fontSize: T.fs1, color: acc < 0 ? T.success : T.error }}>{acc > 0 ? "+" : ""}{Math.round(acc * 100)}% acc</span>}
      {mp?.capacity && <span style={{ fontSize: T.fs1, color: T.cyan }}>{mp.capacity} rnd</span>}
      {mp?.malfunctionChance != null && mp.malfunctionChance > 0 && <span style={{ fontSize: T.fs1, color: T.orange }}>{Math.round(mp.malfunctionChance * 100)}% malf</span>}
      {mp?.loadModifier != null && mp.loadModifier !== 0 && <span style={{ fontSize: T.fs1, color: mp.loadModifier < 0 ? T.success : T.error }}>{mp.loadModifier > 0 ? "+" : ""}{Math.round(mp.loadModifier * 100)}% load</span>}
      {mod.loudness != null && mod.loudness !== 0 && <span style={{ fontSize: T.fs1, color: mod.loudness < 0 ? T.success : T.error }}>{mod.loudness > 0 ? "+" : ""}{mod.loudness} loud</span>}
      {mod.velocity != null && mod.velocity !== 0 && <span style={{ fontSize: T.fs1, color: mod.velocity > 0 ? T.success : T.error }}>{mod.velocity > 0 ? "+" : ""}{Math.round(mod.velocity)} vel</span>}
      {mp?.zoomLevels?.length > 0 && <span style={{ fontSize: T.fs1, color: T.cyan }}>{mp.zoomLevels.join("/")}x</span>}
      {mp?.sightingRange > 0 && <span style={{ fontSize: T.fs1, color: T.cyan }}>{mp.sightingRange}m</span>}
      {mp?.deviationMax > 0 && <span style={{ fontSize: T.fs1, color: T.orange }}>{mp.deviationMax} dev</span>}
    </div>
  );
}

export default function BuildsTab({ savedBuilds, saveSavedBuilds }) {
  const [weapons, setWeapons] = useState(null);
  const [weaponsLoading, setWeaponsLoading] = useState(false);
  const [screen, setScreen] = useState("list"); // "list" | "pick" | "edit"
  const [selectedWeapon, setSelectedWeapon] = useState(null); // full weapon detail data
  const [weaponLoading, setWeaponLoading] = useState(false);
  const [mods, setMods] = useState({}); // { slotPath: modItemId }
  const [editingBuild, setEditingBuild] = useState(null); // build being edited
  const [pickerSlot, setPickerSlot] = useState(null); // slot currently picking for
  const [weaponSearch, setWeaponSearch] = useState("");
  const [weaponCategory, setWeaponCategory] = useState("all");
  const [buildName, setBuildName] = useState("");
  const [importCode, setImportCode] = useState("");
  const [importError, setImportError] = useState("");
  const [copied, setCopied] = useState(null); // build id that was just copied
  const [gameMode, setGameMode] = useState("pve"); // "pve" | "regular"
  const [modSort, setModSort] = useState("name"); // "name" | "price" | "ergo" | "recoil"

  // Lazy load weapon list on first mount
  useEffect(() => {
    if (weapons || weaponsLoading) return;
    setWeaponsLoading(true);
    fetchAPI(WEAPONS_LIST_Q)
      .then(d => { if (d?.items) setWeapons(d.items.filter(i => i.properties?.caliber)); })
      .finally(() => setWeaponsLoading(false));
  }, []);

  // Re-fetch weapon detail when game mode changes (prices differ between PvE/PvP)
  useEffect(() => {
    if (!selectedWeapon) return;
    (async () => {
      try {
        const d = await fetchAPI(weaponDetailQ(selectedWeapon.id, gameMode));
        if (d?.item) setSelectedWeapon(d.item);
      } catch(e) {}
    })();
  }, [gameMode]);

  // Load full weapon detail when picking a weapon
  const selectWeapon = async (weaponId) => {
    setWeaponLoading(true);
    try {
      const d = await fetchAPI(weaponDetailQ(weaponId, gameMode));
      if (d?.item) { setSelectedWeapon(d.item); setMods({}); setBuildName(""); setScreen("edit"); }
    } catch(e) {}
    setWeaponLoading(false);
  };

  // Load a saved build into the editor
  const loadBuild = async (build) => {
    setWeaponLoading(true);
    setEditingBuild(build);
    try {
      const d = await fetchAPI(weaponDetailQ(build.weaponId, gameMode));
      if (d?.item) { setSelectedWeapon(d.item); setMods(build.mods || {}); setBuildName(build.name || ""); setScreen("edit"); }
    } catch(e) {}
    setWeaponLoading(false);
  };

  // Helper: get cheapest price for a mod
  const getCheapestPrice = (item) => {
    if (!item?.buyFor?.length) return null;
    const sorted = [...item.buyFor].sort((a, b) => (a.priceRUB || Infinity) - (b.priceRUB || Infinity));
    return sorted[0];
  };

  // Helper: format ruble price
  const fmtPrice = (rub) => {
    if (!rub) return "—";
    return rub >= 1000 ? Math.round(rub / 1000) + "k ₽" : rub + " ₽";
  };

  // Calculate stats from base weapon + selected mods
  const calcStats = () => {
    const empty = { ergo: 0, recoilV: 0, recoilH: 0, weight: 0, accMod: 0, magCapacity: 0, fireRate: 0, fireModes: [], sightingRange: 0, zoomLevels: [], deviationMax: 0, centerOfImpact: 0, loudness: 0, velocity: 0, loadMod: 0, checkMod: 0, malfChance: 0, totalCost: 0, modCount: 0, effectiveDist: 0, convergence: 0 };
    if (!selectedWeapon) return empty;
    const wp = selectedWeapon.properties;
    let ergo = wp.ergonomics || 0;
    let recoilMod = 0;
    let accMod = 0;
    let weight = selectedWeapon.weight || 0;
    let magCapacity = 0;
    let sightingRange = wp.sightingRange || 0;
    let zoomLevels = [];
    let deviationMax = 0;
    let centerOfImpact = wp.centerOfImpact || 0;
    let loudness = 0;
    let velocity = 0;
    let loadMod = 0;
    let checkMod = 0;
    let malfChance = 0;
    let totalCost = 0;
    let modCount = 0;

    // Add weapon base price
    const wpPrice = getCheapestPrice(selectedWeapon);
    if (wpPrice) totalCost += wpPrice.priceRUB || 0;

    const walkSlots = (slots, pathPrefix) => {
      if (!slots) return;
      slots.forEach(slot => {
        const path = pathPrefix ? `${pathPrefix}.${slot.nameId}` : slot.nameId;
        const modId = mods[path];
        if (!modId) return;
        const mod = slot.filters?.allowedItems?.find(i => i.id === modId);
        if (!mod) return;
        const mp = mod.properties;
        modCount++;
        if (mp?.ergonomics) ergo += mp.ergonomics;
        if (mp?.recoilModifier) recoilMod += mp.recoilModifier;
        if (mp?.accuracyModifier) accMod += mp.accuracyModifier;
        if (mod.weight) weight += mod.weight;
        if (mod.velocity) velocity += mod.velocity;
        if (mod.loudness) loudness += mod.loudness;
        // Magazine-specific
        if (mp?.capacity) magCapacity = mp.capacity;
        if (mp?.loadModifier) loadMod = mp.loadModifier;
        if (mp?.ammoCheckModifier) checkMod = mp.ammoCheckModifier;
        if (mp?.malfunctionChance) malfChance = mp.malfunctionChance;
        // Optic-specific
        if (mp?.sightingRange && mp.sightingRange > sightingRange) sightingRange = mp.sightingRange;
        if (mp?.zoomLevels?.length) zoomLevels = mp.zoomLevels;
        // Barrel-specific
        if (mp?.deviationMax) deviationMax = mp.deviationMax;
        if (mp?.centerOfImpact) centerOfImpact = mp.centerOfImpact;
        // Price
        const modPrice = getCheapestPrice(mod);
        if (modPrice) totalCost += modPrice.priceRUB || 0;
        if (mp?.slots) walkSlots(mp.slots, path);
      });
    };
    walkSlots(wp.slots, "");

    return {
      ergo: Math.round(ergo),
      recoilV: Math.round((wp.recoilVertical || 0) * (1 + recoilMod)),
      recoilH: Math.round((wp.recoilHorizontal || 0) * (1 + recoilMod)),
      weight: Math.round(weight * 100) / 100,
      accMod: Math.round(accMod * 100),
      magCapacity,
      fireRate: wp.fireRate || 0,
      fireModes: wp.fireModes || [],
      sightingRange,
      zoomLevels,
      deviationMax,
      centerOfImpact: Math.round(centerOfImpact * 100) / 100,
      loudness,
      velocity: Math.round(velocity),
      loadMod: Math.round(loadMod * 100),
      checkMod: Math.round(checkMod * 100),
      malfChance: Math.round(malfChance * 100),
      totalCost,
      modCount,
      effectiveDist: wp.effectiveDistance || 0,
      convergence: wp.convergence || 0,
    };
  };

  // Save current build
  const saveBuild = () => {
    const build = {
      id: editingBuild?.id || "bld_" + Date.now(),
      name: buildName || selectedWeapon?.shortName + " Build",
      weaponId: selectedWeapon.id,
      mods: { ...mods },
      createdAt: editingBuild?.createdAt || Date.now(),
    };
    const existing = savedBuilds.findIndex(b => b.id === build.id);
    if (existing >= 0) {
      const updated = [...savedBuilds];
      updated[existing] = build;
      saveSavedBuilds(updated);
    } else {
      saveSavedBuilds([build, ...savedBuilds]);
    }
    setEditingBuild(null);
    setScreen("list");
  };

  const deleteBuild = (id) => {
    if (window.confirm("Delete this build?")) saveSavedBuilds(savedBuilds.filter(b => b.id !== id));
  };

  const copyBuildCode = (build) => {
    const code = encodeBuild(build);
    if (!code) return;
    try { navigator.clipboard.writeText(code).then(() => { setCopied(build.id); setTimeout(() => setCopied(null), 2500); }); } catch(e) {}
  };

  const importBuild = () => {
    setImportError("");
    const build = decodeBuild(importCode.trim());
    if (!build) { setImportError("Invalid build code."); return; }
    saveSavedBuilds([build, ...savedBuilds]);
    setImportCode("");
  };

  // Weapon categories from caliber
  const getCategory = (caliber) => {
    if (!caliber) return "other";
    const c = caliber.toLowerCase();
    if (c.includes("12g") || c.includes("20g") || c.includes("23x75")) return "shotgun";
    if (c.includes("9x18") || c.includes("9x19") || c.includes("9x21") || c.includes("7.62x25") || c.includes("46x30") || c.includes("57x28")) return "smg";
    if (c.includes("338") || c.includes("408") || c.includes("762x54") || c.includes("86x70")) return "sniper";
    if (c.includes("9x33") || c.includes("1143x23") || c.includes("357")) return "pistol";
    return "assault";
  };

  const categories = ["all", "assault", "smg", "sniper", "shotgun", "pistol"];

  // ─── RENDER: MOD PICKER OVERLAY ───
  if (pickerSlot) {
    const { slot, path } = pickerSlot;
    const items = slot.filters?.allowedItems || [];
    const currentModId = mods[path];
    const sortedItems = [...items].sort((a, b) => {
      if (modSort === "price") {
        const pa = getCheapestPrice(a)?.priceRUB || Infinity;
        const pb = getCheapestPrice(b)?.priceRUB || Infinity;
        return pa - pb;
      }
      if (modSort === "ergo") return (b.properties?.ergonomics || 0) - (a.properties?.ergonomics || 0);
      if (modSort === "recoil") return (a.properties?.recoilModifier || 0) - (b.properties?.recoilModifier || 0);
      return a.name.localeCompare(b.name);
    });
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button onClick={() => setPickerSlot(null)} style={{ background: "transparent", border: "none", color: T.textDim, fontSize: T.fs3, cursor: "pointer", fontFamily: T.sans, padding: 0 }}>← BACK</button>
            <div style={{ fontSize: T.fs2, color: T.textDim }}>{items.length} options</div>
          </div>
          <div style={{ fontSize: T.fs4, color: T.gold, fontWeight: "bold", letterSpacing: 1, marginBottom: 8 }}>{slot.name.toUpperCase()}</div>
          <div style={{ display: "flex", gap: 4 }}>
            {["name", "price", "ergo", "recoil"].map(s => (
              <button key={s} onClick={() => setModSort(s)} style={{ flex: 1, background: modSort === s ? T.gold + "22" : "transparent", border: `1px solid ${modSort === s ? T.gold : T.border}`, color: modSort === s ? T.gold : T.textDim, padding: "4px 0", fontSize: T.fs1, cursor: "pointer", fontFamily: T.sans, letterSpacing: 0.5, textTransform: "uppercase" }}>{s}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {!slot.required && (
            <button onClick={() => { const next = { ...mods }; delete next[path]; setMods(next); setPickerSlot(null); }} style={{ width: "100%", background: T.errorBg, border: `1px solid ${T.errorBorder}`, color: T.error, padding: "10px 0", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1, marginBottom: 10 }}>✕ CLEAR SLOT</button>
          )}
          {sortedItems.map(item => {
            const isSelected = currentModId === item.id;
            const cheapest = getCheapestPrice(item);
            return (
              <button key={item.id} onClick={() => { setMods({ ...mods, [path]: item.id }); setPickerSlot(null); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: isSelected ? T.gold + "22" : T.surface, border: `1px solid ${isSelected ? T.gold : T.border}`, borderLeft: `2px solid ${isSelected ? T.gold : "transparent"}`, padding: 10, marginBottom: 4, cursor: "pointer", textAlign: "left" }}>
                {item.gridImageLink && <img src={item.gridImageLink} alt="" style={{ width: 48, height: 48, objectFit: "contain", background: T.inputBg, border: `1px solid ${T.border}`, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: isSelected ? T.gold : T.textBright, fontSize: T.fs2, fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.shortName || item.name}</span>
                    {cheapest && <span style={{ fontSize: T.fs1, color: T.gold, whiteSpace: "nowrap", flexShrink: 0 }}>{fmtPrice(cheapest.priceRUB)}</span>}
                  </div>
                  {cheapest?.vendor && <div style={{ fontSize: T.fs1, color: T.textDim, marginTop: 1 }}>{cheapest.vendor.name}{cheapest.vendor.minTraderLevel ? " LL" + cheapest.vendor.minTraderLevel : ""}</div>}
                  <ModStats mod={item} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── RENDER: WEAPON PICKER ───
  if (screen === "pick") {
    const filtered = (weapons || []).filter(w => {
      if (weaponCategory !== "all" && getCategory(w.properties?.caliber) !== weaponCategory) return false;
      if (weaponSearch && !w.name.toLowerCase().includes(weaponSearch.toLowerCase()) && !w.shortName?.toLowerCase().includes(weaponSearch.toLowerCase())) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button onClick={() => setScreen("list")} style={{ background: "transparent", border: "none", color: T.textDim, fontSize: T.fs3, cursor: "pointer", fontFamily: T.sans, padding: 0 }}>← BACK</button>
            <div style={{ fontSize: T.fs2, color: T.textDim }}>{filtered.length} weapons</div>
          </div>
          <input value={weaponSearch} onChange={e => setWeaponSearch(e.target.value)} placeholder="Search weapons..." style={{ width: "100%", background: T.inputBg, border: `1px solid ${T.borderBright}`, color: T.textBright, padding: "7px 10px", fontSize: T.fs2, fontFamily: T.sans, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {categories.map(c => <Btn key={c} ch={c} compact active={weaponCategory === c} onClick={() => setWeaponCategory(c)} />)}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {weaponsLoading && <div style={{ color: T.textDim, fontSize: T.fs3, textAlign: "center", padding: 20 }}>Loading weapons from tarkov.dev...</div>}
          {weaponLoading && <div style={{ color: T.gold, fontSize: T.fs3, textAlign: "center", padding: 20 }}>Loading weapon details...</div>}
          {!weaponsLoading && !weaponLoading && filtered.map(w => {
            const wp = w.properties;
            return (
              <button key={w.id} onClick={() => selectWeapon(w.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderLeft: `2px solid ${T.gold}33`, padding: 10, marginBottom: 6, cursor: "pointer", textAlign: "left" }}>
                {w.gridImageLink && <img src={w.gridImageLink} alt="" style={{ width: 64, height: 32, objectFit: "contain", background: T.inputBg, border: `1px solid ${T.border}`, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: T.textBright, fontSize: T.fs2, fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.shortName || w.name}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                    <span style={{ fontSize: T.fs1, color: T.textDim }}>{wp?.caliber?.replace("Caliber","").replace(/([a-z])([A-Z])/g,"$1 $2") || "?"}</span>
                    <span style={{ fontSize: T.fs1, color: T.cyan }}>E{wp?.ergonomics || 0}</span>
                    <span style={{ fontSize: T.fs1, color: T.orange }}>R{wp?.recoilVertical || 0}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── RENDER: BUILD EDITOR ───
  if (screen === "edit" && selectedWeapon) {
    const wp = selectedWeapon.properties;
    const stats = calcStats();
    const baseErgo = wp.ergonomics || 0;
    const baseRecoilV = wp.recoilVertical || 0;
    const baseRecoilH = wp.recoilHorizontal || 0;

    // Stat cell helper
    const StatCell = ({ label, value, color, sub }) => (
      <div style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.border}`, padding: "5px 6px", textAlign: "center", minWidth: 0 }}>
        <div style={{ fontSize: T.fs1, color: T.textDim, letterSpacing: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ fontSize: T.fs3, fontWeight: "bold", color: color || T.textBright, whiteSpace: "nowrap" }}>{value}</div>
        {sub && <div style={{ fontSize: T.fs1, color: T.textDim, marginTop: 1 }}>{sub}</div>}
      </div>
    );

    // Slot category grouping
    const slotCategory = (nameId) => {
      if (/barrel|muzzle|gas_block/i.test(nameId)) return "BARREL & MUZZLE";
      if (/reciever|receiver|handguard|charge|launcher/i.test(nameId)) return "BODY & INTERNALS";
      if (/stock|pistol/i.test(nameId)) return "STOCK & GRIP";
      if (/scope|sight|mount/i.test(nameId)) return "OPTICS & SIGHTS";
      if (/tactical|flashlight/i.test(nameId)) return "TACTICAL";
      if (/magazine/i.test(nameId)) return "MAGAZINE";
      return "OTHER";
    };
    const categoryOrder = ["BARREL & MUZZLE", "BODY & INTERNALS", "STOCK & GRIP", "OPTICS & SIGHTS", "TACTICAL", "MAGAZINE", "OTHER"];
    const grouped = {};
    (wp.slots || []).forEach(slot => {
      const cat = slotCategory(slot.nameId);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(slot);
    });

    // Recursive slot renderer — visual assembly cards
    const renderSlot = (slot, pathPrefix, depth = 0) => {
      const path = pathPrefix ? `${pathPrefix}.${slot.nameId}` : slot.nameId;
      const modId = mods[path];
      const mod = modId ? slot.filters?.allowedItems?.find(i => i.id === modId) : null;
      const hasOptions = (slot.filters?.allowedItems?.length || 0) > 0;
      const modPrice = mod ? getCheapestPrice(mod) : null;
      const isSubSlot = depth > 0;

      return (
        <div key={path} style={{ marginLeft: isSubSlot ? 20 : 0, position: "relative" }}>
          {isSubSlot && <div style={{ position: "absolute", left: -12, top: 0, bottom: 0, width: 1, background: T.border }} />}
          {isSubSlot && <div style={{ position: "absolute", left: -12, top: 24, width: 12, height: 1, background: T.border }} />}
          <button onClick={() => hasOptions && setPickerSlot({ slot, path })}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: mod ? T.surface : "transparent", border: `1px solid ${mod ? T.border : slot.required ? T.gold + "55" : T.border + "88"}`, borderLeft: `3px solid ${mod ? T.success : slot.required ? T.gold : T.border}`, padding: mod ? "8px 10px" : "10px", marginBottom: 5, cursor: hasOptions ? "pointer" : "default", textAlign: "left", opacity: hasOptions ? 1 : 0.4 }}>
            {mod?.gridImageLink ? (
              <img src={mod.gridImageLink} alt="" style={{ width: 56, height: 42, objectFit: "contain", background: T.inputBg, border: `1px solid ${T.border}`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 56, height: 42, border: `2px dashed ${slot.required ? T.gold + "55" : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 16, color: slot.required ? T.gold + "66" : T.textDim + "44" }}>+</span>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: T.fs1, color: mod ? T.textDim : (slot.required ? T.gold : T.textDim), letterSpacing: 0.8, marginBottom: 2 }}>{slot.name.toUpperCase()}{slot.required ? " *" : ""}</div>
              {mod ? (
                <>
                  <div style={{ fontSize: T.fs2, color: T.textBright, fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mod.shortName || mod.name}</div>
                  <ModStats mod={mod} />
                </>
              ) : (
                <div style={{ fontSize: T.fs2, color: T.textDim, fontStyle: "italic" }}>{hasOptions ? "Tap to add" : "No options"}</div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, gap: 2 }}>
              {modPrice && <span style={{ fontSize: T.fs1, color: T.gold }}>{fmtPrice(modPrice.priceRUB)}</span>}
              {modPrice?.vendor && <span style={{ fontSize: T.fs1, color: T.textDim }}>{modPrice.vendor.name === "Flea Market" ? "Flea" : modPrice.vendor.name}{modPrice.vendor.minTraderLevel ? " LL" + modPrice.vendor.minTraderLevel : ""}</span>}
              {!mod && hasOptions && <span style={{ color: T.textDim, fontSize: T.fs3 }}>▶</span>}
            </div>
          </button>
          {mod?.properties?.slots && mod.properties.slots.map(subSlot => renderSlot(subSlot, path, depth + 1))}
        </div>
      );
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Thin header bar */}
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
          <button onClick={() => { setScreen("list"); setSelectedWeapon(null); setEditingBuild(null); }} style={{ background: "transparent", border: "none", color: T.textDim, fontSize: T.fs3, cursor: "pointer", fontFamily: T.sans, padding: 0, flexShrink: 0 }}>← BACK</button>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Tip text="Auto-fill options — overwrites current mod selections except scopes, sights, and magazines (those are left alone so your personal picks survive). OPT ERGO: maximize ergonomics. OPT RECOIL: minimize recoil at any cost. OPT BAL: heavy recoil focus but a mod's recoil gain must outweigh its ergo and accuracy penalties. All three respect conflicting-items restrictions." />
            <button onClick={() => setMods(optimizeBuild(selectedWeapon, "ergo", { currentMods: mods }))} style={{ background: T.cyan + "22", border: `1px solid ${T.cyan}66`, color: T.cyan, padding: "4px 8px", fontSize: T.fs1, cursor: "pointer", fontFamily: T.sans, letterSpacing: 0.5 }}>OPT ERGO</button>
            <button onClick={() => setMods(optimizeBuild(selectedWeapon, "recoil", { currentMods: mods }))} style={{ background: T.orange + "22", border: `1px solid ${T.orange}66`, color: T.orange, padding: "4px 8px", fontSize: T.fs1, cursor: "pointer", fontFamily: T.sans, letterSpacing: 0.5 }}>OPT RECOIL</button>
            <button onClick={() => setMods(optimizeBuild(selectedWeapon, "recoil-balanced", { currentMods: mods }))} style={{ background: T.gold + "22", border: `1px solid ${T.gold}66`, color: T.gold, padding: "4px 8px", fontSize: T.fs1, cursor: "pointer", fontFamily: T.sans, letterSpacing: 0.5 }}>OPT BAL</button>
            <button onClick={() => { const next = gameMode === "pve" ? "regular" : "pve"; setGameMode(next); }} style={{ background: gameMode === "pve" ? T.cyan + "22" : T.orange + "22", border: `1px solid ${gameMode === "pve" ? T.cyan + "44" : T.orange + "44"}`, color: gameMode === "pve" ? T.cyan : T.orange, padding: "4px 8px", fontSize: T.fs1, cursor: "pointer", fontFamily: T.sans, letterSpacing: 0.5 }}>{gameMode === "pve" ? "PVE" : "PVP"}</button>
            <button onClick={saveBuild} style={{ background: T.successBg, border: `1px solid ${T.successBorder}`, color: T.success, padding: "6px 12px", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1 }}>SAVE</button>
          </div>
        </div>
        {/* Scrollable content — everything flows together */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* Weapon Hero Image */}
          <div style={{ position: "relative" }}>
            <div style={{ background: `radial-gradient(ellipse at center, ${T.surface} 0%, ${T.bg} 100%)`, borderBottom: `1px solid ${T.border}`, padding: "20px 14px 12px", textAlign: "center" }}>
              {selectedWeapon.image512pxLink && <img src={selectedWeapon.image512pxLink} alt="" style={{ width: "100%", maxWidth: 460, height: "auto", objectFit: "contain", filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.5))" }} />}
            </div>
            <div style={{ textAlign: "center", padding: "8px 14px 0" }}>
              <div style={{ fontSize: T.fs5, color: T.gold, fontWeight: "bold", letterSpacing: 1 }}>{selectedWeapon.shortName || selectedWeapon.name}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 4 }}>
                <span style={{ fontSize: T.fs2, color: T.textDim }}>{wp?.caliber?.replace("Caliber","").replace(/([a-z])([A-Z])/g,"$1 $2")}</span>
                <span style={{ fontSize: T.fs2, color: T.gold }}>{stats.fireModes.map(m => m.replace("SingleFire","SEMI").replace("FullAuto","AUTO").replace("Burst","BURST")).join(" / ")}</span>
              </div>
            </div>
            {/* Total cost badge */}
            {stats.totalCost > 0 && <div style={{ position: "absolute", top: 10, right: 14, background: T.gold + "22", border: `1px solid ${T.gold}44`, padding: "4px 10px", textAlign: "right" }}>
              <div style={{ fontSize: T.fs3, fontWeight: "bold", color: T.gold }}>{fmtPrice(stats.totalCost)}</div>
              <div style={{ fontSize: T.fs1, color: T.textDim }}>{stats.modCount} mods</div>
            </div>}
          </div>
          {/* Build name */}
          <div style={{ padding: "10px 14px 0" }}>
            <input value={buildName} onChange={e => setBuildName(e.target.value)} placeholder="Build name..." style={{ width: "100%", background: T.inputBg, border: `1px solid ${T.borderBright}`, color: T.textBright, padding: "8px 10px", fontSize: T.fs2, fontFamily: T.sans, outline: "none", boxSizing: "border-box" }} />
          </div>
          {/* Stats panels */}
          <div style={{ padding: "10px 14px" }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              <StatCell label="ERGO" value={stats.ergo} color={stats.ergo > baseErgo ? T.success : stats.ergo < baseErgo ? T.error : T.textBright} />
              <StatCell label="REC ↕" value={stats.recoilV} color={stats.recoilV < baseRecoilV ? T.success : stats.recoilV > baseRecoilV ? T.error : T.textBright} />
              <StatCell label="REC ↔" value={stats.recoilH} color={stats.recoilH < baseRecoilH ? T.success : stats.recoilH > baseRecoilH ? T.error : T.textBright} />
              <StatCell label="ACC" value={stats.accMod === 0 ? "—" : (stats.accMod > 0 ? "+" : "") + stats.accMod + "%"} color={stats.accMod < 0 ? T.success : stats.accMod > 0 ? T.error : T.textDim} />
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              <StatCell label="RPM" value={stats.fireRate || "—"} />
              <StatCell label="MAG" value={stats.magCapacity ? stats.magCapacity + "rnd" : "—"} color={stats.magCapacity ? T.cyan : T.textDim} />
              <StatCell label="WEIGHT" value={stats.weight + "kg"} />
              <StatCell label="EFF RNG" value={stats.effectiveDist ? stats.effectiveDist + "m" : "—"} color={stats.effectiveDist ? T.cyan : T.textDim} />
            </div>
            {(stats.loudness !== 0 || stats.velocity !== 0 || stats.malfChance > 0 || stats.loadMod !== 0 || stats.zoomLevels.length > 0) && (
              <div style={{ display: "flex", gap: 4 }}>
                {stats.loudness !== 0 && <StatCell label="LOUD" value={(stats.loudness > 0 ? "+" : "") + stats.loudness} color={stats.loudness < 0 ? T.success : T.error} />}
                {stats.velocity !== 0 && <StatCell label="VELOCITY" value={(stats.velocity > 0 ? "+" : "") + stats.velocity} color={stats.velocity > 0 ? T.success : T.error} />}
                {stats.malfChance > 0 && <StatCell label="MALF" value={stats.malfChance + "%"} color={T.orange} />}
                {stats.loadMod !== 0 && <StatCell label="LOAD SPD" value={(stats.loadMod > 0 ? "+" : "") + stats.loadMod + "%"} color={stats.loadMod < 0 ? T.success : T.error} />}
                {stats.zoomLevels.length > 0 && <StatCell label="OPTIC" value={stats.zoomLevels.join("/") + "x"} color={T.cyan} sub={stats.sightingRange ? stats.sightingRange + "m" : null} />}
              </div>
            )}
          </div>
          {/* Assembly — split into REQUIRED and OPTIONAL */}
          {(() => {
            // Collect all top-level slots with their fill status
            const allSlots = wp.slots || [];
            const requiredSlots = allSlots.filter(s => s.required);
            const optionalSlots = allSlots.filter(s => !s.required);
            const requiredFilled = requiredSlots.filter(s => mods[s.nameId]);
            const optionalFilled = optionalSlots.filter(s => mods[s.nameId]);
            const allRequiredDone = requiredFilled.length === requiredSlots.length;

            return (
              <div style={{ padding: "0 14px 20px" }}>
                {/* Build readiness banner */}
                <div style={{ background: allRequiredDone ? T.successBg : T.gold + "11", border: `1px solid ${allRequiredDone ? T.successBorder : T.gold + "44"}`, padding: "8px 12px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{allRequiredDone ? "✓" : "⚠"}</div>
                  <div>
                    <div style={{ fontSize: T.fs2, color: allRequiredDone ? T.success : T.gold, fontWeight: "bold" }}>
                      {allRequiredDone ? "BUILD FUNCTIONAL" : `${requiredFilled.length}/${requiredSlots.length} REQUIRED PARTS`}
                    </div>
                    <div style={{ fontSize: T.fs1, color: T.textDim }}>
                      {allRequiredDone
                        ? `All required parts installed${optionalSlots.length ? ` — ${optionalFilled.length}/${optionalSlots.length} optional upgrades` : ""}`
                        : `${requiredSlots.length - requiredFilled.length} part${requiredSlots.length - requiredFilled.length > 1 ? "s" : ""} still needed to function in raid`}
                    </div>
                  </div>
                </div>

                {/* REQUIRED section */}
                {requiredSlots.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: T.fs2, color: T.gold, letterSpacing: 1.5, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${T.gold}44`, fontFamily: T.sans, display: "flex", alignItems: "center", gap: 8 }}>
                      REQUIRED
                      <span style={{ fontSize: T.fs1, color: allRequiredDone ? T.success : T.textDim, fontWeight: "normal", letterSpacing: 0 }}>{requiredFilled.length}/{requiredSlots.length}</span>
                    </div>
                    {requiredSlots.map(slot => renderSlot(slot, "", 0))}
                  </div>
                )}

                {/* OPTIONAL section */}
                {optionalSlots.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: T.fs2, color: T.textDim, letterSpacing: 1.5, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${T.border}`, fontFamily: T.sans, display: "flex", alignItems: "center", gap: 8 }}>
                      OPTIONAL UPGRADES
                      {optionalFilled.length > 0 && <span style={{ fontSize: T.fs1, color: T.cyan, fontWeight: "normal", letterSpacing: 0 }}>{optionalFilled.length}/{optionalSlots.length}</span>}
                    </div>
                    {optionalSlots.map(slot => renderSlot(slot, "", 0))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ─── RENDER: MY BUILDS LIST (default) ───
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "10px 14px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setScreen("pick")} style={{ flex: 1, background: T.gold + "22", border: `2px solid ${T.gold}`, color: T.gold, padding: "10px 0", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1, fontWeight: "bold" }}>+ NEW BUILD</button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        <SL c={<>MY BUILDS ({savedBuilds.length})<Tip text="Your saved weapon builds. Tap Edit to modify, or Copy Code to share with squadmates." /></>} />
        {savedBuilds.length === 0 && (
          <div style={{ background: T.gold + "11", border: `2px solid ${T.gold}44`, padding: T.sp4, marginBottom: T.sp4, textAlign: "center" }}>
            <div style={{ fontSize: T.fs3, color: T.text, marginBottom: 8 }}>No builds yet</div>
            <div style={{ fontSize: T.fs2, color: T.textDim }}>Tap + NEW BUILD to create your first weapon build, or import one from a share code below.</div>
          </div>
        )}
        {savedBuilds.map(build => (
          <div key={build.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `2px solid ${T.gold}`, padding: 12, marginBottom: 8 }}>
            <div style={{ fontSize: T.fs3, color: T.gold, fontWeight: "bold", marginBottom: 4 }}>{build.name}</div>
            <div style={{ fontSize: T.fs2, color: T.textDim, marginBottom: 8 }}>{Object.keys(build.mods || {}).length} mods attached</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => loadBuild(build)} style={{ flex: 1, background: T.blueBg, border: `1px solid ${T.blueBorder}`, color: T.blue, padding: "8px 0", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1 }}>EDIT</button>
              <button onClick={() => copyBuildCode(build)} style={{ flex: 1, background: copied === build.id ? T.successBg : "transparent", border: `1px solid ${copied === build.id ? T.successBorder : T.border}`, color: copied === build.id ? T.success : T.textDim, padding: "8px 0", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans, letterSpacing: 1 }}>{copied === build.id ? "✓ COPIED" : "COPY CODE"}</button>
              <button onClick={() => deleteBuild(build.id)} style={{ background: T.errorBg, border: `1px solid ${T.errorBorder}`, color: T.error, padding: "8px 12px", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans }}>✕</button>
            </div>
          </div>
        ))}

        {/* Import section */}
        <SL c="IMPORT BUILD" s={{ marginTop: 20 }} />
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, padding: 12 }}>
          <div style={{ fontSize: T.fs2, color: T.textDim, lineHeight: 1.6, marginBottom: 8 }}>Paste a build code (TGB:...) to import a squadmate's weapon build.</div>
          <textarea value={importCode} onChange={e => setImportCode(e.target.value)} placeholder="Paste TGB:... code here"
            style={{ width: "100%", background: T.inputBg, border: `1px solid ${T.borderBright}`, color: T.textBright, padding: "8px 10px", fontSize: T.fs2, fontFamily: T.mono, outline: "none", boxSizing: "border-box", resize: "none", height: 52, lineHeight: 1.4, marginBottom: 6 }} />
          {importError && <div style={{ fontSize: T.fs2, color: T.error, marginBottom: 6 }}>{importError}</div>}
          <button onClick={importBuild} disabled={!importCode.trim()} style={{ width: "100%", background: importCode.trim() ? T.successBg : "transparent", border: `2px solid ${importCode.trim() ? T.successBorder : T.border}`, color: importCode.trim() ? T.success : T.textDim, padding: "10px 0", fontSize: T.fs2, cursor: importCode.trim() ? "pointer" : "default", fontFamily: T.sans, letterSpacing: 1 }}>IMPORT BUILD</button>
        </div>
      </div>
    </div>
  );
}
