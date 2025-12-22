/**
 * JsonViewer Component Tests
 *
 * Tests for the JSON viewer with expansion, search,
 * and value type detection features.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JsonViewer, { InlineJson } from '../../components/JsonViewer';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, { clipboard: mockClipboard });

// ============================================================================
// JsonViewer Tests
// ============================================================================

describe('JsonViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering Primitives', () => {
    it('renders null value', () => {
      render(<JsonViewer data={null} />);
      expect(screen.getByText('null')).toBeInTheDocument();
    });

    it('renders boolean true', () => {
      render(<JsonViewer data={true} />);
      expect(screen.getByText('true')).toBeInTheDocument();
    });

    it('renders boolean false', () => {
      render(<JsonViewer data={false} />);
      expect(screen.getByText('false')).toBeInTheDocument();
    });

    it('renders number', () => {
      render(<JsonViewer data={42} />);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders string with quotes', () => {
      render(<JsonViewer data="hello world" />);
      expect(screen.getByText(/"hello world"/)).toBeInTheDocument();
    });
  });

  describe('Rendering Objects', () => {
    it('renders object with keys', () => {
      render(<JsonViewer data={{ name: 'John', age: 30 }} />);

      expect(screen.getByText('"name"')).toBeInTheDocument();
      expect(screen.getByText(/"John"/)).toBeInTheDocument();
      expect(screen.getByText('"age"')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
    });

    it('renders nested objects', () => {
      render(
        <JsonViewer
          data={{ user: { name: 'John', address: { city: 'NYC' } } }}
          maxInitialDepth={3}
        />
      );

      expect(screen.getByText('"user"')).toBeInTheDocument();
      expect(screen.getByText('"name"')).toBeInTheDocument();
      expect(screen.getByText('"address"')).toBeInTheDocument();
      expect(screen.getByText('"city"')).toBeInTheDocument();
    });

    it('shows key count for collapsed objects', () => {
      render(<JsonViewer data={{ a: 1, b: 2, c: 3 }} initialExpanded={false} />);

      // Multiple elements may exist (header + inline)
      const keyCountElements = screen.getAllByText('3 keys');
      expect(keyCountElements.length).toBeGreaterThan(0);
    });
  });

  describe('Rendering Arrays', () => {
    it('renders array items', () => {
      render(<JsonViewer data={['apple', 'banana', 'cherry']} />);

      expect(screen.getByText(/"apple"/)).toBeInTheDocument();
      expect(screen.getByText(/"banana"/)).toBeInTheDocument();
      expect(screen.getByText(/"cherry"/)).toBeInTheDocument();
    });

    it('shows item count for collapsed arrays', () => {
      render(
        <JsonViewer data={[1, 2, 3, 4, 5]} initialExpanded={false} />
      );

      // Multiple elements may exist (header + inline)
      const itemCountElements = screen.getAllByText('5 items');
      expect(itemCountElements.length).toBeGreaterThan(0);
    });

    it('renders array indices', () => {
      render(<JsonViewer data={['first', 'second']} />);

      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('Expansion/Collapse', () => {
    it('expands node on click', () => {
      render(
        <JsonViewer
          data={{ user: { name: 'John' } }}
          initialExpanded={true}
          maxInitialDepth={1}
        />
      );

      // "user" is expanded but its children are collapsed
      expect(screen.getByText('"user"')).toBeInTheDocument();
      expect(screen.queryByText('"name"')).not.toBeInTheDocument();

      // Click to expand nested object
      fireEvent.click(screen.getByText('"user"').closest('div')!);

      // Now should see nested content
      expect(screen.getByText('"name"')).toBeInTheDocument();
    });

    it('collapses node on click', () => {
      render(<JsonViewer data={{ user: { name: 'John' } }} />);

      // Initially expanded
      expect(screen.getByText('"name"')).toBeInTheDocument();

      // Click to collapse
      fireEvent.click(screen.getByText('"user"').closest('div')!);

      // Should see collapsed indicator - multiple elements may exist
      const keyCountElements = screen.getAllByText('1 keys');
      expect(keyCountElements.length).toBeGreaterThan(0);
    });

    it('expands all on Expand All click', () => {
      render(
        <JsonViewer
          data={{
            level1: { level2: { level3: 'deep' } },
          }}
          initialExpanded={false}
        />
      );

      // Click Expand All
      fireEvent.click(screen.getByTitle('Expand all'));

      // All levels should be visible
      expect(screen.getByText('"level1"')).toBeInTheDocument();
      expect(screen.getByText('"level2"')).toBeInTheDocument();
      expect(screen.getByText('"level3"')).toBeInTheDocument();
      expect(screen.getByText(/"deep"/)).toBeInTheDocument();
    });

    it('collapses all on Collapse All click', () => {
      render(
        <JsonViewer
          data={{
            level1: { level2: { level3: 'deep' } },
          }}
          maxInitialDepth={5}
        />
      );

      // All visible initially
      expect(screen.getByText(/"deep"/)).toBeInTheDocument();

      // Click Collapse All
      fireEvent.click(screen.getByTitle('Collapse all'));

      // Root should be collapsed
      expect(screen.queryByText('"level1"')).not.toBeInTheDocument();
    });

    it('respects maxInitialDepth', () => {
      render(
        <JsonViewer
          data={{
            a: { b: { c: { d: 'deep' } } },
          }}
          maxInitialDepth={2}
        />
      );

      // Depth 1 and 2 visible
      expect(screen.getByText('"a"')).toBeInTheDocument();
      expect(screen.getByText('"b"')).toBeInTheDocument();

      // Depth 3+ collapsed - multiple elements may exist
      expect(screen.queryByText('"c"')).not.toBeInTheDocument();
      const keyCountElements = screen.getAllByText('1 keys');
      expect(keyCountElements.length).toBeGreaterThan(0);
    });
  });

  describe('Search', () => {
    it('shows search button when searchable', () => {
      render(<JsonViewer data={{ name: 'John' }} searchable={true} />);

      expect(screen.getByTitle(/search/i)).toBeInTheDocument();
    });

    it('hides search button when searchable=false', () => {
      render(<JsonViewer data={{ name: 'John' }} searchable={false} />);

      expect(screen.queryByTitle(/search/i)).not.toBeInTheDocument();
    });

    it('opens search input on search button click', () => {
      render(<JsonViewer data={{ name: 'John' }} searchable={true} />);

      fireEvent.click(screen.getByTitle(/search/i));

      expect(
        screen.getByPlaceholderText('Search keys and values...')
      ).toBeInTheDocument();
    });

    it('filters and highlights matching keys', async () => {
      const { container } = render(
        <JsonViewer
          data={{ firstName: 'John', lastName: 'Doe', age: 30 }}
          searchable={true}
        />
      );

      fireEvent.click(screen.getByTitle(/search/i));
      fireEvent.change(
        screen.getByPlaceholderText('Search keys and values...'),
        { target: { value: 'Name' } }
      );

      // Wait for search to apply
      await waitFor(() => {
        // Keys containing "Name" should be highlighted
        const highlighted = container.querySelectorAll('.bg-yellow-400\\/30');
        expect(highlighted.length).toBeGreaterThan(0);
      });
    });

    it('filters and highlights matching values', async () => {
      const { container } = render(
        <JsonViewer
          data={{ name: 'John', city: 'Boston' }}
          searchable={true}
        />
      );

      fireEvent.click(screen.getByTitle(/search/i));
      fireEvent.change(
        screen.getByPlaceholderText('Search keys and values...'),
        { target: { value: 'John' } }
      );

      await waitFor(() => {
        const highlighted = container.querySelectorAll('.bg-yellow-400\\/30');
        expect(highlighted.length).toBeGreaterThan(0);
      });
    });

    it('clears search on toggle', () => {
      render(
        <JsonViewer data={{ name: 'John' }} searchable={true} />
      );

      // Open search and type
      const searchButton = screen.getByTitle(/search/i);
      fireEvent.click(searchButton);
      const input = screen.getByPlaceholderText('Search keys and values...');
      fireEvent.change(input, { target: { value: 'test' } });

      expect(input).toHaveValue('test');

      // Toggle search off clears the input
      fireEvent.click(searchButton);
      // Search input should be hidden now
      expect(screen.queryByPlaceholderText('Search keys and values...')).not.toBeInTheDocument();
    });

    it('supports external search term', () => {
      const { container } = render(
        <JsonViewer
          data={{ name: 'John', age: 30 }}
          externalSearchTerm="John"
        />
      );

      // Should highlight without opening search
      const highlighted = container.querySelectorAll('.bg-yellow-400\\/30');
      expect(highlighted.length).toBeGreaterThan(0);
    });
  });

  describe('Value Detection', () => {
    it('detects and hints URLs', () => {
      render(<JsonViewer data={{ url: 'https://example.com' }} />);

      expect(screen.getByText('(URL)')).toBeInTheDocument();
    });

    it('detects and hints dates', () => {
      render(<JsonViewer data={{ date: '2025-12-20T10:00:00Z' }} />);

      expect(screen.getByText('(Date)')).toBeInTheDocument();
    });

    it('detects and hints emails', () => {
      render(<JsonViewer data={{ email: 'test@example.com' }} />);

      expect(screen.getByText('(Email)')).toBeInTheDocument();
    });

    it('truncates long strings', () => {
      const longString = 'a'.repeat(400);
      render(<JsonViewer data={{ long: longString }} />);

      expect(screen.getByText(/100 more/)).toBeInTheDocument();
    });
  });

  describe('Copy Functionality', () => {
    it('copies JSON on Copy button click', async () => {
      render(<JsonViewer data={{ name: 'John' }} />);

      fireEvent.click(screen.getByTitle('Copy JSON'));

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith(
          JSON.stringify({ name: 'John' }, null, 2)
        );
      });
    });

    it('shows Copied! after copy', async () => {
      render(<JsonViewer data={{ name: 'John' }} />);

      fireEvent.click(screen.getByTitle('Copy JSON'));

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });
  });

  describe('Title', () => {
    it('renders title when provided', () => {
      render(<JsonViewer data={{ test: 1 }} title="Request Body" />);

      expect(screen.getByText('Request Body')).toBeInTheDocument();
    });

    it('does not render title when not provided', () => {
      render(<JsonViewer data={{ test: 1 }} />);

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });
  });

  describe('Item Count Display', () => {
    it('shows array item count in header', () => {
      render(<JsonViewer data={[1, 2, 3, 4, 5]} />);

      // Multiple elements may exist
      const elements = screen.getAllByText('5 items');
      expect(elements.length).toBeGreaterThan(0);
    });

    it('shows object key count in header', () => {
      render(<JsonViewer data={{ a: 1, b: 2, c: 3 }} />);

      // Multiple elements may exist
      const elements = screen.getAllByText('3 keys');
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe('Inline Mode', () => {
    it('renders without card wrapper when inline', () => {
      const { container } = render(
        <JsonViewer data={{ test: 1 }} inline={true} />
      );

      expect(container.querySelector('.card')).not.toBeInTheDocument();
    });

    it('shows toolbar when showToolbar is true in inline mode', () => {
      render(
        <JsonViewer data={{ test: 1 }} inline={true} showToolbar={true} />
      );

      expect(screen.getByTitle('Expand all')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// InlineJson Tests
// ============================================================================

describe('InlineJson', () => {
  it('renders as inline by default', () => {
    const { container } = render(<InlineJson data={{ test: 1 }} />);

    // Should not have card wrapper
    expect(container.querySelector('.card')).not.toBeInTheDocument();
  });

  it('shows toolbar by default', () => {
    render(<InlineJson data={{ test: 1 }} />);

    expect(screen.getByTitle('Expand all')).toBeInTheDocument();
    expect(screen.getByTitle('Collapse all')).toBeInTheDocument();
  });

  it('hides toolbar when showToolbar=false', () => {
    render(<InlineJson data={{ test: 1 }} showToolbar={false} />);

    expect(screen.queryByTitle('Expand all')).not.toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<InlineJson data={{ test: 1 }} title="Payload" />);

    expect(screen.getByText('Payload')).toBeInTheDocument();
  });

  it('respects depth prop', () => {
    render(
      <InlineJson
        data={{ a: { b: { c: 'deep' } } }}
        depth={1}
      />
    );

    // Only first level expanded
    expect(screen.getByText('"a"')).toBeInTheDocument();
    expect(screen.queryByText('"b"')).not.toBeInTheDocument();
  });

  it('respects expanded prop', () => {
    render(<InlineJson data={{ test: 1 }} expanded={false} />);

    // Multiple elements may exist
    const elements = screen.getAllByText('1 keys');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('applies maxHeight prop', () => {
    const { container } = render(<InlineJson data={{ test: 1 }} maxHeight={200} />);
    const scrollContainer = container.querySelector('.overflow-auto');
    expect(scrollContainer).toHaveStyle({ maxHeight: '200px' });
  });
});

// ============================================================================
// Edge Cases and Additional Tests
// ============================================================================

describe('JsonViewer Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Syntax Highlighting Colors', () => {
    it('highlights null in orange', () => {
      render(<JsonViewer data={null} />);
      const nullSpan = screen.getByText('null');
      expect(nullSpan.className).toContain('text-orange');
    });

    it('highlights boolean in purple', () => {
      render(<JsonViewer data={true} />);
      const boolSpan = screen.getByText('true');
      expect(boolSpan.className).toContain('text-purple');
    });

    it('highlights number in cyan', () => {
      render(<JsonViewer data={42} />);
      const numSpan = screen.getByText('42');
      expect(numSpan.className).toContain('text-cyan');
    });

    it('highlights string in green', () => {
      render(<JsonViewer data="hello" />);
      const strSpan = screen.getByText(/"hello"/);
      expect(strSpan.className).toContain('text-green');
    });

    it('highlights keys in blue', () => {
      render(<JsonViewer data={{ testKey: 1 }} />);
      const keySpan = screen.getByText('"testKey"');
      expect(keySpan.className).toContain('text-blue');
    });

    it('shows array indices in gray', () => {
      render(<JsonViewer data={['item']} />);
      const indexSpan = screen.getByText('0');
      expect(indexSpan.className).toContain('text-gray');
    });
  });

  describe('Empty Containers', () => {
    it('renders empty array correctly', () => {
      render(<JsonViewer data={[]} />);
      expect(screen.getByText('[')).toBeInTheDocument();
      expect(screen.getByText(']')).toBeInTheDocument();
    });

    it('renders empty object correctly', () => {
      render(<JsonViewer data={{}} />);
      expect(screen.getByText('{')).toBeInTheDocument();
      expect(screen.getByText('}')).toBeInTheDocument();
    });
  });

  describe('Special Values', () => {
    it('renders empty string', () => {
      render(<JsonViewer data="" />);
      expect(screen.getByText('""')).toBeInTheDocument();
    });

    it('renders negative numbers', () => {
      render(<JsonViewer data={-123.45} />);
      expect(screen.getByText('-123.45')).toBeInTheDocument();
    });

    it('renders zero', () => {
      render(<JsonViewer data={0} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('MaxHeight Variants', () => {
    it('applies numeric maxHeight as pixels', () => {
      const { container } = render(
        <JsonViewer data={{ test: 1 }} maxHeight={300} />
      );
      const scrollContainer = container.querySelector('.overflow-auto');
      expect(scrollContainer).toHaveStyle({ maxHeight: '300px' });
    });

    it('applies string maxHeight directly', () => {
      const { container } = render(
        <JsonViewer data={{ test: 1 }} maxHeight="50vh" />
      );
      const scrollContainer = container.querySelector('.overflow-auto');
      expect(scrollContainer).toHaveStyle({ maxHeight: '50vh' });
    });
  });

  describe('Copy Error Handling', () => {
    it('handles copy failure gracefully', async () => {
      const mockClipboardFail = {
        writeText: vi.fn().mockRejectedValue(new Error('Failed')),
      };
      Object.assign(navigator, { clipboard: mockClipboardFail });

      const toast = await import('react-hot-toast');
      render(<JsonViewer data={{ test: 1 }} />);

      fireEvent.click(screen.getByTitle('Copy JSON'));

      await waitFor(() => {
        expect(toast.default.error).toHaveBeenCalledWith('Failed to copy');
      });

      // Restore mock
      Object.assign(navigator, {
        clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      });
    });
  });

  describe('Search Clear Button', () => {
    it('clears search input via toggle', () => {
      render(<JsonViewer data={{ test: 'value' }} searchable={true} />);

      // Open search
      const searchButton = screen.getByTitle(/search/i);
      fireEvent.click(searchButton);
      const input = screen.getByPlaceholderText('Search keys and values...');

      // Type something
      fireEvent.change(input, { target: { value: 'test' } });
      expect(input).toHaveValue('test');

      // Toggle search off to clear
      fireEvent.click(searchButton);

      // Search input should be hidden
      expect(
        screen.queryByPlaceholderText('Search keys and values...')
      ).not.toBeInTheDocument();
    });
  });

  describe('Search Matching Types', () => {
    it('matches null value in search', async () => {
      const { container } = render(
        <JsonViewer data={{ key: null }} searchable={true} />
      );

      fireEvent.click(screen.getByTitle(/search/i));
      fireEvent.change(
        screen.getByPlaceholderText('Search keys and values...'),
        { target: { value: 'null' } }
      );

      await waitFor(() => {
        const highlighted = container.querySelectorAll('.bg-yellow-400\\/30');
        expect(highlighted.length).toBeGreaterThan(0);
      });
    });

    it('matches boolean value in search', async () => {
      const { container } = render(
        <JsonViewer data={{ active: true }} searchable={true} />
      );

      fireEvent.click(screen.getByTitle(/search/i));
      fireEvent.change(
        screen.getByPlaceholderText('Search keys and values...'),
        { target: { value: 'true' } }
      );

      await waitFor(() => {
        const highlighted = container.querySelectorAll('.bg-yellow-400\\/30');
        expect(highlighted.length).toBeGreaterThan(0);
      });
    });

    it('matches number value in search', async () => {
      const { container } = render(
        <JsonViewer data={{ count: 42 }} searchable={true} />
      );

      fireEvent.click(screen.getByTitle(/search/i));
      fireEvent.change(
        screen.getByPlaceholderText('Search keys and values...'),
        { target: { value: '42' } }
      );

      await waitFor(() => {
        const highlighted = container.querySelectorAll('.bg-yellow-400\\/30');
        expect(highlighted.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Auto-expand on Search', () => {
    it('auto-expands matching paths when searching', async () => {
      render(
        <JsonViewer
          data={{ outer: { inner: { deep: 'target' } } }}
          initialExpanded={false}
          searchable={true}
        />
      );

      // Initially collapsed
      expect(screen.queryByText('"deep"')).not.toBeInTheDocument();

      // Open search and search for "target"
      fireEvent.click(screen.getByTitle(/search/i));
      fireEvent.change(
        screen.getByPlaceholderText('Search keys and values...'),
        { target: { value: 'target' } }
      );

      // Should auto-expand to show the match
      await waitFor(() => {
        expect(screen.getByText('"deep"')).toBeInTheDocument();
      });
    });
  });

  describe('Node Value Copy', () => {
    it('copies individual value on node copy click', async () => {
      const mockCopyClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };
      Object.assign(navigator, { clipboard: mockCopyClipboard });

      render(<JsonViewer data={{ name: 'John' }} />);

      // Hover over the node to show copy button
      const nodeRow = screen.getByText('"name"').closest('.group');
      if (nodeRow) {
        fireEvent.mouseEnter(nodeRow);

        // Find and click the copy button
        const copyButton = nodeRow.querySelector('button[title="Copy value"]');
        if (copyButton) {
          fireEvent.click(copyButton);

          await waitFor(() => {
            expect(mockCopyClipboard.writeText).toHaveBeenCalled();
          });
        }
      }
    });
  });
});
