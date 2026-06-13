import { readFileSync, writeFileSync } from "node:fs";
import { CONFIG } from "./config.js";

interface PersistedState {
  sessions: Record<string, string>; // phone → session_id do Agent SDK
  pauses: Record<string, number>;   // phone → timestamp (ms) até quando o bot fica calado
}

let state: PersistedState = { sessions: {}, pauses: {} };

try {
  state = JSON.parse(readFileSync(CONFIG.stateFile, "utf-8"));
} catch {
  /* primeiro boot */
}

function persist() {
  try {
    writeFileSync(CONFIG.stateFile, JSON.stringify(state), "utf-8");
  } catch (err) {
    console.error("[girassol] falha ao persistir estado:", err);
  }
}

export function getSession(phone: string): string | undefined {
  return state.sessions[phone];
}

export function setSession(phone: string, sessionId: string) {
  state.sessions[phone] = sessionId;
  persist();
}

export function clearSession(phone: string) {
  delete state.sessions[phone];
  persist();
}

export function pauseBot(phone: string, hours = CONFIG.pauseHours) {
  state.pauses[phone] = Date.now() + hours * 3600_000;
  persist();
}

export function isPaused(phone: string): boolean {
  const until = state.pauses[phone];
  if (!until) return false;
  if (Date.now() > until) {
    delete state.pauses[phone];
    persist();
    return false;
  }
  return true;
}
