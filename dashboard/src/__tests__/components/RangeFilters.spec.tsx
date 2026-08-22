import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import RangeFilters from '../../components/RangeFilters';
import { ENTRY_TYPES } from '../../config/entryTypes';

const ShowLocation = () => {
  const location = useLocation();
  return <span data-testid="search">{location.search}</span>;
};

const show = (route: string, search = '') =>
  render(
    <MemoryRouter initialEntries={[`/${route}${search}`]}>
      <RangeFilters route={route} />
      <ShowLocation />
    </MemoryRouter>,
  );

describe('RangeFilters', () => {
  it('offers a time window on every page', () => {
    show('requests');

    expect(screen.getByLabelText('Time window')).toBeInTheDocument();
  });

  it('offers a duration where entries measure one', () => {
    show('requests');

    expect(screen.getByLabelText('Minimum duration')).toBeInTheDocument();
  });

  it.each([
    ['exceptions'],
    ['logs'],
  ])('hides the duration on %s, where nothing measures one', (route) => {
    // A bound on `duration` excludes every entry that carries none, so the
    // control could only empty the table.
    show(route);

    expect(screen.queryByLabelText('Minimum duration')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Time window')).toBeInTheDocument();
  });

  it('shows what the URL already says', () => {
    show('requests', '?window=1h&slower=500');

    expect(screen.getByLabelText('Time window')).toHaveValue('1h');
    expect(screen.getByLabelText('Minimum duration')).toHaveValue('500');
  });

  it('writes a chosen window to the URL', async () => {
    const user = userEvent.setup();
    show('requests');

    await user.selectOptions(screen.getByLabelText('Time window'), '15m');

    expect(screen.getByTestId('search')).toHaveTextContent('window=15m');
  });

  it('writes a chosen duration to the URL', async () => {
    const user = userEvent.setup();
    show('queries');

    await user.selectOptions(screen.getByLabelText('Minimum duration'), '1000');

    expect(screen.getByTestId('search')).toHaveTextContent('slower=1000');
  });

  it('falls back to the window alone for a route it does not know', () => {
    show('something-else');

    expect(screen.getByLabelText('Time window')).toBeInTheDocument();
    expect(screen.queryByLabelText('Minimum duration')).not.toBeInTheDocument();
  });

  it('agrees with the config about which entries measure a duration', () => {
    // The list is one place, and this is the check that it stays one place.
    const withoutDuration = Object.entries(ENTRY_TYPES)
      .filter(([, config]) => !config.measuresDuration)
      .map(([name]) => name);

    expect(withoutDuration.sort()).toEqual(['exception', 'log']);
  });
});
