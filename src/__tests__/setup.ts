import 'reflect-metadata';
import { afterEach, vi } from 'vitest';
import { installLoopbackListenGuard } from './support/loopback-listen';

installLoopbackListenGuard();

// After each test rather than `clearMocks: true`, which clears before each one
// and would erase the calls a `beforeAll` made before the first test reads them.
afterEach(() => {
  vi.clearAllMocks();
});
