import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RelatedEntries from '../../components/RelatedEntries';
import { Entry } from '../../types';

/**
 * RelatedEntries Component Tests
 *
 * Following AAA pattern (Arrange-Act-Assert).
 */

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

const queryEntry = (id: number): Entry =>
  ({
    id,
    type: 'query',
    createdAt: new Date().toISOString(),
    payload: {
      query: `SELECT * FROM users WHERE id = ${id}`,
      duration: 12.5,
      connection: 'default',
    },
  }) as Entry;

describe('RelatedEntries', () => {
  it('lists the related queries it is given', () => {
    // Arrange & Act
    render(
      <RouterWrapper>
        <RelatedEntries entries={[queryEntry(1)]} />
      </RouterWrapper>,
    );

    // Assert
    expect(screen.getByText(/SELECT \* FROM users/)).toBeInTheDocument();
  });

  it('renders nothing when there is nothing related', () => {
    // Arrange & Act
    const { container } = render(
      <RouterWrapper>
        <RelatedEntries entries={[]} />
      </RouterWrapper>,
    );

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The regression this exists for: `useMemo` sat below the early return for
   * "nothing related", so a render that took that branch called one hook fewer
   * than the render before it. React identifies hooks by call order and throws
   * "rendered fewer hooks than expected", which took the whole detail page down
   * — reachable by moving from an entry that has related entries to one that
   * does not, since the router reuses this component instance.
   */
  it('survives losing its entries while mounted', () => {
    // Arrange
    const { rerender } = render(
      <RouterWrapper>
        <RelatedEntries entries={[queryEntry(1)]} />
      </RouterWrapper>,
    );
    expect(screen.getByText(/SELECT \* FROM users/)).toBeInTheDocument();

    // Act - the same instance is handed an entry with nothing related
    const rerenderWithNone = () =>
      rerender(
        <RouterWrapper>
          <RelatedEntries entries={[]} />
        </RouterWrapper>,
      );

    // Assert
    expect(rerenderWithNone).not.toThrow();
    expect(screen.queryByText(/SELECT \* FROM users/)).not.toBeInTheDocument();
  });
});
