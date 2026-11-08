import fs from "node:fs";
import path from "node:path";
import Decimal from "decimal.js";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { quoteRoutes } from "@/lib/engine/quote";
import { loadRatesFixtures } from "@/lib/engine";
import { parseCbrDailyXml } from "@/lib/rates/cbr";
import { parseNbkrDailyXml } from "@/lib/rates/nbkr";
import {
  __resetLiveRatesForTests,
  getLiveRatesSnapshot,
  getRatesByVersion,
} from "@/lib/rates/live";
import { POST as quotePost } from "@/app/api/quote/route";
import { POST as preparePost } from "@/app/api/send/prepare/route";
import { quoteSolanaRoute } from "@/lib/api/sendHelpers";
import { resetConfigForTests } from "@/lib/config";
import {
  clearTransfersForTests,
  listTransfers,
} from "@/lib/store/transfers";
import {
  TEST_SENDER,
  applySolanaTestEnv,
  clearSolanaTestEnv,
} from "./helpers/solanaEnv";

const fixturesDir = path.join(process.cwd(), "tests", "fixtures");
const nbkrXml = fs.readFileSync(path.join(fixturesDir, "nbkr_daily.xml"));
const cbrXml = fs.readFileSync(path.join(fixturesDir, "cbr_daily.xml"));

function mockFetchFromFixtures(overrides?: {
  nbkrBody?: Buffer | string;
  cbrBody?: Buffer | string;
  failNbkr?: boolean;
  failCbr?: boolean;
  nbkrValueOverride?: string;
}): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("nbkr.kg")) {
      if (overrides?.failNbkr) {
        return new Response("fail", { status: 500 });
      }
      let body = overrides?.nbkrBody ?? nbkrXml;
      if (overrides?.nbkrValueOverride && Buffer.isBuffer(body)) {
        body = Buffer.from(
          body
            .toString("latin1")
            .replace(
              /(<Currency ISOCode="USD">[\s\S]*?<Value>)([^<]+)(<\/Value>)/,
              `$1${overrides.nbkrValueOverride}$3`,
            ),
          "latin1",
        );
      }
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }
    if (url.includes("cbr.ru")) {
      if (overrides?.failCbr) {
        return new Response("fail", { status: 500 });
      }
      return new Response(overrides?.cbrBody ?? cbrXml, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("bank XML parsers", () => {
  it("parses NBKR daily.xml including comma decimals and Date", () => {
    const xml = nbkrXml.toString("utf8");
    const rate = parseNbkrDailyXml(xml);
    expect(rate.asOf).toBe("2026-11-08");
    // 87,4478 / 1 from the saved curl fixture
    expect(rate.value.toFixed(4)).toBe("87.4478");
  });

  it("parses CBR XML_daily (windows-1251 + comma) and Nominal", () => {
    const xml = cbrXml.toString("latin1");
    const rate = parseCbrDailyXml(xml);
    expect(rate.asOf).toBe("2026-11-07");
    expect(rate.value.toFixed(4)).toBe("82.1386");

    const withNominal = `<?xml version="1.0" encoding="windows-1251"?>
      <ValCurs Date="07.11.2026" name="x">
        <Valute ID="R01235">
          <CharCode>USD</CharCode>
          <Nominal>100</Nominal>
          <Value>8213,8600</Value>
        </Valute>
      </ValCurs>`;
    const scaled = parseCbrDailyXml(withNominal);
    expect(scaled.value.toFixed(4)).toBe("82.1386");
  });

  it("derives RUB_USDC = 1 / USD_RUB", async () => {
    const { fetchImpl } = mockFetchFromFixtures();
    __resetLiveRatesForTests({ fetchImpl });
    process.env.RATES_SOURCE = "live";
    process.env.RATES_TTL_SECONDS = "3600";
    const snap = await getLiveRatesSnapshot();
    const usdRub = parseCbrDailyXml(cbrXml.toString("latin1")).value;
    const expected = new Decimal(1).div(usdRub);
    expect(new Decimal(snap.mid_rates.RUB_USDC).toFixed(12)).toBe(
      expected.toFixed(12),
    );
  });
});

describe("live rates cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T10:00:00.000Z"));
    process.env.RATES_SOURCE = "live";
    process.env.RATES_TTL_SECONDS = "3600";
    process.env.RATES_FETCH_TIMEOUT_MS = "3000";
    clearTransfersForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetLiveRatesForTests();
  });

  it("does not hit the network again before TTL and refreshes after", async () => {
    const { fetchImpl, calls } = mockFetchFromFixtures();
    __resetLiveRatesForTests({ fetchImpl });

    await getLiveRatesSnapshot();
    const afterFirst = calls.length;
    expect(afterFirst).toBe(2);

    await getLiveRatesSnapshot();
    expect(calls.length).toBe(afterFirst);

    vi.advanceTimersByTime(3600_000 + 1);
    await getLiveRatesSnapshot();
    expect(calls.length).toBe(afterFirst + 2);
  });

  it("dedupes parallel refresh into one fetch pair", async () => {
    const { fetchImpl, calls } = mockFetchFromFixtures();
    __resetLiveRatesForTests({ fetchImpl });

    const [a, b] = await Promise.all([
      getLiveRatesSnapshot(),
      getLiveRatesSnapshot(),
    ]);
    expect(a.rates_version).toBe(b.rates_version);
    expect(calls.length).toBe(2);
  });

  it("falls back live_stale then snapshot", async () => {
    // Empty cache + network down → fixtures snapshot
    __resetLiveRatesForTests({
      fetchImpl: mockFetchFromFixtures({ failNbkr: true, failCbr: true })
        .fetchImpl,
    });
    const emptyFail = await getLiveRatesSnapshot();
    expect(emptyFail.rates_source).toBe("snapshot");

    // Fresh live, then network down without clearing cache → live_stale
    __resetLiveRatesForTests({
      fetchImpl: mockFetchFromFixtures().fetchImpl,
    });
    const live = await getLiveRatesSnapshot();
    expect(live.rates_source).toBe("live");

    vi.advanceTimersByTime(3600_000 + 1);
    __resetLiveRatesForTests({
      fetchImpl: mockFetchFromFixtures({ failNbkr: true, failCbr: true })
        .fetchImpl,
      keepCache: true,
    });
    const stale = await getLiveRatesSnapshot();
    expect(stale.rates_source).toBe("live_stale");
    expect(stale.mid_rates.USDC_KGS).toBe(live.mid_rates.USDC_KGS);
  });

  it("rejects values that deviate more than 5%", async () => {
    const first = mockFetchFromFixtures();
    __resetLiveRatesForTests({ fetchImpl: first.fetchImpl });
    const live = await getLiveRatesSnapshot();
    const goodKgs = live.mid_rates.USDC_KGS;

    vi.advanceTimersByTime(3600_000 + 1);
    const g = globalThis as unknown as {
      __tezakchaRatesFetchImpl?: typeof fetch;
    };
    // ~10% higher than fixture/live → must be discarded
    g.__tezakchaRatesFetchImpl = mockFetchFromFixtures({
      nbkrValueOverride: "96,0000",
    }).fetchImpl;
    const after = await getLiveRatesSnapshot();
    expect(after.mid_rates.USDC_KGS).toBe(goodKgs);
  });
});

describe("rates_version pinning", () => {
  beforeEach(() => {
    process.env.RATES_SOURCE = "live";
    process.env.RATES_TTL_SECONDS = "3600";
    clearTransfersForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetLiveRatesForTests();
  });

  it("quote_changed when expected_amount_receive does not match current quote", async () => {
    __resetLiveRatesForTests({ fetchImpl: mockFetchFromFixtures().fetchImpl });
    applySolanaTestEnv();
    const before = listTransfers().length;

    await expect(
      quoteSolanaRoute({
        amountSend: new Decimal("1000"),
        routeId: "solana__xbt_kg__odengi",
        expectedAmountReceive: "0.01",
      }),
    ).rejects.toMatchObject({ code: "quote_changed", status: 409 });

    // prepare also returns 409 without writing a prepared tx when quote drifts
    process.env.DEMO_RECIPIENT_PUBKEY = TEST_SENDER.publicKey.toBase58();
    resetConfigForTests();
    const res = await preparePost(
      new Request("http://localhost/api/send/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_pubkey: TEST_SENDER.publicKey.toBase58(),
          recipient: "+996700000001",
          route_id: "solana__xbt_kg__odengi",
          amount_send: "1000",
          expected_amount_receive: "0.01",
          idempotency_key: "quote-changed-test",
        }),
      }),
    );
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe("quote_changed");
    expect(listTransfers().length).toBe(before);
    clearSolanaTestEnv();
  });

  it("pinned rates_version still reproduces amount_receive after cache refresh", async () => {
    __resetLiveRatesForTests({ fetchImpl: mockFetchFromFixtures().fetchImpl });

    const quoteRes = await quotePost(
      new Request("http://localhost/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_send: "10000", from: "RUB", to: "KGS" }),
      }),
    );
    const quote = await quoteRes.json();
    expect(quote.rates_version).toBeTruthy();
    const shown = quote.routes.find(
      (r: { route_id: string }) => r.route_id === "solana__xbt_kg__odengi",
    );
    expect(shown).toBeTruthy();

    vi.advanceTimersByTime(3600_000 + 1);
    const g = globalThis as unknown as {
      __tezakchaRatesFetchImpl?: typeof fetch;
    };
    g.__tezakchaRatesFetchImpl = mockFetchFromFixtures({
      nbkrValueOverride: "87,0000",
    }).fetchImpl;
    await getLiveRatesSnapshot();

    const pinned = getRatesByVersion(quote.rates_version)!;
    const [route] = quoteRoutes({
      amount_send: new Decimal("10000"),
      from: "RUB",
      to: "KGS",
      rates: pinned,
    }).filter((r) => r.route_id === "solana__xbt_kg__odengi");
    expect(route.amount_receive.toFixed()).toBe(shown.amount_receive);
  });
});

describe("fixtures mode still works", () => {
  it("quote returns snapshot reference_rates from fixtures", async () => {
    process.env.RATES_SOURCE = "fixtures";
    __resetLiveRatesForTests();
    const expected = loadRatesFixtures().reference_rates!;
    const res = await quotePost(
      new Request("http://localhost/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_send: "1000", from: "RUB", to: "KGS" }),
      }),
    );
    const data = await res.json();
    expect(data.rates_source).toBe("snapshot");
    expect(data.rates_version).toBeTruthy();
    expect(data.reference_rates.map((r: { id: string }) => r.id)).toEqual(
      expected.map((r) => r.id),
    );
    for (const rate of expected) {
      const found = data.reference_rates.find(
        (r: { id: string }) => r.id === rate.id,
      );
      expect(found.value).toBe(rate.value);
    }
  });
});
