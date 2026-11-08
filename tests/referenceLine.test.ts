import { beforeAll, describe, expect, it } from "vitest";
import { loadRatesFixtures } from "@/lib/engine";
import type { ReferenceRate } from "@/lib/engine/types";
import {
  formatAsOfDate,
  formatReferenceLine,
} from "@/lib/format/referenceLine";
import { __resetLiveRatesForTests } from "@/lib/rates/live";
import { POST as quotePost } from "@/app/api/quote/route";
import en from "../locales/en.json";
import ky from "../locales/ky.json";
import ru from "../locales/ru.json";

beforeAll(() => {
  process.env.RATES_SOURCE = "fixtures";
  __resetLiveRatesForTests();
});

const dictionaries: Record<string, Record<string, string>> = { en, ru, ky };

function tFor(locale: "ru" | "ky" | "en") {
  return (key: string) =>
    dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
}

describe("formatReferenceLine", () => {
  const fixtures = loadRatesFixtures();
  const referenceRates = fixtures.reference_rates as ReferenceRate[];

  it("formats without as_of (no date) and with as_of as DD.MM.YYYY for ru/ky/en", () => {
    const withoutAsOf = referenceRates.find((r) => !r.as_of)!;
    const withAsOf = referenceRates.find((r) => Boolean(r.as_of))!;
    expect(withoutAsOf).toBeTruthy();
    expect(withAsOf).toBeTruthy();
    expect(formatAsOfDate(withoutAsOf.as_of)).toBeNull();
    expect(formatAsOfDate(withAsOf.as_of)).toBe("06.11.2026");

    for (const locale of ["ru", "ky", "en"] as const) {
      const t = tFor(locale);
      const simulated = t("routes.simulated");
      const line = formatReferenceLine(referenceRates, t, simulated);

      expect(line).toContain(
        `${t(withoutAsOf.institution_key)}: ${withoutAsOf.value} ${withoutAsOf.pair}`,
      );
      expect(line).toContain(
        `${t(withAsOf.institution_key)}: ${withAsOf.value} ${withAsOf.pair} 06.11.2026`,
      );
      expect(line.endsWith(simulated)).toBe(true);
      expect(line.split(" · ").length).toBe(referenceRates.length + 1);

      // NBKR entry has no as_of — date must not appear next to its value/pair alone as a stray token
      const nbkrSegment = line
        .split(" · ")
        .find((p) => p.startsWith(t(withoutAsOf.institution_key)));
      expect(nbkrSegment).toBe(
        `${t(withoutAsOf.institution_key)}: ${withoutAsOf.value} ${withoutAsOf.pair}`,
      );
    }
  });
});

describe("/api/quote reference_rates", () => {
  it("returns rates_source and reference_rates from fixtures (no hardcoded values)", async () => {
    const fixtures = loadRatesFixtures();
    const expected = fixtures.reference_rates!;

    const res = await quotePost(
      new Request("http://localhost/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_send: "1000", from: "RUB", to: "KGS" }),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(["live", "live_stale", "snapshot"]).toContain(data.rates_source);
    expect(data.rates_source).toBe("snapshot");
    expect(data.reference_rates).toEqual(expected);
    for (const rate of expected) {
      const found = data.reference_rates.find(
        (r: ReferenceRate) => r.id === rate.id,
      );
      expect(found.value).toBe(rate.value);
      expect(found.pair).toBe(rate.pair);
      if (rate.as_of) expect(found.as_of).toBe(rate.as_of);
      else expect(found.as_of).toBeUndefined();
    }
  });
});
