/**
 * Jest Test Setup
 *
 * This file runs before all tests to set up the testing environment.
 */

import 'reflect-metadata';

// Increase timeout for async operations
jest.setTimeout(10000);

// Mock console.error to keep test output clean (optional)
// Uncomment if you want to suppress expected error logs during tests
// const originalError = console.error;
// beforeAll(() => {
//   console.error = jest.fn();
// });
// afterAll(() => {
//   console.error = originalError;
// });

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
