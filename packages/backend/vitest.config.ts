import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Prompts wait for the model's full response, so tests run for seconds.
    testTimeout: 60_000,
  },
});
