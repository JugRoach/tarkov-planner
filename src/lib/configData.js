import { T } from '../theme.js';
import { EMAPS } from './mapData.js';

export const ET_CONFIG = {
  open:    {label:"Always Open",         icon:"✓",  color:"#5dba5d", bg:T.successBg, border:"#2a6a2a"},
  key:     {label:"Key Required",        icon:"⚿",  color:"#d4b84a", bg:T.orangeBg, border:"#6a5a0a"},
  pay:     {label:"Pay Roubles",         icon:"₽",  color:"#5a7aba", bg:T.blueBg, border:"#2a3a6a"},
  coop:    {label:"N/A in PvE",          icon:"✗",  color:"#555",    bg:"#141414", border:"#3a3a3a"},
  special: {label:"Special Required",   icon:"⚠",  color:"#e05a5a", bg:T.errorBg, border:"#8a2a2a"},
  timed:   {label:"Timed — Listen Up",   icon:"◷",  color:"#d4943a", bg:T.orangeBg, border:"#7a5a1a"},
};

export const TC = {Beginner:"#4a9a4a",Intermediate:"#9a8a3a",Advanced:"#9a4a3a",Endgame:"#4a8a9a"};

// ─── KEY GUIDE — categorize keys by map via name patterns ────────────────
export const KEY_MAP_RULES = [
  { map:"customs", re:/Dorm room|Dorm guard|Dorm overseer|Tarcone Director|Gas station office|Gas station storage|Portable cabin|Portable bunkhouse|Trailer park|Pumping station|Military checkpoint|Weapon safe key|Machinery key|USEC stash key|Unknown key|Folding car|Reshala|Company director/ },
  { map:"factory", re:/Factory emergency/ },
  { map:"woods", re:/Shturman|ZB-014|SMW car|Yotota car/ },
  { map:"interchange", re:/OLI |Kiba Arms|NecrusPharm|EMERCOM medical|IDEA cash|Goshan cash|Power substation|ULTRA medical|Object #11SR|Object #21WS|Grumpy|HEP station/ },
  { map:"shoreline", re:/Health Resort|Cottage back door|Cottage safe|Weather station safe|Store safe key|Gas station safe|Convenience store|Pier door|Voron|USEC cottage/ },
  { map:"reserve", re:/^RB-/ },
  { map:"lighthouse", re:/Hillside house|Rogue USEC|Water treatment|Merin car|Radar station|Conference room|Operating room|Shared bedroom|Police truck|Rogue.*Barrack|Barrack.*Rogue|Leon.*hideout|Cold storage|Danex/ },
  { map:"streets-of-tarkov", re:/Concordia|Primorsky|Zmeisky|Pinewood|Chekannaya|Car dealership|Financial institution|Archive room|Housing office|Abandoned factory|TerraGroup meeting|TerraGroup security arm|TerraGroup science|Beluga|Horse restaurant|Skybridge|Aspect|Unity Credit|PE teacher|MVD|Real estate|Stair landing|Cargo container|Supply department|Store manager|Tarbank|X-ray room|Underground parking|Negotiation|Relaxation|Apartment locked|Iron gate|Mysterious room/ },
  { map:"the-lab", re:/TerraGroup Labs|Keycard with a blue marking|Polikhim/ },
  { map:"ground-zero", re:/Cardinal apartment|TerraGroup corporate|Elektronik|Cult victim|Rus Post|A\.P\..s apartment/ },
];
export function categorizeKey(name) { return KEY_MAP_RULES.filter(r => r.re.test(name)).map(r => r.map); }

export const LOOT_CONFIG = {
  "high-value":{label:"High Value",icon:"★",color:"#d4b84a",bg:"#1a1a08",border:"#6a5a0a"},
  tech:        {label:"Tech",      icon:"⚡",color:"#5a9aba",bg:"#08101a",border:"#2a4a6a"},
  medical:     {label:"Medical",   icon:"✚",color:"#5dba5d",bg:"#0a1a0a",border:"#2a6a2a"},
  mixed:       {label:"Mixed",     icon:"◈",color:"#9a8aba",bg:"#0f0a18",border:"#4a3a6a"},
  stash:       {label:"Stashes",   icon:"◉",color:"#8a7a5a",bg:"#141008",border:"#5a4a2a"},
};

// Maps item categories from tarkov.dev API to loot point types
export const CAT_TO_LOOT = {
  Electronics:["tech","high-value"],Info:["tech","high-value"],Battery:["tech","mixed"],
  Weapon:["high-value","mixed"],"Assault rifle":["high-value","mixed"],"Assault carbine":["high-value","mixed"],
  SMG:["high-value","mixed"],Shotgun:["high-value","mixed"],"Sniper rifle":["high-value","mixed"],
  "Marksman rifle":["high-value","mixed"],Handgun:["high-value","mixed"],Machinegun:["high-value","mixed"],
  "Weapon mod":["high-value","mixed"],"Gear mod":["mixed","high-value"],
  Armor:["high-value","mixed"],"Armored equipment":["high-value","mixed"],"Chest rig":["high-value","mixed"],
  Headwear:["high-value","mixed"],Backpack:["mixed","stash"],
  Meds:["medical","mixed"],Medikit:["medical","mixed"],"Medical supplies":["medical","mixed"],
  Stimulant:["medical","high-value"],Drug:["medical"],
  "Building material":["mixed","stash"],Tool:["mixed","stash"],Multitools:["mixed","stash"],
  Fuel:["mixed","stash"],"Household goods":["mixed","stash"],Lubricant:["mixed","stash"],
  Key:["mixed","stash","high-value"],Keycard:["high-value","tech"],
  Jewelry:["high-value","stash"],Money:["high-value","mixed","stash"],
  Food:["mixed","stash"],"Food and drink":["mixed","stash"],Drink:["mixed","stash"],
  Ammo:["mixed","high-value"],"Ammo container":["mixed","high-value"],
};
export function itemCatsToLootTypes(categories) {
  const types = new Set();
  (categories || []).forEach(c => (CAT_TO_LOOT[c.name] || ["mixed"]).forEach(t => types.add(t)));
  if (types.size === 0) types.add("mixed");
  return types;
}
const ITEMS_SEARCH_Q = (term) => `{items(name:"${term.replace(/["\\\n\r]/g,"")}", limit:20){id name shortName types categories{name}}}`;

// Hierarchical "What are you looking for?" categories
// tags: matched against loot point tags. subs: optional drill-down.
export const LOOK_CATS = [
  {id:"guns",label:"Guns",icon:"⊕",tags:["Weapon"],subs:[
    {id:"ar",label:"Assault Rifles",tags:["Assault rifle","Weapon"],subs:[
      {id:"ak74",label:"AK-74 Series",tags:["Weapon"]},{id:"ak100",label:"AK-100 Series",tags:["Weapon"]},
      {id:"m4",label:"M4A1 / HK416",tags:["Weapon"]},{id:"mdr",label:"MDR / SCAR",tags:["Weapon"]},
    ]},
    {id:"smg",label:"SMGs",tags:["SMG","Weapon"],subs:[
      {id:"mp5",label:"MP5 / MP7",tags:["Weapon"]},{id:"mpx",label:"MPX / Vector",tags:["Weapon"]},
      {id:"pp19",label:"PP-19 / Saiga-9",tags:["Weapon"]},
    ]},
    {id:"sniper",label:"Sniper / DMR",tags:["Sniper rifle","Marksman rifle","Weapon"],subs:[
      {id:"svd",label:"SVD / RSASS",tags:["Weapon"]},{id:"bolt",label:"M700 / DVL / T-5000",tags:["Weapon"]},
    ]},
    {id:"shotgun",label:"Shotguns",tags:["Shotgun","Weapon"]},
    {id:"pistol",label:"Pistols",tags:["Handgun","Weapon"]},
    {id:"lmg",label:"Machine Guns",tags:["Machinegun","Weapon"]},
  ]},
  {id:"armor",label:"Armor & Gear",icon:"◆",tags:["Armor","Armored equipment","Chest rig"],subs:[
    {id:"bodyarmor",label:"Body Armor",tags:["Armor","Armored equipment"]},
    {id:"rigs",label:"Chest Rigs",tags:["Chest rig"]},
    {id:"helmets",label:"Helmets",tags:["Headwear","Armor"]},
    {id:"backpacks",label:"Backpacks",tags:["Backpack"]},
  ]},
  {id:"mods",label:"Weapon Mods",icon:"⚙",tags:["Weapon mod","Gear mod"],subs:[
    {id:"scopes",label:"Scopes & Sights",tags:["Scope","Reflex sight","Compact reflex sight"]},
    {id:"muzzle",label:"Suppressors & Muzzle",tags:["Silencer","Muzzle device","Flashhider"]},
    {id:"grips",label:"Grips & Stocks",tags:["Foregrip","Pistol grip","Stock"]},
    {id:"mags",label:"Magazines",tags:["Magazine"]},
  ]},
  {id:"medical",label:"Medical",icon:"✚",tags:["Meds","Medical supplies","Stimulant"],subs:[
    {id:"medkits",label:"Medkits",tags:["Medikit","Meds"]},
    {id:"stims",label:"Stimulants",tags:["Stimulant"]},
    {id:"medsupply",label:"Medical Supplies",tags:["Medical supplies"]},
  ]},
  {id:"tech",label:"Electronics & Tech",icon:"⚡",tags:["Electronics","Info"],subs:[
    {id:"electronics",label:"Electronics",tags:["Electronics"]},
    {id:"intel",label:"Intel & Data",tags:["Info"]},
  ]},
  {id:"barter",label:"Barter & Crafting",icon:"◈",tags:["Barter item","Building material","Tool","Household goods","Fuel"],subs:[
    {id:"building",label:"Building Materials",tags:["Building material"]},
    {id:"tools",label:"Tools",tags:["Tool","Multitools"]},
    {id:"fuel",label:"Fuel",tags:["Fuel"]},
    {id:"household",label:"Household Goods",tags:["Household goods"]},
  ]},
  {id:"keys",label:"Keys & Keycards",icon:"⚿",tags:["Key","Keycard","Mechanical Key"]},
  {id:"valuables",label:"Valuables",icon:"★",tags:["Jewelry","Money"]},
  {id:"ammo",label:"Ammo & Grenades",icon:"▪",tags:["Ammo","Throwable weapon"]},
  {id:"food",label:"Food & Drink",icon:"▫",tags:["Food","Drink","Food and drink"]},
];

// Rank maps by how many loot points match the given tags
export function rankMapsByTags(tags) {
  const tagSet = new Set(tags);
  const mapScores = EMAPS.map(emap => {
    const matching = (emap.lootPoints || []).filter(lp => (lp.tags || []).some(t => tagSet.has(t)));
    return { mapId: emap.id, mapName: emap.name, color: emap.color, matchCount: matching.length, matchingSpots: matching.map(lp => lp.name) };
  }).filter(m => m.matchCount > 0).sort((a, b) => b.matchCount - a.matchCount);
  return mapScores;
}
