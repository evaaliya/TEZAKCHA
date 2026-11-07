import fs from "node:fs";
import path from "node:path";
import type { RatesSnapshot } from "./types";

export function loadRatesFixtures(): RatesSnapshot {
  const filePath = path.join(process.cwd(), "config", "rates.fixtures.json");
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as RatesSnapshot;
}

export function getRatesSnapshot(): RatesSnapshot {
  const source = process.env.RATES_SOURCE ?? "fixtures";
  if (source !== "fixtures") {
    // Live adapter placeholder — fixtures remain the default for the hackathon demo.
    return loadRatesFixtures();
  }
  return loadRatesFixtures();
}
