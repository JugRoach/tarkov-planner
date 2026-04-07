import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase.js";
import { PLAYER_COLORS } from "../theme.js";

export const ROOM_WORDS = ["ALPHA","BRAVO","CHARLIE","DELTA","ECHO","FOXTROT","GHOST","HUNTER","IRON","JACKAL","KILO","LIMA","MIKE","NOVA","OSCAR","PAPA","QUEST","RAVEN","SIERRA","TANGO","ULTRA","VIPER","WOLF","XRAY","YANK","ZULU"];
export function generateRoomCode() {
  const word = ROOM_WORDS[Math.floor(Math.random() * ROOM_WORDS.length)];
  const num = Math.floor(Math.random() * 900 + 100);
  return `${word}-${num}`;
}

export function useSquadRoom(myProfile) {
  const deviceId = localStorage.getItem("tg-device-id") || "unknown";
  const [roomId, setRoomId] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | creating | joining | connected | error
  const [error, setError] = useState(null);
  const [leaderId, setLeaderId] = useState(null); // device_id of leader, null = no leader
  const [sharedRoute, setSharedRoute] = useState(null); // route broadcast from leader
  const [sharedRouteConfig, setSharedRouteConfig] = useState(null); // {mapId, faction, routeMode, ...}
  const subRef = useRef(null);
  const roomSubRef = useRef(null);

  const isLeader = leaderId === deviceId;
  const hasLeader = leaderId !== null;

  // Push profile + preferences to room whenever they change
  useEffect(() => {
    if (!supabase || !roomId || !myProfile?.name) return;
    const profileData = { name: myProfile.name, color: myProfile.color, tasks: myProfile.tasks || [], progress: myProfile.progress || {} };
    supabase.from("squad_members").upsert(
      { room_id: roomId, device_id: deviceId, profile: profileData, updated_at: new Date().toISOString() },
      { onConflict: "room_id,device_id" }
    ).then(({ error: e }) => { if (e && import.meta.env.DEV) console.warn("[TG] Room profile sync failed:", e); });
  }, [roomId, myProfile?.name, myProfile?.color, myProfile?.tasks?.length, JSON.stringify(myProfile?.progress)]);

  // Push preferences (extract vote, ready state) separately so they don't conflict with profile syncs
  const updatePreferences = useCallback(async (prefs) => {
    if (!supabase || !roomId) return;
    // Merge with existing preferences
    const { data: current } = await supabase.from("squad_members").select("preferences").eq("room_id", roomId).eq("device_id", deviceId).single();
    const merged = { ...(current?.preferences || {}), ...prefs };
    await supabase.from("squad_members").update({ preferences: merged }).eq("room_id", roomId).eq("device_id", deviceId);
  }, [roomId, deviceId]);

  // Subscribe to room members AND room changes (for leader/route)
  const subscribeToRoom = useCallback((rid) => {
    if (!supabase) return;
    if (subRef.current) { supabase.removeChannel(subRef.current); subRef.current = null; }
    if (roomSubRef.current) { supabase.removeChannel(roomSubRef.current); roomSubRef.current = null; }

    // Initial fetch — members
    supabase.from("squad_members").select("*").eq("room_id", rid).then(({ data }) => {
      if (data) setMembers(data.filter(m => m.device_id !== deviceId));
    });

    // Initial fetch — room (leader, route)
    supabase.from("squad_rooms").select("leader_id, route, route_config").eq("id", rid).single().then(({ data }) => {
      if (data) {
        setLeaderId(data.leader_id || null);
        setSharedRoute(data.route || null);
        setSharedRouteConfig(data.route_config || null);
      }
    });

    // Realtime: members
    const memberChannel = supabase.channel(`room-members-${rid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "squad_members", filter: `room_id=eq.${rid}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          setMembers(prev => prev.filter(m => m.id !== payload.old.id));
        } else {
          const row = payload.new;
          if (row.device_id === deviceId) return;
          setMembers(prev => {
            const exists = prev.findIndex(m => m.id === row.id);
            if (exists >= 0) { const next = [...prev]; next[exists] = row; return next; }
            return [...prev, row];
          });
        }
      })
      .subscribe();
    subRef.current = memberChannel;

    // Realtime: room (leader changes, route broadcasts)
    const roomChannel = supabase.channel(`room-state-${rid}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "squad_rooms", filter: `id=eq.${rid}` }, (payload) => {
        const row = payload.new;
        setLeaderId(row.leader_id || null);
        setSharedRoute(row.route || null);
        setSharedRouteConfig(row.route_config || null);
      })
      .subscribe();
    roomSubRef.current = roomChannel;
  }, [deviceId]);

  const createRoom = useCallback(async () => {
    if (!supabase) { setError("Supabase not configured"); return; }
    setStatus("creating"); setError(null);
    try {
      const code = generateRoomCode();
      const { data, error: e } = await supabase.from("squad_rooms").insert({ code, created_by: deviceId }).select().single();
      if (e) throw e;
      setRoomId(data.id); setRoomCode(data.code); setStatus("connected");
      subscribeToRoom(data.id);
    } catch (e) { setError(e.message); setStatus("error"); }
  }, [deviceId, subscribeToRoom]);

  const joinRoom = useCallback(async (code) => {
    if (!supabase) { setError("Supabase not configured"); return; }
    setStatus("joining"); setError(null);
    try {
      const { data, error: e } = await supabase.from("squad_rooms").select("id, code, leader_id, route, route_config").eq("code", code.trim().toUpperCase()).single();
      if (e || !data) throw new Error("Room not found — check the code and try again.");
      setRoomId(data.id); setRoomCode(data.code); setStatus("connected");
      setLeaderId(data.leader_id || null);
      setSharedRoute(data.route || null);
      setSharedRouteConfig(data.route_config || null);
      subscribeToRoom(data.id);
    } catch (e) { setError(e.message); setStatus("error"); }
  }, [subscribeToRoom]);

  const leaveRoom = useCallback(async () => {
    if (subRef.current && supabase) { supabase.removeChannel(subRef.current); subRef.current = null; }
    if (roomSubRef.current && supabase) { supabase.removeChannel(roomSubRef.current); roomSubRef.current = null; }
    if (supabase && roomId) {
      // If leaving leader, clear leader
      if (isLeader) await supabase.from("squad_rooms").update({ leader_id: null, route: null, route_config: null }).eq("id", roomId);
      await supabase.from("squad_members").delete().eq("room_id", roomId).eq("device_id", deviceId);
    }
    setRoomId(null); setRoomCode(null); setMembers([]); setStatus("idle"); setError(null);
    setLeaderId(null); setSharedRoute(null); setSharedRouteConfig(null);
  }, [roomId, deviceId, isLeader]);

  // Claim / release leadership
  const claimLeader = useCallback(async () => {
    if (!supabase || !roomId) return;
    await supabase.from("squad_rooms").update({ leader_id: deviceId, route: null, route_config: null }).eq("id", roomId);
  }, [roomId, deviceId]);

  const releaseLeader = useCallback(async () => {
    if (!supabase || !roomId) return;
    await supabase.from("squad_rooms").update({ leader_id: null, route: null, route_config: null }).eq("id", roomId);
  }, [roomId]);

  // Broadcast route (leader only)
  const broadcastRoute = useCallback(async (route, config) => {
    if (!supabase || !roomId || !isLeader) return;
    await supabase.from("squad_rooms").update({ route, route_config: config }).eq("id", roomId);
  }, [roomId, isLeader]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (subRef.current && supabase) supabase.removeChannel(subRef.current);
      if (roomSubRef.current && supabase) supabase.removeChannel(roomSubRef.current);
    };
  }, []);

  // Convert members to squad profiles format
  const roomSquad = members.map(m => ({
    id: "room_" + m.device_id,
    name: m.profile?.name || "???",
    color: m.profile?.color || PLAYER_COLORS[1],
    tasks: m.profile?.tasks || [],
    progress: m.profile?.progress || {},
    imported: true,
    importedAt: new Date(m.updated_at).getTime(),
    isRoomMember: true,
    deviceId: m.device_id,
    preferences: m.preferences || {},
  }));

  return {
    roomId, roomCode, roomSquad, status, error,
    createRoom, joinRoom, leaveRoom,
    // Leader
    leaderId, isLeader, hasLeader, claimLeader, releaseLeader,
    // Route broadcast
    sharedRoute, sharedRouteConfig, broadcastRoute,
    // Preferences
    updatePreferences,
    deviceId,
  };
}
