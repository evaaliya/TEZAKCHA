export interface PopularDestination {
  id: string;
  name: string;
  phone: string;
  hintKey: string;
}

export interface SavedRecipient {
  id: string;
  name: string;
  phone: string;
  lastMethod: string;
}

/** Demo destinations for Kyrgyzstan corridor — not real bank integrations. */
export const POPULAR_DESTINATIONS: PopularDestination[] = [
  {
    id: "aigul",
    name: "Айгуль К.",
    phone: "+996 700 112 233",
    hintKey: "home.dest.bishkek",
  },
  {
    id: "nurlan",
    name: "Нурлан С.",
    phone: "+996 555 441 122",
    hintKey: "home.dest.osh",
  },
  {
    id: "meerim",
    name: "Мээрим Т.",
    phone: "+996 770 908 070",
    hintKey: "home.dest.family",
  },
  {
    id: "bakyt",
    name: "Бакыт Д.",
    phone: "+996 312 00 00 00",
    hintKey: "home.dest.business",
  },
];

export const DEFAULT_SAVED_RECIPIENTS: SavedRecipient[] = [
  {
    id: "aigul",
    name: "Айгуль К.",
    phone: "+996 700 112 233",
    lastMethod: "phone",
  },
  {
    id: "nurlan",
    name: "Нурлан С.",
    phone: "+996 555 441 122",
    lastMethod: "intl_phone",
  },
  {
    id: "meerim",
    name: "Мээрим Т.",
    phone: "+996 770 908 070",
    lastMethod: "phone",
  },
];

const RECIPIENTS_KEY = "tezakcha_saved_recipients";
const FAVORITES_KEY = "tezakcha_favorite_methods";

export function loadSavedRecipients(): SavedRecipient[] {
  if (typeof window === "undefined") return DEFAULT_SAVED_RECIPIENTS;
  const raw = window.localStorage.getItem(RECIPIENTS_KEY);
  if (!raw) return DEFAULT_SAVED_RECIPIENTS;
  try {
    return JSON.parse(raw) as SavedRecipient[];
  } catch {
    return DEFAULT_SAVED_RECIPIENTS;
  }
}

export function saveSavedRecipients(list: SavedRecipient[]) {
  window.localStorage.setItem(RECIPIENTS_KEY, JSON.stringify(list));
}

export function loadFavoriteMethods(): string[] {
  if (typeof window === "undefined") return ["phone", "smart"];
  const raw = window.localStorage.getItem(FAVORITES_KEY);
  if (!raw) return ["phone", "smart"];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return ["phone", "smart"];
  }
}

export function saveFavoriteMethods(ids: string[]) {
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}
