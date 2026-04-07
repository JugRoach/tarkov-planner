import { useState, useEffect, useCallback } from "react";

export function useStorage(key,def){const[val,setVal]=useState(def);const[ready,setReady]=useState(false);useEffect(()=>{(async()=>{try{const r=await window.storage.get(key);if(r?.value)setVal(JSON.parse(r.value));}catch(_){}setReady(true);})();},[key]);const save=useCallback((v)=>{setVal(p=>{const next=typeof v==="function"?v(p):v;(async()=>{try{await window.storage.set(key,JSON.stringify(next));}catch(_){}})();return next;});},[key]);return[val,save,ready];}
