import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';

// Mock window object for Node environment
if (typeof window === 'undefined') {
  // @ts-expect-error - mocking window for tests
  global.window = {
    innerWidth: 1920,
    innerHeight: 1080,
  };
}

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock console methods to reduce noise in tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});

// Restore console.error for debugging test failures
// vi.spyOn(console, "error").mockImplementation(() => {});
