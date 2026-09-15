import { defineConfig } from 'vitest/config';

// The suite covers the domain layer, which is deliberately free of React and DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
