/**
 * The search field writes `?search=` to the URL 350 ms after the last
 * keystroke. Two ways that timer used to touch the URL when it should not:
 *
 * - It was armed on every mount, and when it fired with nothing to change it
 *   still navigated, replacing the current entry with the same URL. Clicking
 *   a row within those 350 ms raced it: the click pushed `/requests/42`, the
 *   timer then replaced it with `/requests`, and the detail page never
 *   rendered.
 * - A search typed just before leaving the page was written after the page had
 *   been left, bouncing the browser back to the list.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom';
import EntrySearchInput from '../../components/EntrySearchInput';

const DEBOUNCE = 350;

let seen: Location[] = [];

function LocationProbe() {
  const location = useLocation();
  useEffect(() => {
    seen.push(location);
  }, [location]);
  return null;
}

let navigateTo: (to: string) => void = () => undefined;

function NavigateHandle() {
  const navigate = useNavigate();
  useEffect(() => {
    navigateTo = (to) => navigate(to);
  }, [navigate]);
  return null;
}

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/requests" element={<EntrySearchInput placeholder="Search requests" />} />
        <Route path="/requests/:id" element={<p>detail</p>} />
      </Routes>
      <LocationProbe />
      <NavigateHandle />
    </MemoryRouter>,
  );

const current = (): Location => seen[seen.length - 1];
const field = (): HTMLInputElement => screen.getByLabelText('Search requests');
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('EntrySearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seen = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not navigate when it mounts with nothing to change', async () => {
    renderAt('/requests?tags=SUCCESS');
    const mounted = current();

    await wait(DEBOUNCE + 50);

    expect(seen).toHaveLength(1);
    expect(current().key).toBe(mounted.key);
  });

  it('does not navigate when it mounts with a search already in the URL', async () => {
    renderAt('/requests?search=dump');
    const mounted = current();

    await wait(DEBOUNCE + 50);

    expect(current().key).toBe(mounted.key);
    expect(field().value).toBe('dump');
  });

  it('writes the typed search to the URL after the debounce, replacing the entry', async () => {
    renderAt('/requests?tags=SUCCESS');

    fireEvent.change(field(), { target: { value: 'dump' } });
    await wait(DEBOUNCE - 50);
    expect(current().search).toBe('?tags=SUCCESS');

    await wait(100);
    expect(current().pathname).toBe('/requests');
    expect(new URLSearchParams(current().search).get('search')).toBe('dump');
    expect(new URLSearchParams(current().search).get('tags')).toBe('SUCCESS');
  });

  it('removes the parameter when the field is cleared', async () => {
    renderAt('/requests?search=dump');

    fireEvent.click(screen.getByLabelText('Clear search'));
    await wait(DEBOUNCE + 50);

    expect(new URLSearchParams(current().search).has('search')).toBe(false);
  });

  it('follows the URL when it changes underneath, as back and forward do', async () => {
    renderAt('/requests?search=dump');

    act(() => navigateTo('/requests?search=gate'));

    expect(field().value).toBe('gate');
    await wait(DEBOUNCE + 50);
    expect(new URLSearchParams(current().search).get('search')).toBe('gate');
  });

  it('does not write a search after its page has been left', async () => {
    renderAt('/requests');

    fireEvent.change(field(), { target: { value: 'dump' } });
    act(() => navigateTo('/requests/42'));
    await wait(DEBOUNCE + 50);

    expect(current().pathname).toBe('/requests/42');
  });
});

describe('EntrySearchInput in the browser history', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/requests');
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  /**
   * React Router commits a navigation in a transition. While the next page's
   * code loads, the URL already reads `/requests/42` but the list, and this
   * field, are still mounted. A timer firing in that window must not write.
   */
  it('does not write a search once the URL has moved to another page', async () => {
    render(
      <BrowserRouter>
        <Routes>
          <Route path="/requests" element={<EntrySearchInput placeholder="Search requests" />} />
        </Routes>
      </BrowserRouter>,
    );

    fireEvent.change(field(), { target: { value: 'dump' } });
    window.history.pushState(null, '', '/requests/42');
    await wait(DEBOUNCE + 50);

    expect(window.location.pathname).toBe('/requests/42');
    expect(window.location.search).toBe('');
  });
});
