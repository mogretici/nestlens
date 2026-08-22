/**
 * PageHeader Component Tests
 *
 * Tests for the page header component with title, counts,
 * filters, and auto-refresh functionality.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Activity } from 'lucide-react';
import PageHeader, { FilterTabs, ToggleSwitch } from '../../components/PageHeader';

// ============================================================================
// PageHeader Tests
// ============================================================================

describe('PageHeader', () => {
  describe('Title and Icon', () => {
    it('renders title correctly', () => {
      render(<PageHeader title="Requests" icon={Activity} />);

      expect(screen.getByText('Requests')).toBeInTheDocument();
    });

    it('renders icon with custom color', () => {
      const { container } = render(
        <PageHeader
          title="Test"
          icon={Activity}
          iconColor="text-red-500"
        />
      );

      const iconWrapper = container.querySelector('.text-red-500');
      expect(iconWrapper).toBeInTheDocument();
    });
  });

  describe('Count Display', () => {
    it('shows count as badge', () => {
      render(<PageHeader title="Test" icon={Activity} count={42} />);

      expect(screen.getByRole('status')).toHaveTextContent('42');
    });

    it('shows totalCount when only totalCount provided', () => {
      render(<PageHeader title="Test" icon={Activity} totalCount={100} />);

      expect(screen.getByRole('status')).toHaveTextContent('100');
    });

    it('shows count / totalCount when both provided and different', () => {
      render(
        <PageHeader title="Test" icon={Activity} count={42} totalCount={100} />
      );

      expect(screen.getByRole('status')).toHaveTextContent('42');
      expect(screen.getByRole('status')).toHaveTextContent('/ 100');
    });

    it('does not show slash when count equals totalCount', () => {
      render(
        <PageHeader title="Test" icon={Activity} count={100} totalCount={100} />
      );

      expect(screen.getByRole('status')).toHaveTextContent('100');
      expect(screen.getByRole('status')).not.toHaveTextContent('/');
    });

    it('formats large numbers with locale', () => {
      render(<PageHeader title="Test" icon={Activity} count={1234567} />);

      // toLocaleString formats numbers
      expect(screen.getByRole('status')).toHaveTextContent('1,234,567');
    });

    it('shows subtitle when provided', () => {
      render(
        <PageHeader title="Test" icon={Activity} subtitle="Last 24 hours" />
      );

      expect(screen.getByText('Last 24 hours')).toBeInTheDocument();
    });
  });

  describe('Refresh Button', () => {
    it('renders refresh button when onRefresh provided', () => {
      render(
        <PageHeader title="Test" icon={Activity} onRefresh={() => {}} />
      );

      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });

    it('calls onRefresh when clicked', () => {
      const handleRefresh = vi.fn();

      render(
        <PageHeader title="Test" icon={Activity} onRefresh={handleRefresh} />
      );

      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
      expect(handleRefresh).toHaveBeenCalledTimes(1);
    });

    it('disables button when loading', () => {
      render(
        <PageHeader
          title="Test"
          icon={Activity}
          onRefresh={() => {}}
          loading={true}
        />
      );

      expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
    });

    it('disables button when refreshing', () => {
      render(
        <PageHeader
          title="Test"
          icon={Activity}
          onRefresh={() => {}}
          refreshing={true}
        />
      );

      expect(screen.getByRole('button', { name: /refreshing/i })).toBeDisabled();
    });

    it('has aria-busy when refreshing', () => {
      render(
        <PageHeader
          title="Test"
          icon={Activity}
          onRefresh={() => {}}
          refreshing={true}
        />
      );

      expect(screen.getByRole('button', { name: /refreshing/i })).toHaveAttribute(
        'aria-busy',
        'true'
      );
    });
  });

  describe('Auto-Refresh Toggle', () => {
    it('renders auto-refresh button when handler provided', () => {
      render(
        <PageHeader
          title="Test"
          icon={Activity}
          onAutoRefreshToggle={() => {}}
          autoRefreshEnabled={false}
        />
      );

      expect(screen.getByText('Auto Refresh')).toBeInTheDocument();
    });

    it('shows green pulse when enabled', () => {
      const { container } = render(
        <PageHeader
          title="Test"
          icon={Activity}
          onAutoRefreshToggle={() => {}}
          autoRefreshEnabled={true}
        />
      );

      const pulse = container.querySelector('.animate-pulse');
      expect(pulse).toBeInTheDocument();
      expect(pulse).toHaveClass('bg-green-500');
    });

    it('shows gray indicator when disabled', () => {
      const { container } = render(
        <PageHeader
          title="Test"
          icon={Activity}
          onAutoRefreshToggle={() => {}}
          autoRefreshEnabled={false}
        />
      );

      const indicator = container.querySelector('.bg-gray-400');
      expect(indicator).toBeInTheDocument();
    });

    it('calls onAutoRefreshToggle with opposite value', () => {
      const handleToggle = vi.fn();

      render(
        <PageHeader
          title="Test"
          icon={Activity}
          onAutoRefreshToggle={handleToggle}
          autoRefreshEnabled={false}
        />
      );

      fireEvent.click(screen.getByText('Auto Refresh'));
      expect(handleToggle).toHaveBeenCalledWith(true);
    });

    it('toggles from enabled to disabled', () => {
      const handleToggle = vi.fn();

      render(
        <PageHeader
          title="Test"
          icon={Activity}
          onAutoRefreshToggle={handleToggle}
          autoRefreshEnabled={true}
        />
      );

      fireEvent.click(screen.getByText('Auto Refresh'));
      expect(handleToggle).toHaveBeenCalledWith(false);
    });
  });

  describe('Filters', () => {
    const mockFilters = [
      { category: 'Method', value: 'GET', onRemove: vi.fn() },
      { category: 'Method', value: 'POST', onRemove: vi.fn() },
      { category: 'Status', value: '200', onRemove: vi.fn() },
    ];

    it('shows filters row when filters provided', () => {
      render(
        <PageHeader title="Test" icon={Activity} filters={mockFilters} />
      );

      expect(screen.getByText('Filters:')).toBeInTheDocument();
    });

    it('groups filters by category', () => {
      render(
        <PageHeader title="Test" icon={Activity} filters={mockFilters} />
      );

      // Method category should appear with both GET and POST
      expect(screen.getByText('Method:')).toBeInTheDocument();
      expect(screen.getByText('GET')).toBeInTheDocument();
      expect(screen.getByText('POST')).toBeInTheDocument();

      // Status category
      expect(screen.getByText('Status:')).toBeInTheDocument();
      expect(screen.getByText('200')).toBeInTheDocument();
    });

    it('calls onRemove when filter chip clicked', () => {
      const filters = [
        { category: 'Method', value: 'GET', onRemove: vi.fn() },
      ];

      render(<PageHeader title="Test" icon={Activity} filters={filters} />);

      fireEvent.click(screen.getByLabelText('Remove Method filter: GET'));
      expect(filters[0].onRemove).toHaveBeenCalledTimes(1);
    });

    it('shows Clear all button when multiple filters', () => {
      const handleClearAll = vi.fn();

      render(
        <PageHeader
          title="Test"
          icon={Activity}
          filters={mockFilters}
          onClearAllFilters={handleClearAll}
        />
      );

      expect(screen.getByText('Clear all')).toBeInTheDocument();
    });

    it('hides Clear all button when only one filter', () => {
      const handleClearAll = vi.fn();
      const singleFilter = [
        { category: 'Method', value: 'GET', onRemove: vi.fn() },
      ];

      render(
        <PageHeader
          title="Test"
          icon={Activity}
          filters={singleFilter}
          onClearAllFilters={handleClearAll}
        />
      );

      expect(screen.queryByText('Clear all')).not.toBeInTheDocument();
    });

    it('calls onClearAllFilters when Clear all clicked', () => {
      const handleClearAll = vi.fn();

      render(
        <PageHeader
          title="Test"
          icon={Activity}
          filters={mockFilters}
          onClearAllFilters={handleClearAll}
        />
      );

      fireEvent.click(screen.getByText('Clear all'));
      expect(handleClearAll).toHaveBeenCalledTimes(1);
    });

    it('does not show filters row when no filters', () => {
      render(<PageHeader title="Test" icon={Activity} filters={[]} />);

      expect(screen.queryByText('Filters:')).not.toBeInTheDocument();
    });
  });

  describe('Custom Actions', () => {
    it('renders custom actions slot', () => {
      render(
        <PageHeader
          title="Test"
          icon={Activity}
          actions={<button data-testid="custom-action">Custom</button>}
        />
      );

      expect(screen.getByTestId('custom-action')).toBeInTheDocument();
    });
  });

  describe('Filter Controls', () => {
    it('renders filter controls slot', () => {
      render(
        <PageHeader
          title="Test"
          icon={Activity}
          filterControls={<div data-testid="filter-controls">Controls</div>}
        />
      );

      expect(screen.getByTestId('filter-controls')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// FilterTabs Tests
// ============================================================================

describe('FilterTabs', () => {
  const mockTabs = [
    { id: 'all', label: 'All', count: 100 },
    { id: 'active', label: 'Active', count: 50 },
    { id: 'completed', label: 'Completed', count: 50 },
  ];

  it('renders all tabs', () => {
    render(
      <FilterTabs tabs={mockTabs} activeTab="all" onChange={() => {}} />
    );

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('shows count for each tab', () => {
    render(
      <FilterTabs tabs={mockTabs} activeTab="all" onChange={() => {}} />
    );

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getAllByText('50').length).toBe(2);
  });

  it('highlights active tab', () => {
    render(
      <FilterTabs tabs={mockTabs} activeTab="active" onChange={() => {}} />
    );

    const activeButton = screen.getByText('Active').closest('button');
    expect(activeButton?.className).toContain('bg-primary-100');
  });

  it('calls onChange when tab clicked', () => {
    const handleChange = vi.fn();

    render(
      <FilterTabs tabs={mockTabs} activeTab="all" onChange={handleChange} />
    );

    fireEvent.click(screen.getByText('Completed'));
    expect(handleChange).toHaveBeenCalledWith('completed');
  });

  it('handles tabs without count', () => {
    const tabsWithoutCount = [
      { id: 'all', label: 'All' },
      { id: 'active', label: 'Active' },
    ];

    render(
      <FilterTabs tabs={tabsWithoutCount} activeTab="all" onChange={() => {}} />
    );

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});

// ============================================================================
// ToggleSwitch Tests
// ============================================================================

describe('ToggleSwitch', () => {
  it('renders label', () => {
    render(
      <ToggleSwitch label="Show Errors" enabled={false} onChange={() => {}} />
    );

    expect(screen.getByText('Show Errors')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    const { container } = render(
      <ToggleSwitch
        label="Show Errors"
        enabled={false}
        onChange={() => {}}
        icon={Activity}
      />
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies enabled styles when enabled', () => {
    render(
      <ToggleSwitch label="Show Errors" enabled={true} onChange={() => {}} />
    );

    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-primary-100');
  });

  it('applies disabled styles when disabled', () => {
    render(
      <ToggleSwitch label="Show Errors" enabled={false} onChange={() => {}} />
    );

    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-gray-100');
  });

  it('calls onChange with opposite value', () => {
    const handleChange = vi.fn();

    render(
      <ToggleSwitch label="Show Errors" enabled={false} onChange={handleChange} />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('toggles from enabled to disabled', () => {
    const handleChange = vi.fn();

    render(
      <ToggleSwitch label="Show Errors" enabled={true} onChange={handleChange} />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleChange).toHaveBeenCalledWith(false);
  });
});

/**
 * The header floats, so the page under it needs exactly that much room.
 *
 * Every page used to carry its own pair of padding constants for this —
 * nineteen copies of a number nobody could keep in step with a header that
 * grows a row when filters appear and another when a page adds controls.
 */
describe('PageHeader — room for the header', () => {
  /** Swapped by assignment: the setup file defines it non-configurable. */
  const withResizeObserver = <T,>(value: unknown, work: () => T): T => {
    const saved = window.ResizeObserver;
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = value;
    try {
      return work();
    } finally {
      window.ResizeObserver = saved;
    }
  };

  it('reserves space below the bar', () => {
    render(<PageHeader title="Requests" icon={Activity} />);

    expect(screen.getByTestId('page-header-spacer')).toBeInTheDocument();
  });

  it('keeps the spacer out of the accessibility tree', () => {
    render(<PageHeader title="Requests" icon={Activity} />);

    expect(screen.getByTestId('page-header-spacer')).toHaveAttribute('aria-hidden', 'true');
  });

  it('follows the bar as it grows', () => {
    // jsdom lays nothing out, so the height comes from a stubbed measurement:
    // what is checked here is that the spacer takes whatever the bar reports.
    const observed: Element[] = [];
    class StubResizeObserver {
      constructor(private readonly callback: () => void) {}
      observe(target: Element) {
        observed.push(target);
        this.callback();
      }
      disconnect() {}
      unobserve() {}
    }

    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ height: 137 } as DOMRect);

    try {
      withResizeObserver(StubResizeObserver, () => {
        render(<PageHeader title="Requests" icon={Activity} />);
      });

      expect(screen.getByTestId('page-header-spacer')).toHaveStyle({ height: '137px' });
      expect(observed).toHaveLength(1);
    } finally {
      rect.mockRestore();
    }
  });

  it('renders without a ResizeObserver', () => {
    // Absent in jsdom by default, and an older browser is the same case.
    withResizeObserver(undefined, () => {
      render(<PageHeader title="Requests" icon={Activity} />);
    });

    expect(screen.getByText('Requests')).toBeInTheDocument();
  });
});
