import { CODE_VERSION, BUILD_CODE_VERSION } from '../constants.js';
import { PLAYER_COLORS } from '../theme.js';

// ─── SHARE CODES ─────────────────────────────────────────────
export function encodeProfile(p){try{return CODE_VERSION+":"+btoa(unescape(encodeURIComponent(JSON.stringify({v:2,n:p.name,c:p.color,t:p.tasks||[],pr:p.progress||{}}))));}catch{return null;}}
export function decodeProfile(code){try{if(!code||code.length>50000)return null;const b64=code.trim().startsWith(CODE_VERSION+":")?code.trim().slice(CODE_VERSION.length+1):code.trim();const d=JSON.parse(decodeURIComponent(escape(atob(b64))));if(!d.n||typeof d.n!=="string")return null;return{id:"imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),name:d.n.slice(0,30),color:d.c||PLAYER_COLORS[0],tasks:Array.isArray(d.t)?d.t:[],progress:d.pr&&typeof d.pr==="object"?d.pr:{},imported:true,importedAt:Date.now()};}catch{return null;}}

// ─── BUILD SHARE CODES ──────────────────────────────────────
export function encodeBuild(build){try{return BUILD_CODE_VERSION+":"+btoa(unescape(encodeURIComponent(JSON.stringify({w:build.weaponId,m:build.mods||{},n:build.name||""}))));}catch{return null;}}
export function decodeBuild(code){try{const b64=code.trim().startsWith(BUILD_CODE_VERSION+":")?code.trim().slice(BUILD_CODE_VERSION.length+1):code.trim();const d=JSON.parse(decodeURIComponent(escape(atob(b64))));if(!d.w)return null;return{id:"bld_"+Date.now(),weaponId:d.w,mods:d.m||{},name:d.n||"Imported Build",createdAt:Date.now()};}catch{return null;}}
