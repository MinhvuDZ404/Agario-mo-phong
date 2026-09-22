import { defineConfig } from 'vitest/config';

/**
 * The session suite advances several fixed-step matches (including a full
 * 90-second mode playtest). Keep a finite, intentional budget rather than
 * relying on Vitest's 5-second unit-test default; a hung simulation still
 * fails quickly at 15 seconds.
 */
export default defineConfig({
  test: {
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
