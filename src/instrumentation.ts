/**
 * Validate Solana-related env on server start.
 * Invalid non-empty values fail the process and name the field (never secret values).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadConfig, ConfigError } = await import("@/lib/config");
    try {
      loadConfig();
    } catch (e) {
      if (e instanceof ConfigError) {
        console.error(`[config] Invalid ${e.field}: ${e.message}`);
        throw e;
      }
      throw e;
    }
  }
}
