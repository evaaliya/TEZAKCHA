import { describe, it } from "vitest";

const run = process.env.RUN_DEVNET_TESTS === "1";

describe.runIf(run)("devnet integration", () => {
  it("runs scripts/devnet-e2e flow when keys are present", async () => {
    if (
      !process.env.FEE_PAYER_SECRET_KEY ||
      !process.env.E2E_SENDER_SECRET_KEY ||
      !process.env.DEMO_RECIPIENT_PUBKEY ||
      !process.env.USDC_DEVNET_MINT
    ) {
      throw new Error(
        "RUN_DEVNET_TESTS=1 requires FEE_PAYER_SECRET_KEY, E2E_SENDER_SECRET_KEY, DEMO_RECIPIENT_PUBKEY, USDC_DEVNET_MINT",
      );
    }
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("npx", ["tsx", "scripts/devnet-e2e.ts"], {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "devnet e2e failed");
    }
  }, 120_000);
});

describe.skipIf(run)("devnet integration (skipped by default)", () => {
  it("skipped unless RUN_DEVNET_TESTS=1", () => {
    // placeholder so the file is collected
  });
});
