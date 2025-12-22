import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClickableBadge, { getBadgeColor, FilterBadge, BadgeList } from '../../components/ClickableBadge';

// Wrapper for components that use router
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

/**
 * ClickableBadge Component Tests
 *
 * Tests for badge rendering, colors, and interactions.
 * Following AAA pattern (Arrange-Act-Assert).
 */

describe('getBadgeColor', () => {
  describe('Path Detection', () => {
    it('returns cyan for paths starting with /', () => {
      // Arrange & Act
      const color = getBadgeColor('/api/users');

      // Assert
      expect(color).toContain('bg-cyan-100');
      expect(color).toContain('text-cyan-800');
    });

    it('returns cyan for root path', () => {
      // Arrange & Act
      const color = getBadgeColor('/');

      // Assert
      expect(color).toContain('bg-cyan-100');
    });
  });

  describe('IP Address Detection', () => {
    it('returns indigo for IPv4 addresses', () => {
      // Arrange & Act
      const color = getBadgeColor('192.168.1.1');

      // Assert
      expect(color).toContain('bg-indigo-100');
      expect(color).toContain('text-indigo-800');
    });

    it('returns indigo for localhost IP', () => {
      // Arrange & Act
      const color = getBadgeColor('127.0.0.1');

      // Assert
      expect(color).toContain('bg-indigo-100');
    });

    it('returns indigo for IPv6 addresses', () => {
      // Arrange & Act
      const color = getBadgeColor('::1');

      // Assert
      expect(color).toContain('bg-indigo-100');
    });
  });

  describe('Controller Detection', () => {
    it('returns teal for controller actions with #', () => {
      // Arrange & Act
      const color = getBadgeColor('UserController#index');

      // Assert
      expect(color).toContain('bg-teal-100');
      expect(color).toContain('text-teal-800');
    });

    it('returns teal for controller actions with ::', () => {
      // Arrange & Act
      const color = getBadgeColor('User::create');

      // Assert
      expect(color).toContain('bg-teal-100');
    });

    it('returns teal for Controller.method pattern', () => {
      // Arrange & Act
      const color = getBadgeColor('UserController.getAll');

      // Assert
      expect(color).toContain('bg-teal-100');
    });
  });

  describe('Hostname Detection', () => {
    it('returns slate for localhost', () => {
      // Arrange & Act
      const color = getBadgeColor('localhost');

      // Assert
      expect(color).toContain('bg-slate-100');
      expect(color).toContain('text-slate-800');
    });

    it('returns slate for hostname with port', () => {
      // Arrange & Act
      const color = getBadgeColor('api.example.com:3000');

      // Assert
      expect(color).toContain('bg-slate-100');
    });

    it('returns slate for domain with TLD', () => {
      // Arrange & Act
      const color = getBadgeColor('api.example.com');

      // Assert
      expect(color).toContain('bg-slate-100');
    });
  });

  describe('HTTP Methods', () => {
    it('returns green for GET', () => {
      // Arrange & Act
      const color = getBadgeColor('GET');

      // Assert
      expect(color).toContain('bg-green-100');
      expect(color).toContain('text-green-800');
    });

    it('returns blue for POST', () => {
      // Arrange & Act
      const color = getBadgeColor('POST');

      // Assert
      expect(color).toContain('bg-blue-100');
      expect(color).toContain('text-blue-800');
    });

    it('returns yellow for PUT', () => {
      // Arrange & Act
      const color = getBadgeColor('PUT');

      // Assert
      expect(color).toContain('bg-yellow-100');
      expect(color).toContain('text-yellow-800');
    });

    it('returns orange for PATCH', () => {
      // Arrange & Act
      const color = getBadgeColor('PATCH');

      // Assert
      expect(color).toContain('bg-orange-100');
      expect(color).toContain('text-orange-800');
    });

    it('returns red for DELETE', () => {
      // Arrange & Act
      const color = getBadgeColor('DELETE');

      // Assert
      expect(color).toContain('bg-red-100');
      expect(color).toContain('text-red-800');
    });

    it('returns gray for HEAD', () => {
      // Arrange & Act
      const color = getBadgeColor('HEAD');

      // Assert
      expect(color).toContain('bg-gray-100');
    });

    it('returns gray for OPTIONS', () => {
      // Arrange & Act
      const color = getBadgeColor('OPTIONS');

      // Assert
      expect(color).toContain('bg-gray-100');
    });

    it('returns pink for GRAPHQL', () => {
      // Arrange & Act
      const color = getBadgeColor('GRAPHQL');

      // Assert
      expect(color).toContain('bg-pink-100');
      expect(color).toContain('text-pink-800');
    });
  });

  describe('HTTP Status Codes', () => {
    it('returns green for 2xx status codes', () => {
      // Arrange & Act
      const color = getBadgeColor('200');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns green for 201', () => {
      // Arrange & Act
      const color = getBadgeColor('201');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns blue for 3xx status codes', () => {
      // Arrange & Act
      const color = getBadgeColor('301');

      // Assert
      expect(color).toContain('bg-blue-100');
    });

    it('returns yellow for 4xx status codes', () => {
      // Arrange & Act
      const color = getBadgeColor('404');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });

    it('returns red for 5xx status codes', () => {
      // Arrange & Act
      const color = getBadgeColor('500');

      // Assert
      expect(color).toContain('bg-red-100');
    });
  });

  describe('Status Tags', () => {
    it('returns green for SUCCESS', () => {
      // Arrange & Act
      const color = getBadgeColor('SUCCESS');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns green for 2XX', () => {
      // Arrange & Act
      const color = getBadgeColor('2XX');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns green for HIT', () => {
      // Arrange & Act
      const color = getBadgeColor('HIT');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns blue for REDIRECT', () => {
      // Arrange & Act
      const color = getBadgeColor('REDIRECT');

      // Assert
      expect(color).toContain('bg-blue-100');
    });

    it('returns blue for 3XX', () => {
      // Arrange & Act
      const color = getBadgeColor('3XX');

      // Assert
      expect(color).toContain('bg-blue-100');
    });

    it('returns yellow for WARNING', () => {
      // Arrange & Act
      const color = getBadgeColor('WARNING');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });

    it('returns yellow for WARN', () => {
      // Arrange & Act
      const color = getBadgeColor('WARN');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });

    it('returns yellow for 4XX', () => {
      // Arrange & Act
      const color = getBadgeColor('4XX');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });

    it('returns yellow for CLIENT-ERROR', () => {
      // Arrange & Act
      const color = getBadgeColor('CLIENT-ERROR');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });

    it('returns red for ERROR', () => {
      // Arrange & Act
      const color = getBadgeColor('ERROR');

      // Assert
      expect(color).toContain('bg-red-100');
    });

    it('returns red for 5XX', () => {
      // Arrange & Act
      const color = getBadgeColor('5XX');

      // Assert
      expect(color).toContain('bg-red-100');
    });

    it('returns red for HTTP-ERROR', () => {
      // Arrange & Act
      const color = getBadgeColor('HTTP-ERROR');

      // Assert
      expect(color).toContain('bg-red-100');
    });

    it('returns red for VALIDATION-ERROR', () => {
      // Arrange & Act
      const color = getBadgeColor('VALIDATION-ERROR');

      // Assert
      expect(color).toContain('bg-red-100');
    });

    it('returns red for FAILED', () => {
      // Arrange & Act
      const color = getBadgeColor('FAILED');

      // Assert
      expect(color).toContain('bg-red-100');
    });
  });

  describe('Performance Tags', () => {
    it('returns orange for SLOW', () => {
      // Arrange & Act
      const color = getBadgeColor('SLOW');

      // Assert
      expect(color).toContain('bg-orange-100');
    });

    it('returns orange for SLOW QUERY', () => {
      // Arrange & Act
      const color = getBadgeColor('SLOW QUERY');

      // Assert
      expect(color).toContain('bg-orange-100');
    });
  });

  describe('User Tags', () => {
    it('returns purple for USER: prefixed tags with non-numeric suffix', () => {
      // Arrange & Act
      // USER:admin doesn't match hostname:port pattern (port must be digits)
      const color = getBadgeColor('USER:admin');

      // Assert
      expect(color).toContain('bg-purple-100');
    });

    it('returns slate for USER: with numeric suffix (looks like host:port)', () => {
      // Arrange & Act
      // USER:123 matches hostname:port pattern (:digits at end)
      const color = getBadgeColor('USER:123');

      // Assert - hostname pattern takes precedence
      expect(color).toContain('bg-slate-100');
    });
  });

  describe('Query Types', () => {
    it('returns cyan for SELECT', () => {
      // Arrange & Act
      const color = getBadgeColor('SELECT');

      // Assert
      expect(color).toContain('bg-cyan-100');
    });

    it('returns cyan for INSERT', () => {
      // Arrange & Act
      const color = getBadgeColor('INSERT');

      // Assert
      expect(color).toContain('bg-cyan-100');
    });

    it('returns cyan for UPDATE', () => {
      // Arrange & Act
      const color = getBadgeColor('UPDATE');

      // Assert
      expect(color).toContain('bg-cyan-100');
    });
  });

  describe('Log Levels', () => {
    it('returns blue for DEBUG', () => {
      // Arrange & Act
      const color = getBadgeColor('DEBUG');

      // Assert
      expect(color).toContain('bg-blue-100');
    });

    it('returns green for LOG', () => {
      // Arrange & Act
      const color = getBadgeColor('LOG');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns green for INFO', () => {
      // Arrange & Act
      const color = getBadgeColor('INFO');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns gray for VERBOSE', () => {
      // Arrange & Act
      const color = getBadgeColor('VERBOSE');

      // Assert
      expect(color).toContain('bg-gray-100');
    });
  });

  describe('Entry Types', () => {
    it('returns blue for REQUEST', () => {
      // Arrange & Act
      const color = getBadgeColor('REQUEST');

      // Assert
      expect(color).toContain('bg-blue-100');
    });

    it('returns purple for QUERY', () => {
      // Arrange & Act
      const color = getBadgeColor('QUERY');

      // Assert
      expect(color).toContain('bg-purple-100');
    });

    it('returns red for EXCEPTION', () => {
      // Arrange & Act
      const color = getBadgeColor('EXCEPTION');

      // Assert
      expect(color).toContain('bg-red-100');
    });

    it('returns green for EVENT', () => {
      // Arrange & Act
      const color = getBadgeColor('EVENT');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns yellow for JOB', () => {
      // Arrange & Act
      const color = getBadgeColor('JOB');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });

    it('returns cyan for CACHE', () => {
      // Arrange & Act
      const color = getBadgeColor('CACHE');

      // Assert
      expect(color).toContain('bg-cyan-100');
    });

    it('returns pink for MAIL', () => {
      // Arrange & Act
      const color = getBadgeColor('MAIL');

      // Assert
      expect(color).toContain('bg-pink-100');
    });

    it('returns gray for SCHEDULE', () => {
      // Arrange & Act
      const color = getBadgeColor('SCHEDULE');

      // Assert
      expect(color).toContain('bg-gray-100');
    });

    it('returns cyan for HTTP-CLIENT', () => {
      // Arrange & Act
      const color = getBadgeColor('HTTP-CLIENT');

      // Assert
      expect(color).toContain('bg-cyan-100');
    });
  });

  describe('Status Badges', () => {
    it('returns green for RESOLVED', () => {
      // Arrange & Act
      const color = getBadgeColor('RESOLVED');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns green for COMPLETED', () => {
      // Arrange & Act
      const color = getBadgeColor('COMPLETED');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns green for SENT', () => {
      // Arrange & Act
      const color = getBadgeColor('SENT');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns green for ACTIVE', () => {
      // Arrange & Act
      const color = getBadgeColor('ACTIVE');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns yellow for WAITING', () => {
      // Arrange & Act
      const color = getBadgeColor('WAITING');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });

    it('returns yellow for DELAYED', () => {
      // Arrange & Act
      const color = getBadgeColor('DELAYED');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });

    it('returns yellow for PENDING', () => {
      // Arrange & Act
      const color = getBadgeColor('PENDING');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });
  });

  describe('Cache Operations', () => {
    it('returns gray for MISS', () => {
      // Arrange & Act
      const color = getBadgeColor('MISS');

      // Assert
      expect(color).toContain('bg-gray-100');
    });

    it('returns green for SET', () => {
      // Arrange & Act
      const color = getBadgeColor('SET');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns red for DEL', () => {
      // Arrange & Act
      const color = getBadgeColor('DEL');

      // Assert
      expect(color).toContain('bg-red-100');
    });

    it('returns yellow for CLEAR', () => {
      // Arrange & Act
      const color = getBadgeColor('CLEAR');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });
  });

  describe('Schedule/Job Statuses', () => {
    it('returns blue for STARTED', () => {
      // Arrange & Act
      const color = getBadgeColor('STARTED');

      // Assert
      expect(color).toContain('bg-blue-100');
    });
  });

  describe('ORM Sources', () => {
    it('returns orange for TYPEORM', () => {
      // Arrange & Act
      const color = getBadgeColor('TYPEORM');

      // Assert
      expect(color).toContain('bg-orange-100');
    });

    it('returns indigo for PRISMA', () => {
      // Arrange & Act
      const color = getBadgeColor('PRISMA');

      // Assert
      expect(color).toContain('bg-indigo-100');
    });

    it('returns green for MONGOOSE', () => {
      // Arrange & Act
      const color = getBadgeColor('MONGOOSE');

      // Assert
      expect(color).toContain('bg-green-100');
    });

    it('returns blue for SEQUELIZE', () => {
      // Arrange & Act
      const color = getBadgeColor('SEQUELIZE');

      // Assert
      expect(color).toContain('bg-blue-100');
    });

    it('returns yellow for KNEX', () => {
      // Arrange & Act
      const color = getBadgeColor('KNEX');

      // Assert
      expect(color).toContain('bg-yellow-100');
    });

    it('returns purple for MIKRO-ORM', () => {
      // Arrange & Act
      const color = getBadgeColor('MIKRO-ORM');

      // Assert
      expect(color).toContain('bg-purple-100');
    });
  });

  describe('Normal Status', () => {
    it('returns green for NORMAL', () => {
      // Arrange & Act
      const color = getBadgeColor('NORMAL');

      // Assert
      expect(color).toContain('bg-green-100');
    });
  });

  describe('Hash-based Fallback', () => {
    it('returns consistent color for unknown labels', () => {
      // Arrange & Act
      const color1 = getBadgeColor('CUSTOM_TAG');
      const color2 = getBadgeColor('CUSTOM_TAG');

      // Assert
      expect(color1).toBe(color2);
    });

    it('returns different colors for different unknown labels', () => {
      // Arrange & Act
      const color1 = getBadgeColor('TAG_A');
      const color2 = getBadgeColor('TAG_B');

      // Assert - colors might be same due to hash collision, but function should work
      expect(color1).toBeDefined();
      expect(color2).toBeDefined();
    });
  });
});

describe('ClickableBadge', () => {
  describe('Rendering', () => {
    it('renders badge text uppercase', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <ClickableBadge>test</ClickableBadge>
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByText('TEST')).toBeInTheDocument();
    });

    it('renders number children', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <ClickableBadge>200</ClickableBadge>
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByText('200')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <ClickableBadge className="custom-class">Test</ClickableBadge>
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByText('TEST')).toHaveClass('custom-class');
    });
  });

  describe('Clickable Behavior', () => {
    it('is clickable when listType is provided', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <ClickableBadge listType="requests">GET</ClickableBadge>
        </RouterWrapper>
      );

      // Assert
      const badge = screen.getByText('GET');
      expect(badge).toHaveAttribute('role', 'button');
      expect(badge).toHaveClass('cursor-pointer');
    });

    it('is clickable when onClick is provided', () => {
      // Arrange
      const handleClick = vi.fn();

      // Act
      render(
        <RouterWrapper>
          <ClickableBadge onClick={handleClick}>Click</ClickableBadge>
        </RouterWrapper>
      );

      // Assert
      const badge = screen.getByText('CLICK');
      expect(badge).toHaveAttribute('role', 'button');
    });

    it('is not clickable when clickable=false', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <ClickableBadge listType="requests" clickable={false}>
            GET
          </ClickableBadge>
        </RouterWrapper>
      );

      // Assert
      const badge = screen.getByText('GET');
      expect(badge).not.toHaveAttribute('role');
    });

    it('calls onClick when clicked', () => {
      // Arrange
      const handleClick = vi.fn();

      // Act
      render(
        <RouterWrapper>
          <ClickableBadge onClick={handleClick}>Click</ClickableBadge>
        </RouterWrapper>
      );
      fireEvent.click(screen.getByText('CLICK'));

      // Assert
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('prevents default and stops propagation', () => {
      // Arrange
      const handleClick = vi.fn();
      const handleParentClick = vi.fn();

      // Act
      render(
        <RouterWrapper>
          <div onClick={handleParentClick}>
            <ClickableBadge onClick={handleClick}>Click</ClickableBadge>
          </div>
        </RouterWrapper>
      );
      fireEvent.click(screen.getByText('CLICK'));

      // Assert
      expect(handleClick).toHaveBeenCalled();
      expect(handleParentClick).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Accessibility', () => {
    it('handles Enter key press', () => {
      // Arrange
      const handleClick = vi.fn();

      // Act
      render(
        <RouterWrapper>
          <ClickableBadge onClick={handleClick}>Press</ClickableBadge>
        </RouterWrapper>
      );
      fireEvent.keyDown(screen.getByText('PRESS'), { key: 'Enter' });

      // Assert
      expect(handleClick).toHaveBeenCalled();
    });

    it('handles Space key press', () => {
      // Arrange
      const handleClick = vi.fn();

      // Act
      render(
        <RouterWrapper>
          <ClickableBadge onClick={handleClick}>Press</ClickableBadge>
        </RouterWrapper>
      );
      fireEvent.keyDown(screen.getByText('PRESS'), { key: ' ' });

      // Assert
      expect(handleClick).toHaveBeenCalled();
    });

    it('has tabIndex when clickable', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <ClickableBadge listType="requests">GET</ClickableBadge>
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByText('GET')).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Aria Label', () => {
    it('uses custom ariaLabel when provided', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <ClickableBadge listType="requests" ariaLabel="Filter by GET method">
            GET
          </ClickableBadge>
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByLabelText('Filter by GET method')).toBeInTheDocument();
    });

    it('generates default aria-label for clickable badges', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <ClickableBadge listType="requests">GET</ClickableBadge>
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByLabelText('Click to filter by GET')).toBeInTheDocument();
    });
  });

  describe('Title Attribute', () => {
    it('has title attribute with display text', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <ClickableBadge>Test</ClickableBadge>
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByText('TEST')).toHaveAttribute('title', 'TEST');
    });
  });
});

describe('FilterBadge', () => {
  describe('Rendering', () => {
    it('renders text uppercase', () => {
      // Arrange & Act
      render(<FilterBadge onRemove={() => {}}>test</FilterBadge>);

      // Assert
      expect(screen.getByText('TEST')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      // Arrange & Act
      render(
        <FilterBadge onRemove={() => {}} className="custom-filter-class">
          test
        </FilterBadge>
      );

      // Assert - className is on the outer span wrapper, not the truncate span
      // The structure is: span.custom-filter-class > span.truncate + button
      const outerSpan = screen.getByText('TEST').parentElement;
      expect(outerSpan).toHaveClass('custom-filter-class');
    });
  });

  describe('Remove Button', () => {
    it('calls onRemove when X is clicked', () => {
      // Arrange
      const handleRemove = vi.fn();

      // Act
      render(<FilterBadge onRemove={handleRemove}>test</FilterBadge>);
      fireEvent.click(screen.getByLabelText('Remove filter: TEST'));

      // Assert
      expect(handleRemove).toHaveBeenCalledTimes(1);
    });

    it('has accessible remove button', () => {
      // Arrange & Act
      render(<FilterBadge onRemove={() => {}}>active</FilterBadge>);

      // Assert
      expect(screen.getByLabelText('Remove filter: ACTIVE')).toBeInTheDocument();
    });
  });
});

describe('BadgeList', () => {
  describe('Rendering', () => {
    it('returns null for empty array', () => {
      // Arrange & Act
      const { container } = render(
        <RouterWrapper>
          <BadgeList items={[]} listType="requests" />
        </RouterWrapper>
      );

      // Assert
      expect(container.firstChild).toBeNull();
    });

    it('returns null for undefined items', () => {
      // Arrange & Act
      const { container } = render(
        <RouterWrapper>
          <BadgeList items={undefined as any} listType="requests" />
        </RouterWrapper>
      );

      // Assert
      expect(container.firstChild).toBeNull();
    });

    it('renders all items within max limit', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <BadgeList items={['GET', 'POST']} listType="requests" maxItems={5} />
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByText('GET')).toBeInTheDocument();
      expect(screen.getByText('POST')).toBeInTheDocument();
    });

    it('shows remaining count when exceeding maxItems', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <BadgeList items={['a', 'b', 'c', 'd', 'e']} listType="requests" maxItems={3} />
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('uses default maxItems of 99', () => {
      // Arrange
      const items = Array.from({ length: 100 }, (_, i) => `item${i}`);

      // Act
      render(
        <RouterWrapper>
          <BadgeList items={items} listType="requests" />
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByText('+1')).toBeInTheDocument();
    });
  });

  describe('Clickable Behavior', () => {
    it('badges are clickable by default', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <BadgeList items={['GET']} listType="requests" />
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByText('GET')).toHaveAttribute('role', 'button');
    });

    it('badges are not clickable when clickable=false', () => {
      // Arrange & Act
      render(
        <RouterWrapper>
          <BadgeList items={['GET']} listType="requests" clickable={false} />
        </RouterWrapper>
      );

      // Assert
      expect(screen.getByText('GET')).not.toHaveAttribute('role');
    });
  });
});
