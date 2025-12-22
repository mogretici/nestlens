/**
 * DataTable Component Tests
 *
 * Tests for the generic data table with keyboard navigation,
 * loading states, and various cell components.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DataTable, {
  TextCell,
  NumberCell,
  StatusBadge,
  TagsList,
  DurationCell,
  Column,
} from '../../components/DataTable';

// ============================================================================
// Test Data
// ============================================================================

interface TestRow {
  id: number;
  name: string;
  status: string;
}

const testData: TestRow[] = [
  { id: 1, name: 'Item 1', status: 'active' },
  { id: 2, name: 'Item 2', status: 'pending' },
  { id: 3, name: 'Item 3', status: 'completed' },
];

const testColumns: Column<TestRow>[] = [
  { key: 'id', header: 'ID', render: (row) => <span>{row.id}</span> },
  { key: 'name', header: 'Name', render: (row) => <span>{row.name}</span> },
  { key: 'status', header: 'Status', render: (row) => <span>{row.status}</span> },
];

// ============================================================================
// DataTable Tests
// ============================================================================

describe('DataTable', () => {
  describe('Rendering', () => {
    it('renders columns and rows correctly', () => {
      render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
        />
      );

      // Headers
      expect(screen.getByText('ID')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();

      // Data
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('Item 3')).toBeInTheDocument();
    });

    it('shows loading skeleton when loading=true', () => {
      render(
        <DataTable
          columns={testColumns}
          data={[]}
          keyExtractor={(row) => row.id}
          loading={true}
        />
      );

      // Should show skeleton rows with animate-pulse class
      const skeletonRows = document.querySelectorAll('tr.animate-pulse');
      expect(skeletonRows.length).toBeGreaterThan(0);
    });

    it('shows empty state with custom message', () => {
      render(
        <DataTable
          columns={testColumns}
          data={[]}
          keyExtractor={(row) => row.id}
          emptyMessage="No items found"
        />
      );

      expect(screen.getByText('No items found')).toBeInTheDocument();
    });

    it('shows empty state with custom icon', () => {
      const CustomIcon = () => <span data-testid="custom-icon">Custom</span>;

      render(
        <DataTable
          columns={testColumns}
          data={[]}
          keyExtractor={(row) => row.id}
          emptyIcon={<CustomIcon />}
        />
      );

      expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    });

    it('applies zebra stripes when enabled', () => {
      const { container } = render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
          zebraStripes={true}
        />
      );

      const rows = container.querySelectorAll('tbody tr');
      // Even rows (index 1, 3, ...) should have different background
      expect(rows[1].className).toContain('bg-gray-50/50');
    });

    it('shows chevron for clickable rows', () => {
      const { container } = render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
          showChevron={true}
        />
      );

      // Should have ChevronRight icons
      const chevrons = container.querySelectorAll('svg');
      expect(chevrons.length).toBeGreaterThan(0);
    });

    it('hides chevron when showChevron=false', () => {
      const { container } = render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
          showChevron={false}
        />
      );

      // Should not have extra column for chevron
      const headerCells = container.querySelectorAll('thead th');
      expect(headerCells.length).toBe(testColumns.length);
    });
  });

  describe('Row Click', () => {
    it('calls onRowClick when row is clicked', () => {
      const handleClick = vi.fn();

      render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
          onRowClick={handleClick}
        />
      );

      const row = screen.getByText('Item 1').closest('tr');
      fireEvent.click(row!);

      expect(handleClick).toHaveBeenCalledWith(testData[0]);
    });

    it('makes rows focusable when onRowClick is provided', () => {
      render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
        />
      );

      const row = screen.getByText('Item 1').closest('tr');
      expect(row).toHaveAttribute('tabindex', '0');
    });
  });

  describe('Keyboard Navigation', () => {
    it('Enter triggers onRowClick', () => {
      const handleClick = vi.fn();

      render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
          onRowClick={handleClick}
        />
      );

      const row = screen.getByText('Item 1').closest('tr');
      fireEvent.keyDown(row!, { key: 'Enter' });

      expect(handleClick).toHaveBeenCalledWith(testData[0]);
    });

    it('Space triggers onRowClick', () => {
      const handleClick = vi.fn();

      render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
          onRowClick={handleClick}
        />
      );

      const row = screen.getByText('Item 1').closest('tr');
      fireEvent.keyDown(row!, { key: ' ' });

      expect(handleClick).toHaveBeenCalledWith(testData[0]);
    });
  });

  describe('Accessibility', () => {
    it('has correct ARIA role=grid', () => {
      render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
        />
      );

      expect(screen.getByRole('grid')).toBeInTheDocument();
    });

    it('has aria-rowcount', () => {
      render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
        />
      );

      const grid = screen.getByRole('grid');
      expect(grid).toHaveAttribute('aria-rowcount', String(testData.length));
    });

    it('has aria-colcount', () => {
      render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
        />
      );

      const grid = screen.getByRole('grid');
      expect(grid).toHaveAttribute('aria-colcount', String(testColumns.length));
    });

    it('rows have aria-rowindex', () => {
      const { container } = render(
        <DataTable
          columns={testColumns}
          data={testData}
          keyExtractor={(row) => row.id}
        />
      );

      const rows = container.querySelectorAll('tbody tr[aria-rowindex]');
      expect(rows.length).toBe(testData.length);
      expect(rows[0]).toHaveAttribute('aria-rowindex', '1');
    });
  });

  describe('Column Alignment', () => {
    it('applies text-right for right-aligned columns', () => {
      const columnsWithAlign: Column<TestRow>[] = [
        { key: 'id', header: 'ID', align: 'right', render: (row) => <span>{row.id}</span> },
      ];

      const { container } = render(
        <DataTable
          columns={columnsWithAlign}
          data={testData}
          keyExtractor={(row) => row.id}
        />
      );

      const cell = container.querySelector('tbody td');
      expect(cell?.className).toContain('text-right');
    });

    it('applies text-center for center-aligned columns', () => {
      const columnsWithAlign: Column<TestRow>[] = [
        { key: 'id', header: 'ID', align: 'center', render: (row) => <span>{row.id}</span> },
      ];

      const { container } = render(
        <DataTable
          columns={columnsWithAlign}
          data={testData}
          keyExtractor={(row) => row.id}
        />
      );

      const cell = container.querySelector('tbody td');
      expect(cell?.className).toContain('text-center');
    });
  });
});

// ============================================================================
// TextCell Tests
// ============================================================================

describe('TextCell', () => {
  it('renders children correctly', () => {
    render(<TextCell>Test content</TextCell>);
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('applies mono font when mono=true', () => {
    render(<TextCell mono>Mono text</TextCell>);
    const cell = screen.getByText('Mono text');
    expect(cell.className).toContain('font-mono');
  });

  it('applies truncate class when truncate=true', () => {
    render(<TextCell truncate>Long text</TextCell>);
    const cell = screen.getByText('Long text');
    expect(cell.className).toContain('truncate');
  });

  it('applies secondary styling when secondary=true', () => {
    render(<TextCell secondary>Secondary text</TextCell>);
    const cell = screen.getByText('Secondary text');
    expect(cell.className).toContain('text-gray-500');
  });

  it('applies custom className', () => {
    render(<TextCell className="custom-class">Text</TextCell>);
    const cell = screen.getByText('Text');
    expect(cell.className).toContain('custom-class');
  });
});

// ============================================================================
// NumberCell Tests
// ============================================================================

describe('NumberCell', () => {
  it('renders number value', () => {
    render(<NumberCell value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders with prefix', () => {
    render(<NumberCell value={100} prefix="$" />);
    expect(screen.getByText('$100')).toBeInTheDocument();
  });

  it('renders with suffix', () => {
    render(<NumberCell value={50} suffix="%" />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('applies success highlight', () => {
    render(<NumberCell value={100} highlight="success" />);
    const cell = screen.getByText('100');
    expect(cell.className).toContain('text-green-600');
  });

  it('applies error highlight', () => {
    render(<NumberCell value={100} highlight="error" />);
    const cell = screen.getByText('100');
    expect(cell.className).toContain('text-red-600');
  });

  it('applies warning highlight', () => {
    render(<NumberCell value={100} highlight="warning" />);
    const cell = screen.getByText('100');
    expect(cell.className).toContain('text-yellow-600');
  });
});

// ============================================================================
// StatusBadge Tests
// ============================================================================

describe('StatusBadge', () => {
  it('renders status text', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('applies success variant', () => {
    render(<StatusBadge status="success" variant="success" />);
    const badge = screen.getByText('success');
    expect(badge.className).toContain('bg-green-100');
  });

  it('applies error variant', () => {
    render(<StatusBadge status="error" variant="error" />);
    const badge = screen.getByText('error');
    expect(badge.className).toContain('bg-red-100');
  });

  it('applies warning variant', () => {
    render(<StatusBadge status="warning" variant="warning" />);
    const badge = screen.getByText('warning');
    expect(badge.className).toContain('bg-yellow-100');
  });

  it('applies small size by default', () => {
    render(<StatusBadge status="test" />);
    const badge = screen.getByText('test');
    expect(badge.className).toContain('text-xs');
  });

  it('applies medium size when specified', () => {
    render(<StatusBadge status="test" size="md" />);
    const badge = screen.getByText('test');
    expect(badge.className).toContain('text-sm');
  });
});

// ============================================================================
// TagsList Tests
// ============================================================================

describe('TagsList', () => {
  it('renders empty state with dash', () => {
    render(<TagsList tags={[]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<TagsList tags={['tag1', 'tag2']} />);
    expect(screen.getByText('TAG1')).toBeInTheDocument();
    expect(screen.getByText('TAG2')).toBeInTheDocument();
  });

  it('limits visible tags with max prop', () => {
    render(<TagsList tags={['tag1', 'tag2', 'tag3', 'tag4']} max={2} />);
    expect(screen.getByText('TAG1')).toBeInTheDocument();
    expect(screen.getByText('TAG2')).toBeInTheDocument();
    expect(screen.queryByText('TAG3')).not.toBeInTheDocument();
  });

  it('shows remaining count when exceeding max', () => {
    render(<TagsList tags={['tag1', 'tag2', 'tag3', 'tag4']} max={2} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('calls onTagClick when tag is clicked', () => {
    const handleClick = vi.fn();
    render(<TagsList tags={['tag1']} onTagClick={handleClick} />);

    fireEvent.click(screen.getByText('TAG1'));
    expect(handleClick).toHaveBeenCalledWith('tag1', expect.any(Object));
  });
});

// ============================================================================
// DurationCell Tests
// ============================================================================

describe('DurationCell', () => {
  it('formats milliseconds', () => {
    render(<DurationCell ms={500} />);
    expect(screen.getByText('500ms')).toBeInTheDocument();
  });

  it('formats seconds', () => {
    render(<DurationCell ms={1500} />);
    expect(screen.getByText('1.50s')).toBeInTheDocument();
  });

  it('applies normal color for fast durations', () => {
    render(<DurationCell ms={100} />);
    const cell = screen.getByText('100ms');
    expect(cell.className).toContain('text-gray-600');
  });

  it('applies warning color for slow durations', () => {
    render(<DurationCell ms={1500} slowThreshold={1000} />);
    const cell = screen.getByText('1.50s');
    expect(cell.className).toContain('text-yellow-600');
  });

  it('applies error color for very slow durations', () => {
    render(<DurationCell ms={6000} verySlowThreshold={5000} />);
    const cell = screen.getByText('6.00s');
    expect(cell.className).toContain('text-red-600');
  });

  it('uses custom thresholds', () => {
    render(<DurationCell ms={500} slowThreshold={400} verySlowThreshold={600} />);
    const cell = screen.getByText('500ms');
    expect(cell.className).toContain('text-yellow-600');
  });
});

// ============================================================================
// Focus Handling and Advanced Keyboard Navigation
// ============================================================================

describe('DataTable Focus Handling', () => {
  const focusTestData = [
    { id: 1, name: 'First' },
    { id: 2, name: 'Second' },
    { id: 3, name: 'Third' },
    { id: 4, name: 'Fourth' },
    { id: 5, name: 'Fifth' },
  ];

  const focusColumns: Column<{ id: number; name: string }>[] = [
    { key: 'id', header: 'ID', render: (row) => <span>{row.id}</span> },
    { key: 'name', header: 'Name', render: (row) => <span>{row.name}</span> },
  ];

  describe('Arrow Key Navigation', () => {
    it('ArrowDown moves focus to next row', () => {
      const { container } = render(
        <DataTable
          columns={focusColumns}
          data={focusTestData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
        />
      );

      const rows = container.querySelectorAll('tbody tr');
      const firstRow = rows[0] as HTMLElement;

      // Focus first row
      firstRow.focus();

      // Press ArrowDown
      fireEvent.keyDown(firstRow, { key: 'ArrowDown' });

      // Second row should be focused
      expect(document.activeElement).toBe(rows[1]);
    });

    it('ArrowUp moves focus to previous row', () => {
      const { container } = render(
        <DataTable
          columns={focusColumns}
          data={focusTestData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
        />
      );

      const rows = container.querySelectorAll('tbody tr');
      const secondRow = rows[1] as HTMLElement;

      // Focus second row
      secondRow.focus();

      // Press ArrowUp
      fireEvent.keyDown(secondRow, { key: 'ArrowUp' });

      // First row should be focused
      expect(document.activeElement).toBe(rows[0]);
    });

    it('ArrowDown at last row stays at last row', () => {
      const { container } = render(
        <DataTable
          columns={focusColumns}
          data={focusTestData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
        />
      );

      const rows = container.querySelectorAll('tbody tr');
      const lastRow = rows[rows.length - 1] as HTMLElement;

      // Focus last row
      lastRow.focus();

      // Press ArrowDown
      fireEvent.keyDown(lastRow, { key: 'ArrowDown' });

      // Still on last row
      expect(document.activeElement).toBe(lastRow);
    });

    it('ArrowUp at first row stays at first row', () => {
      const { container } = render(
        <DataTable
          columns={focusColumns}
          data={focusTestData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
        />
      );

      const rows = container.querySelectorAll('tbody tr');
      const firstRow = rows[0] as HTMLElement;

      // Focus first row
      firstRow.focus();

      // Press ArrowUp
      fireEvent.keyDown(firstRow, { key: 'ArrowUp' });

      // Still on first row
      expect(document.activeElement).toBe(firstRow);
    });
  });

  describe('Home and End Keys', () => {
    it('Home moves focus to first row', () => {
      const { container } = render(
        <DataTable
          columns={focusColumns}
          data={focusTestData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
        />
      );

      const rows = container.querySelectorAll('tbody tr');
      const thirdRow = rows[2] as HTMLElement;

      // Focus third row
      thirdRow.focus();

      // Press Home
      fireEvent.keyDown(thirdRow, { key: 'Home' });

      // First row should be focused
      expect(document.activeElement).toBe(rows[0]);
    });

    it('End moves focus to last row', () => {
      const { container } = render(
        <DataTable
          columns={focusColumns}
          data={focusTestData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
        />
      );

      const rows = container.querySelectorAll('tbody tr');
      const firstRow = rows[0] as HTMLElement;

      // Focus first row
      firstRow.focus();

      // Press End
      fireEvent.keyDown(firstRow, { key: 'End' });

      // Last row should be focused
      expect(document.activeElement).toBe(rows[rows.length - 1]);
    });
  });

  describe('Focus State Visual', () => {
    it('focused row has focus ring', () => {
      const { container } = render(
        <DataTable
          columns={focusColumns}
          data={focusTestData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
        />
      );

      const row = container.querySelector('tbody tr') as HTMLElement;
      // Row should have focus ring class
      expect(row.className).toContain('focus:ring');
    });

    it('clickable rows have cursor-pointer', () => {
      const { container } = render(
        <DataTable
          columns={focusColumns}
          data={focusTestData}
          keyExtractor={(row) => row.id}
          onRowClick={() => {}}
        />
      );

      const row = container.querySelector('tbody tr');
      expect(row?.className).toContain('cursor-pointer');
    });

    it('non-clickable rows do not have cursor-pointer', () => {
      const { container } = render(
        <DataTable
          columns={focusColumns}
          data={focusTestData}
          keyExtractor={(row) => row.id}
        />
      );

      const row = container.querySelector('tbody tr');
      expect(row?.className).not.toContain('cursor-pointer');
    });
  });

  describe('Loading State Focus', () => {
    it('skeleton rows are not focusable', () => {
      const { container } = render(
        <DataTable
          columns={focusColumns}
          data={[]}
          keyExtractor={(row) => row.id}
          loading={true}
          onRowClick={() => {}}
        />
      );

      const skeletonRows = container.querySelectorAll('tbody tr');
      skeletonRows.forEach((row) => {
        expect(row).not.toHaveAttribute('tabindex');
      });
    });
  });

  describe('Empty State', () => {
    it('shows default empty message when no custom message provided', () => {
      render(
        <DataTable
          columns={focusColumns}
          data={[]}
          keyExtractor={(row) => row.id}
        />
      );

      // Default message should be shown
      expect(screen.getByText(/no data/i)).toBeInTheDocument();
    });
  });
});

// ============================================================================
// Additional Edge Cases
// ============================================================================

describe('DataTable Edge Cases', () => {
  it('handles single row table', () => {
    const singleRow = [{ id: 1, name: 'Only' }];
    const columns: Column<{ id: number; name: string }>[] = [
      { key: 'name', header: 'Name', render: (row) => <span>{row.name}</span> },
    ];

    render(
      <DataTable
        columns={columns}
        data={singleRow}
        keyExtractor={(row) => row.id}
        onRowClick={() => {}}
      />
    );

    expect(screen.getByText('Only')).toBeInTheDocument();
  });

  it('renders with width property on column', () => {
    const columns: Column<{ id: number }>[] = [
      {
        key: 'id',
        header: 'ID',
        width: '100px',
        render: (row) => <span>{row.id}</span>,
      },
    ];

    const { container } = render(
      <DataTable
        columns={columns}
        data={[{ id: 1 }]}
        keyExtractor={(row) => row.id}
      />
    );

    const headerCell = container.querySelector('thead th');
    expect(headerCell).toHaveStyle({ width: '100px' });
  });

  it('renders multiple column widths correctly', () => {
    const columns: Column<{ id: number; name: string }>[] = [
      { key: 'id', header: 'ID', width: '80px', render: (row) => <span>{row.id}</span> },
      { key: 'name', header: 'Name', width: '200px', render: (row) => <span>{row.name}</span> },
    ];

    const { container } = render(
      <DataTable
        columns={columns}
        data={[{ id: 1, name: 'Test' }]}
        keyExtractor={(row) => row.id}
      />
    );

    const headerCells = container.querySelectorAll('thead th');
    expect(headerCells[0]).toHaveStyle({ width: '80px' });
    expect(headerCells[1]).toHaveStyle({ width: '200px' });
  });

  it('handles undefined values gracefully', () => {
    const columns: Column<{ id: number; name?: string }>[] = [
      { key: 'name', header: 'Name', render: (row) => <span>{row.name || '-'}</span> },
    ];

    render(
      <DataTable
        columns={columns}
        data={[{ id: 1 }]}
        keyExtractor={(row) => row.id}
      />
    );

    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
