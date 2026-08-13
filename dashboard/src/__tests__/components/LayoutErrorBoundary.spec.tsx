/**
 * A page that throws must not take the application with it.
 *
 * The only boundary used to be at the root, so a detail view meeting a payload
 * it could not render left a white screen: no navigation, no way back except a
 * reload. The boundary now sits around the routed page, inside the shell.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Layout from '../../components/Layout';
import { StatsContext } from '../../contexts/useStats';

function Exploding(): JSX.Element {
  throw new Error('this page could not render');
}

const stats = { stats: null, error: null, refreshStats: async () => undefined };

const renderWithCrashingPage = () =>
  render(
    <StatsContext.Provider value={stats}>
      <MemoryRouter initialEntries={['/requests']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="requests" element={<Exploding />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </StatsContext.Provider>,
  );

describe('a page that throws', () => {
  beforeEach(() => {
    // React logs the caught error; the test asserts on what the user sees.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is reported without blanking the application', () => {
    renderWithCrashingPage();

    // The shell survives: the navigation is still there to leave by.
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0);
  });
});
