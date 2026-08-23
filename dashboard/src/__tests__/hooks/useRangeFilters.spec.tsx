import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ReactNode } from 'react';
import { useRangeFilters } from '../../hooks/useRangeFilters';

/**
 * The two range filters live in the query string, like every other filter.
 *
 * A narrowed view has to be a link somebody can send and a refresh must not
 * lose it, so the URL is the state and the hook only reads it.
 */
const at = (search: string) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[`/requests${search}`]}>{children}</MemoryRouter>
  );

  return renderHook(
    () => ({ range: useRangeFilters(), location: useLocation() }),
    { wrapper },
  );
};

describe('useRangeFilters', () => {
  it('defaults to everything', () => {
    const { result } = at('');

    expect(result.current.range.window).toBe('all');
    expect(result.current.range.duration).toBe('any');
    expect(result.current.range.windowMinutes).toBe(0);
    expect(result.current.range.rangeFilters).toEqual({});
    expect(result.current.range.hasRange).toBe(false);
  });

  it('reads a window from the URL', () => {
    const { result } = at('?window=15m');

    expect(result.current.range.window).toBe('15m');
    expect(result.current.range.windowMinutes).toBe(15);
    expect(result.current.range.hasRange).toBe(true);
  });

  it('reads a duration from the URL', () => {
    const { result } = at('?slower=500');

    expect(result.current.range.duration).toBe('500');
    expect(result.current.range.rangeFilters).toEqual({ minDuration: 500 });
  });

  it('reads both at once', () => {
    const { result } = at('?window=1h&slower=1000');

    expect(result.current.range.windowMinutes).toBe(60);
    expect(result.current.range.rangeFilters).toEqual({ minDuration: 1000 });
  });

  it.each([
    ['a window nobody offers', '?window=37y'],
    ['a duration nobody offers', '?slower=-1'],
    ['an empty value', '?window='],
    ['a value that is not a number', '?slower=soon'],
  ])('ignores %s', (_name, search) => {
    const { result } = at(search);

    expect(result.current.range.window).toBe('all');
    expect(result.current.range.duration).toBe('any');
    expect(result.current.range.hasRange).toBe(false);
  });

  it('writes a chosen window to the URL', () => {
    const { result } = at('');

    act(() => result.current.range.setWindow('5m'));

    expect(result.current.location.search).toBe('?window=5m');
    expect(result.current.range.windowMinutes).toBe(5);
  });

  it('takes the parameter out again rather than writing the default', () => {
    // `?window=all` says the same thing as no parameter; a link should not
    // carry it, and neither should the URL somebody copies.
    const { result } = at('?window=5m');

    act(() => result.current.range.setWindow('all'));

    expect(result.current.location.search).toBe('');
  });

  it('keeps the other filters when one range changes', () => {
    const { result } = at('?methods=GET&window=5m');

    act(() => result.current.range.setDuration('100'));

    expect(result.current.location.search).toContain('methods=GET');
    expect(result.current.location.search).toContain('window=5m');
    expect(result.current.location.search).toContain('slower=100');
  });

  it('clears both ranges and nothing else', () => {
    const { result } = at('?methods=GET&window=5m&slower=100');

    act(() => result.current.range.clearRanges());

    expect(result.current.location.search).toBe('?methods=GET');
    expect(result.current.range.hasRange).toBe(false);
  });

  it('gives back minutes rather than an instant', () => {
    // The instant has to be computed where the request is made: a `from` fixed
    // when the window was chosen would keep sliding out of date, so after ten
    // minutes on the page "last 5 minutes" would be showing fifteen.
    const { result } = at('?window=24h');

    expect(result.current.range.windowMinutes).toBe(60 * 24);
    expect(result.current.range.rangeFilters).not.toHaveProperty('from');
  });
});
