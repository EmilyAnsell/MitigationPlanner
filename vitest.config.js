import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          include: ["tests/unit/**/*.test.js"],
          name: "unit",
          environment: "node",
          globals: true,
        },
      },
      {
        plugins: [react()],
        test: {
          include: ["tests/browser/**/*.test.js*"],
          name: "browser",
          globals: true,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "firefox" }],
          },
        },
      },
    ],
  },
});
