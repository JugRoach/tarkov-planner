import { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { T } from '../theme.js';
import { SL, Badge } from './ui/index.js';
import { worldToPct } from '../lib/utils.js';
import { MAP_BOUNDS, MAP_SVG_NAMES, LAYER_DEFS } from '../lib/mapData.js';

export default function MapOverlay({ apiMap, emap, route, conflicts, onConflictResolve }) {
  const [layers, setLayers] = useState(() => {
    const d = {};
    LAYER_DEFS.forEach(l => { d[l.id] = l.default; });
    return d;
  });
  const toggleLayer = id => setLayers(prev => ({ ...prev, [id]: !prev[id] }));
  const mapContainerRef = useRef(null);
  const leafletMapRef = useRef(null);
  const layerGroupsRef = useRef({});
  const imageOverlayRef = useRef(null);
  const bounds = apiMap ? MAP_BOUNDS[apiMap.normalizedName] : null;
  const svgName = apiMap ? MAP_SVG_NAMES[apiMap.normalizedName] : null;
  const svgUrl = svgName ? `https://assets.tarkov.dev/maps/svg/${svgName}.svg` : null;
  const objWaypoints = useMemo(() => route.filter(w => w.pct && !w.isExtract), [route]);
  const extractWaypoints = useMemo(() => route.filter(w => w.pct && w.isExtract), [route]);

  // Map scale: use 1000x1000 coordinate space so Leaflet zoom levels work naturally
  const MAP_SCALE = 1000;
  // Convert pct {x,y} (0-1, y-down) to Leaflet LatLng (y-up, scaled)
  const toLL = (pct) => [(1 - pct.y) * MAP_SCALE, pct.x * MAP_SCALE];
  const mapBounds = [[0, 0], [MAP_SCALE, MAP_SCALE]];

  // Pre-compute layer data positions
  const bossMarkers = useMemo(() => (apiMap?.bosses || []).map(b => {
    return { name: b.boss?.name, chance: Math.round((b.spawnChance || 0) * 100), locations: (b.spawnLocations || []).map(l => ({ name: l.name, chance: Math.round((l.chance || 0) * 100) })), escorts: b.escorts || [], trigger: b.spawnTrigger };
  }).filter(b => b.chance > 0), [apiMap]);

  const hazardPolys = useMemo(() => (apiMap?.hazards || []).filter(h => h.outline?.length > 2).map(h => ({
    type: h.hazardType,
    points: h.outline.map(p => worldToPct(p, bounds)).filter(Boolean),
  })).filter(h => h.points.length > 2), [apiMap]);

  const stashMarkers = useMemo(() => (apiMap?.lootContainers || []).filter(c =>
    c.lootContainer?.name && (c.lootContainer.name.includes("Buried barrel") || c.lootContainer.name.includes("Ground cache")) && c.position
  ).map(c => ({ pct: worldToPct(c.position, bounds), name: c.lootContainer.name })).filter(c => c.pct), [apiMap]);

  const lockMarkers = useMemo(() => (apiMap?.locks || []).filter(l => l.position && l.key?.name).map(l => ({
    pct: worldToPct(l.position, bounds), key: l.key.name, needsPower: l.needsPower, type: l.lockType,
  })).filter(l => l.pct), [apiMap]);

  const btrMarkers = useMemo(() => (apiMap?.btrStops || []).map(s => ({
    pct: worldToPct({ x: s.x, y: 0, z: s.z }, bounds), name: s.name,
  })).filter(s => s.pct), [apiMap]);

  const hasLayerData = (id) => {
    if (id === "bosses") return bossMarkers.length > 0;
    if (id === "hazards") return hazardPolys.length > 0;
    if (id === "stashes") return stashMarkers.length > 0;
    if (id === "locks") return lockMarkers.length > 0;
    if (id === "btr") return btrMarkers.length > 0;
    return true;
  };

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || leafletMapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 4,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      attributionControl: false,
      zoomControl: false,
      maxBounds: [[-100, -100], [1100, 1100]],
      maxBoundsViscosity: 0.8,
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    map.fitBounds([[0, 0], [1000, 1000]]);
    leafletMapRef.current = map;
    // Create layer groups
    ["route", "hazards", "stashes", "locks", "btr"].forEach(id => {
      layerGroupsRef.current[id] = L.layerGroup().addTo(map);
    });
    // Fix initial sizing after container is visible
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); leafletMapRef.current = null; layerGroupsRef.current = {}; };
  }, []);

  // Update image overlay when map changes
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    if (imageOverlayRef.current) { map.removeLayer(imageOverlayRef.current); imageOverlayRef.current = null; }
    if (svgUrl) {
      const overlay = L.imageOverlay(svgUrl, [[0, 0], [1000, 1000]]).addTo(map);
      imageOverlayRef.current = overlay;
      map.fitBounds([[0, 0], [1000, 1000]]);
    }
  }, [svgUrl]);

  // Update all overlay layers when data changes
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    const groups = layerGroupsRef.current;
    Object.values(groups).forEach(g => g.clearLayers());
    const esc = (s) => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    const popupOpts = { className: "tg-popup", closeButton: false, autoPan: false, maxWidth: 220 };
    const mkIcon = (html, size) => L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

    // ── Route layer ──
    const routeGroup = groups.route;
    if (routeGroup) {
      // Route polyline
      if (objWaypoints.length > 1) {
        routeGroup.addLayer(L.polyline(objWaypoints.map(w => toLL(w.pct)), { color: T.gold, weight: 4, dashArray: "12,6", opacity: 0.85 }));
      }
      // Last objective to extract
      if (objWaypoints.length > 0 && extractWaypoints[0]) {
        routeGroup.addLayer(L.polyline([toLL(objWaypoints[objWaypoints.length - 1].pct), toLL(extractWaypoints[0].pct)], { color: T.success, weight: 4, dashArray: "12,6", opacity: 0.8 }));
      }
      // Objective waypoints
      objWaypoints.forEach((w, i) => {
        const col = w.players[0]?.color || T.gold;
        const playerDots = w.players.slice(1, 3).map((p, pi) => `<div style="position:absolute;top:-6px;right:${-10 - pi * 14}px;width:14px;height:14px;border-radius:50%;background:${p.color};border:2px solid ${T.bg}"></div>`).join("");
        const marker = L.marker(toLL(w.pct), {
          icon: mkIcon(`<div style="position:relative;width:32px;height:32px;border-radius:50%;background:${T.bg};border:3px solid ${col};display:flex;align-items:center;justify-content:center;color:${col};font:bold 14px ${T.mono}">${i + 1}${playerDots}</div>`, 32),
        });
        const popupContent = `<div style="font:12px ${T.mono};color:${T.textBright}">${esc(w.locationName || "Objective " + (i + 1))}</div>` +
          w.players.map(p => `<div style="font:11px ${T.sans};color:${p.color};margin-top:3px">${esc(p.name)}: ${esc(p.objective)}${p.total > 1 ? " (" + p.progress + "/" + p.total + ")" : ""}</div>`).join("");
        marker.bindPopup(popupContent, popupOpts);
        routeGroup.addLayer(marker);
      });
      // Extract waypoints
      extractWaypoints.forEach(w => {
        const marker = L.marker(toLL(w.pct), {
          icon: mkIcon(`<div style="width:34px;height:34px;border-radius:50%;background:${T.successBg};border:3px solid ${T.success};display:flex;align-items:center;justify-content:center;color:${T.success};font:bold 15px ${T.mono}">⬆</div>`, 34),
        });
        const popupContent = `<div style="font:bold 12px ${T.mono};color:${T.success}">EXTRACT — ${esc(w.extractName)}</div>` +
          w.players.map(p => `<div style="font:11px ${T.sans};color:${T.success};opacity:0.8;margin-top:2px">${esc(p.name)}${p.missingItems?.length ? ' <span style="color:' + T.error + '">⚠ missing ' + esc(p.missingItems.join(", ")) + '</span>' : ""}</div>`).join("");
        marker.bindPopup(popupContent, popupOpts);
        routeGroup.addLayer(marker);
      });
    }

    // ── Hazard zones ──
    const hazardGroup = groups.hazards;
    if (hazardGroup) {
      hazardPolys.forEach(h => {
        const color = h.type === "minefield" ? "#e05a5a" : h.type === "sniper" ? "#d4943a" : "#b45ae0";
        const fillColor = color;
        hazardGroup.addLayer(L.polygon(h.points.map(p => toLL(p)), {
          color, weight: 2, fillColor, fillOpacity: 0.15, opacity: 0.7,
          dashArray: h.type === "minefield" ? "6,3" : undefined,
        }));
      });
    }

    // ── Stash markers ──
    const stashGroup = groups.stashes;
    if (stashGroup) {
      stashMarkers.forEach(s => {
        const marker = L.circleMarker(toLL(s.pct), { radius: 6, color: T.success, fillColor: T.successBg, fillOpacity: 0.8, weight: 2 });
        marker.bindPopup(`<div style="font:12px ${T.mono};color:${T.success}">${s.name}</div>`, popupOpts);
        stashGroup.addLayer(marker);
      });
    }

    // ── Lock markers ──
    const lockGroup = groups.locks;
    if (lockGroup) {
      lockMarkers.forEach(l => {
        const col = l.needsPower ? T.orange : "#d4b84a";
        const marker = L.marker(toLL(l.pct), {
          icon: mkIcon(`<div style="width:16px;height:16px;border-radius:3px;background:${l.needsPower ? T.orangeBg : "#2a2a14"};border:2px solid ${col};display:flex;align-items:center;justify-content:center;color:${col};font:bold 9px ${T.mono}">⚿</div>`, 16),
        });
        marker.bindPopup(`<div style="font:12px ${T.mono};color:${col}">${l.key}${l.needsPower ? " (needs power)" : ""}</div>`, popupOpts);
        lockGroup.addLayer(marker);
      });
    }

    // ── BTR stops ──
    const btrGroup = groups.btr;
    if (btrGroup) {
      btrMarkers.forEach(b => {
        const marker = L.marker(toLL(b.pct), {
          icon: mkIcon(`<div style="width:22px;height:22px;border-radius:4px;background:${T.blueBg};border:2px solid ${T.blue};display:flex;align-items:center;justify-content:center;color:${T.blue};font:bold 11px ${T.mono}">B</div>`, 22),
        });
        marker.bindPopup(`<div style="font:12px ${T.mono};color:${T.blue}">BTR: ${b.name}</div>`, popupOpts);
        btrGroup.addLayer(marker);
      });
    }
  }, [apiMap, route, bounds, objWaypoints.length, extractWaypoints.length, stashMarkers.length, lockMarkers.length, btrMarkers.length, hazardPolys.length]);

  // Toggle layer visibility
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    Object.entries(layerGroupsRef.current).forEach(([id, group]) => {
      if (layers[id]) { if (!map.hasLayer(group)) map.addLayer(group); }
      else { if (map.hasLayer(group)) map.removeLayer(group); }
    });
  }, [layers]);

  return (
    <div>
      {/* Layer toggles */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
        {LAYER_DEFS.filter(l => hasLayerData(l.id)).map(l => (
          <button key={l.id} onClick={() => toggleLayer(l.id)} aria-pressed={layers[l.id]}
            style={{ background: layers[l.id] ? (l.id === "bosses" ? "#2a1414" : l.id === "hazards" ? "#2a2014" : l.id === "stashes" ? "#142a14" : l.id === "locks" ? "#2a2a14" : l.id === "btr" ? "#141a2a" : T.gold + "22") : "transparent",
              border: `1px solid ${layers[l.id] ? (l.id === "bosses" ? "#5a2020" : l.id === "hazards" ? "#5a4020" : l.id === "stashes" ? "#2a5a2a" : l.id === "locks" ? "#5a5a20" : l.id === "btr" ? "#2a4060" : T.gold) : T.border}`,
              color: layers[l.id] ? (l.id === "bosses" ? T.error : l.id === "hazards" ? T.orange : l.id === "stashes" ? T.success : l.id === "locks" ? "#d4b84a" : l.id === "btr" ? T.blue : T.gold) : T.textDim,
              padding: "4px 8px", fontSize: T.fs1, cursor: "pointer", fontFamily: T.sans, letterSpacing: 0.5 }}>
            {l.icon} {l.label}
          </button>
        ))}
      </div>
      {svgUrl ? (
        <div ref={mapContainerRef} aria-label={(apiMap?.name || "Map") + " map"} style={{ height: "60vh", minHeight: 350, maxHeight: 600, background: T.inputBg, border: `1px solid ${T.border}` }} />
      ) : (
        <div style={{ height: 160, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: T.inputBg, border: `1px solid ${T.border}` }}>
          <div style={{ color: T.textDim, fontSize: T.fs4, fontFamily: T.sans }}>Select a map above</div>
          {apiMap && <a href={`https://tarkov.dev/map/${apiMap.normalizedName}`} target="_blank" rel="noreferrer" style={{ color: T.blue, fontSize: T.fs3, fontFamily: T.sans }}>Open on tarkov.dev →</a>}
        </div>
      )}

      {/* Boss intel panel */}
      {layers.bosses && bossMarkers.length > 0 && (
        <div style={{ background: "#1f1414", border: `1px solid #4a2020`, borderLeft: `2px solid ${T.error}`, padding: 10, marginTop: 8 }}>
          <div style={{ fontSize: T.fs3, color: T.error, letterSpacing: 1, marginBottom: 6 }}>☠ BOSS INTEL</div>
          {bossMarkers.map((b, i) => (
            <div key={i} style={{ marginBottom: i < bossMarkers.length - 1 ? 6 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: T.textBright, fontSize: T.fs2, fontWeight: "bold" }}>{b.name}</span>
                <span style={{ color: b.chance >= 50 ? T.error : T.orange, fontSize: T.fs2, fontFamily: T.sans }}>{b.chance}%</span>
              </div>
              {b.locations.length > 0 && (
                <div style={{ fontSize: T.fs1, color: T.textDim, marginTop: 2 }}>
                  {b.locations.map(l => `${l.name}${l.chance < 100 ? ` (${l.chance}%)` : ""}`).join(" · ")}
                </div>
              )}
              {b.escorts.length > 0 && (
                <div style={{ fontSize: T.fs1, color: T.textDim, marginTop: 1 }}>
                  +{b.escorts.map(e => `${e.amount?.[0]?.count || "?"}× ${e.boss?.name || "guard"}`).join(", ")}
                </div>
              )}
              {b.trigger && <div style={{ fontSize: T.fs1, color: T.orange, marginTop: 1 }}>Trigger: {b.trigger}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Hazard legend */}
      {layers.hazards && hazardPolys.length > 0 && (
        <div style={{ background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderLeft: `2px solid ${T.orange}`, padding: 8, marginTop: 6 }}>
          <div style={{ fontSize: T.fs1, color: T.orange }}>
            ⚠ {hazardPolys.filter(h => h.type === "minefield").length > 0 && <span style={{ color: T.error }}>Red = minefields</span>}
            {hazardPolys.filter(h => h.type === "minefield").length > 0 && hazardPolys.filter(h => h.type === "sniper").length > 0 && " · "}
            {hazardPolys.filter(h => h.type === "sniper").length > 0 && <span style={{ color: T.orange }}>Orange = sniper zones</span>}
            {" — "}{hazardPolys.length} zones shown
          </div>
        </div>
      )}

      {/* Conflicts */}
      {conflicts.map(c => (
        <div key={c.id} style={{ background: T.orangeBg, border: `1px solid ${T.orangeBorder}`, borderLeft: `2px solid ${T.orange}`, padding: 10, marginTop: 8 }}>
          <div style={{ fontSize: T.fs3, color: T.orange, letterSpacing: 1, marginBottom: 5 }}>⚠ OVERLAPPING OBJECTIVES</div>
          <div style={{ fontSize: T.fs2, color: T.textBright, marginBottom: 8 }}>{c.label}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => onConflictResolve(c.id, "merge")} style={{ flex: 1, background: T.successBg, border: `1px solid ${T.successBorder}`, color: T.success, padding: "7px 0", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans }}>✓ MERGE</button>
            <button onClick={() => onConflictResolve(c.id, "separate")} style={{ flex: 1, background: T.inputBg, border: `1px solid ${T.blueBorder}`, color: T.blue, padding: "7px 0", fontSize: T.fs2, cursor: "pointer", fontFamily: T.sans }}>⇄ TWO STOPS</button>
          </div>
        </div>
      ))}

      {/* Unpositioned objectives */}
      {route.filter(w => !w.pct && !w.isExtract).length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `2px solid ${T.success}`, padding: 10, marginTop: 8 }}>
          <SL c="MAP-WIDE OBJECTIVES (no pin data)" s={{ marginBottom: 6 }} />
          {route.filter(w => !w.pct && !w.isExtract).map((w, i) => (
            <div key={w.id} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 5 }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{w.players.map(p => <Badge key={p.playerId} label={p.name} color={p.color} small />)}</div>
              <div style={{ fontSize: T.fs4, color: T.text, flex: 1 }}>{w.locationName}</div>
            </div>
          ))}
        </div>
      )}

      {/* Route sequence */}
      {(objWaypoints.length > 0 || extractWaypoints.length > 0) && (() => {
        // Pre-compute nearby lock names per waypoint for inline callouts
        const wpLockInfo = objWaypoints.map(w => {
          if (!w.pct || !bounds) return [];
          return lockMarkers.filter(l => Math.hypot(l.pct.x - w.pct.x, l.pct.y - w.pct.y) < 0.06).map(l => l.key);
        });
        // Check if any waypoint is inside a hazard polygon (simple point-in-polygon)
        const isInHazard = (wp) => {
          if (!wp.pct || !hazardPolys.length) return null;
          for (const h of hazardPolys) {
            let inside = false;
            for (let i = 0, j = h.points.length - 1; i < h.points.length; j = i++) {
              const xi = h.points[i].x, yi = h.points[i].y;
              const xj = h.points[j].x, yj = h.points[j].y;
              if (((yi > wp.pct.y) !== (yj > wp.pct.y)) && (wp.pct.x < (xj - xi) * (wp.pct.y - yi) / (yj - yi) + xi)) inside = !inside;
            }
            if (inside) return h.type;
          }
          return null;
        };
        return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `2px solid ${T.gold}`, padding: 10, marginTop: 8 }}>
          <SL c="ROUTE SEQUENCE" s={{ marginBottom: 10 }} />
          {objWaypoints.map((w, i) => {
            const nearbyLocks = wpLockInfo[i] || [];
            const hazard = isInHazard(w);
            return (
            <div key={w.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ background: (w.isLoot ? w.players[0]?.color : T.gold) + "22", border: `1px solid ${w.isLoot ? w.players[0]?.color : T.gold}`, color: w.isLoot ? w.players[0]?.color : T.gold, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: T.fs4, fontWeight: "bold", flexShrink: 0, fontFamily: T.sans }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.textBright, fontSize: T.fs2, fontWeight: "bold", marginBottom: 4 }}>{w.locationName}</div>
                {w.isLoot ? (
                  <div style={{ fontSize: T.fs4, color: w.players[0]?.color, marginBottom: 2 }}>
                    {w.players[0]?.objective}
                    <div style={{ fontSize: T.fs3, color: T.textDim, marginTop: 2 }}>{w.players[0]?.name}</div>
                  </div>
                ) : w.players.map((p, pi) => (
                  <div key={pi} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 3 }}>
                    <Badge label={p.name} color={p.color} small />
                    <div style={{ fontSize: T.fs4, color: p.color, flex: 1 }}>{p.objective}{p.total > 1 && p.progress < p.total && <span style={{ color: T.textDim }}> ({p.progress}/{p.total})</span>}{p.wikiLink && <a href={p.wikiLink} target="_blank" rel="noreferrer" style={{ background: T.blue + "22", color: T.blue, border: `1px solid ${T.blue}44`, padding: "2px 6px", fontSize: T.fs1, letterSpacing: 0.5, fontFamily: T.sans, whiteSpace: "nowrap", textDecoration: "none", fontWeight: "normal", marginLeft: 6 }}>WIKI ↗</a>}</div>
                  </div>
                ))}
                {hazard && <div style={{ fontSize: T.fs1, color: hazard === "minefield" ? T.error : T.orange, marginTop: 2 }}>⚠ {hazard === "minefield" ? "MINEFIELD" : "SNIPER ZONE"} — watch your step</div>}
                {nearbyLocks.length > 0 && <div style={{ fontSize: T.fs1, color: "#d4b84a", marginTop: 2 }}>⚿ Nearby: {nearbyLocks.slice(0, 3).join(", ")}{nearbyLocks.length > 3 ? ` +${nearbyLocks.length - 3}` : ""}</div>}
              </div>
            </div>
            );
          })}
          {/* Extract as final step */}
          {extractWaypoints.map((w) => (
            <div key={w.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ background: T.successBg, border: `1px solid ${T.successBorder}`, color: T.success, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: T.fs3, flexShrink: 0 }}>⬆</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: T.success, fontSize: T.fs2, fontWeight: "bold", marginBottom: 4 }}>EXTRACT — {w.extractName}</div>
                {w.players.map((p, pi) => (
                  <div key={pi} style={{ fontSize: T.fs3, color: T.success, opacity: 0.8 }}>
                    {p.name}{p.missingItems?.length > 0 && <span style={{ color: T.error }}> ⚠ missing {p.missingItems.join(", ")}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Tarkov.dev link */}
          {apiMap && (
            <a href={`https://tarkov.dev/map/${apiMap.normalizedName}`} target="_blank" rel="noreferrer"
              style={{ display: "block", background: T.blueBg, border: `1px solid ${T.blueBorder}`, color: T.blue, padding: "9px 0", fontSize: T.fs3, letterSpacing: 1, textDecoration: "none", fontFamily: T.sans, textTransform: "uppercase", textAlign: "center", marginTop: 10 }}>
              🗺 OPEN FULL INTERACTIVE MAP ON TARKOV.DEV →
            </a>
          )}
        </div>
        );
      })()}
    </div>
  );
}
