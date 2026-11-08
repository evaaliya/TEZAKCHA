export interface Session {
  /** E.164 phone, e.g. +996700112233 or +14155552671 — primary account id */
  phone: string;
  /** Optional */
  email?: string;
  name?: string;
}

const KEY = "tezakcha_session";

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed.phone || typeof parsed.phone !== "string") {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return {
      phone: parsed.phone,
      email: parsed.email,
      name: parsed.name,
    };
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
}
