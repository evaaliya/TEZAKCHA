export type TransferMethodId = "smart" | "intl_phone" | "network" | "own_accounts";

export type TransferSupport = "live" | "demo";

export interface TransferMethod {
  id: TransferMethodId;
  labelKey: string;
  group: "international" | "smart" | "accounts";
  support: TransferSupport;
  /** Query value passed to /send, or special path */
  sendMethod: string;
  icon: string;
  searchTerms: string[];
  /** If set, home/transfers link here instead of /send */
  href?: string;
}

/** Methods that reuse the existing /send → /routes comparison flow. */
export const LIVE_SEND_METHODS = new Set(["smart", "intl_phone", "network"]);

export const TRANSFER_METHODS: TransferMethod[] = [
  {
    id: "smart",
    labelKey: "method.smart",
    group: "smart",
    support: "live",
    sendMethod: "smart",
    icon: "spark",
    searchTerms: ["smart", "умный", "акылдуу", "route", "маршрут"],
  },
  {
    id: "own_accounts",
    labelKey: "method.own_accounts",
    group: "accounts",
    support: "live",
    sendMethod: "own_accounts",
    icon: "swap",
    href: "/accounts",
    searchTerms: ["own", "свои", "эсеп", "accounts", "баланс", "карта", "кошелёк"],
  },
  {
    id: "intl_phone",
    labelKey: "method.international",
    group: "international",
    support: "live",
    sendMethod: "intl_phone",
    icon: "globe",
    searchTerms: ["international", "международ", "эл аралык", "phone", "перевод"],
  },
  {
    id: "network",
    labelKey: "method.network",
    group: "international",
    support: "live",
    sendMethod: "network",
    icon: "chain",
    searchTerms: ["express", "сеть", "быстр", "tezakcha", "network"],
  },
];

/** Quick-action tiles on the home screen. */
export const HOME_QUICK_METHODS: string[] = ["own_accounts", "intl_phone", "network"];

export const HOME_METHOD_ALIASES: Record<string, TransferMethodId> = {};

export function getMethod(id: string): TransferMethod | undefined {
  const resolved = HOME_METHOD_ALIASES[id] ?? id;
  return TRANSFER_METHODS.find((m) => m.id === resolved);
}

export function sendHref(methodId: string, extra?: Record<string, string>): string {
  const method = getMethod(methodId) ?? TRANSFER_METHODS[0];
  if (method.href && (!extra || Object.keys(extra).length === 0)) {
    return method.href;
  }
  const params = new URLSearchParams({ method: method.sendMethod, ...extra });
  return `/send?${params.toString()}`;
}
