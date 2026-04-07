// API and app-wide constants
export const API_URL = "https://api.tarkov.dev/graphql";
export const CODE_VERSION = "TG2";
export const BUILD_CODE_VERSION = "TGB";
// In-game trader menu order
export const TRADER_ORDER = ["Prapor","Therapist","Fence","Skier","Peacekeeper","Mechanic","Ragman","Jaeger","Lightkeeper","BTR Driver","Ref","Taran","Radio station","Mr. Kerman","Voevoda"];
export const traderSort = (a, b) => { const ia = TRADER_ORDER.indexOf(a); const ib = TRADER_ORDER.indexOf(b); return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib); };
