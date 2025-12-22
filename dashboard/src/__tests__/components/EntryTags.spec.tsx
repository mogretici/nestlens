/**
 * EntryTags Component Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntryTags, TagList, getTagColor } from '../../components/EntryTags';

// Mock API
vi.mock('../../api', () => ({
  addTagsToEntry: vi.fn().mockResolvedValue({ data: ['existing', 'new'] }),
  removeTagsFromEntry: vi.fn().mockResolvedValue({ data: ['remaining'] }),
}));

// ============================================================================
// getTagColor Tests
// ============================================================================

describe('getTagColor', () => {
  describe('HTTP Methods', () => {
    it('returns green for GET', () => {
      expect(getTagColor('GET')).toContain('bg-green');
    });

    it('returns blue for POST', () => {
      expect(getTagColor('POST')).toContain('bg-blue');
    });

    it('returns yellow for PUT', () => {
      expect(getTagColor('PUT')).toContain('bg-yellow');
    });

    it('returns orange for PATCH', () => {
      expect(getTagColor('PATCH')).toContain('bg-orange');
    });

    it('returns red for DELETE', () => {
      expect(getTagColor('DELETE')).toContain('bg-red');
    });

    it('returns gray for HEAD and OPTIONS', () => {
      expect(getTagColor('HEAD')).toContain('bg-gray');
      expect(getTagColor('OPTIONS')).toContain('bg-gray');
    });
  });

  describe('Status Tags', () => {
    it('returns red for error tags', () => {
      expect(getTagColor('ERROR')).toContain('bg-red');
      expect(getTagColor('5XX')).toContain('bg-red');
      expect(getTagColor('FAILED')).toContain('bg-red');
    });

    it('returns yellow for warning tags', () => {
      expect(getTagColor('WARNING')).toContain('bg-yellow');
      expect(getTagColor('4XX')).toContain('bg-yellow');
    });

    it('returns green for success tags', () => {
      expect(getTagColor('SUCCESS')).toContain('bg-green');
      expect(getTagColor('HIT')).toContain('bg-green');
    });

    it('returns orange for slow', () => {
      expect(getTagColor('SLOW')).toContain('bg-orange');
    });
  });

  describe('Special Tags', () => {
    it('returns pink for GraphQL', () => {
      expect(getTagColor('GRAPHQL')).toContain('bg-pink');
    });

    it('returns purple for user tags', () => {
      expect(getTagColor('USER:123')).toContain('bg-purple');
    });

    it('returns cyan for query types', () => {
      expect(getTagColor('SELECT')).toContain('bg-cyan');
      expect(getTagColor('INSERT')).toContain('bg-cyan');
    });
  });

  describe('Case Insensitivity', () => {
    it('handles lowercase', () => {
      expect(getTagColor('get')).toContain('bg-green');
      expect(getTagColor('error')).toContain('bg-red');
    });
  });

  describe('Default', () => {
    it('returns gray for unknown tags', () => {
      expect(getTagColor('UNKNOWN')).toContain('bg-gray');
    });
  });
});

// ============================================================================
// TagList Tests
// ============================================================================

describe('TagList', () => {
  it('returns null for undefined tags', () => {
    const { container } = render(<TagList />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null for empty tags', () => {
    const { container } = render(<TagList tags={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders all tags when under max', () => {
    render(<TagList tags={['GET', 'SUCCESS']} />);

    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('SUCCESS')).toBeInTheDocument();
  });

  it('truncates tags at maxTags', () => {
    render(<TagList tags={['GET', 'POST', 'PUT', 'DELETE']} maxTags={2} />);

    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.queryByText('PUT')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('shows remaining count', () => {
    render(<TagList tags={['A', 'B', 'C', 'D', 'E']} maxTags={3} />);

    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('calls onTagClick when tag clicked', () => {
    const handleClick = vi.fn();
    render(<TagList tags={['GET']} onTagClick={handleClick} />);

    fireEvent.click(screen.getByText('GET'));
    expect(handleClick).toHaveBeenCalledWith('GET');
  });

  it('applies clickable styling when clickable', () => {
    render(<TagList tags={['GET']} clickable />);

    const tag = screen.getByText('GET');
    expect(tag.className).toContain('cursor-pointer');
  });
});

// ============================================================================
// EntryTags Tests
// ============================================================================

describe('EntryTags', () => {
  describe('Non-Editable Mode', () => {
    it('returns null when no tags and not editable', () => {
      const { container } = render(
        <EntryTags entryId={1} tags={[]} editable={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders tags', () => {
      render(<EntryTags entryId={1} tags={['GET', 'SUCCESS']} />);

      expect(screen.getByText('GET')).toBeInTheDocument();
      expect(screen.getByText('SUCCESS')).toBeInTheDocument();
    });

    it('applies color based on tag', () => {
      render(<EntryTags entryId={1} tags={['ERROR']} />);

      const tag = screen.getByText('ERROR');
      expect(tag.className).toContain('bg-red');
    });

    it('applies small size by default', () => {
      render(<EntryTags entryId={1} tags={['GET']} />);

      const tag = screen.getByText('GET');
      expect(tag.className).toContain('text-xs');
    });

    it('applies medium size when specified', () => {
      render(<EntryTags entryId={1} tags={['GET']} size="md" />);

      const tag = screen.getByText('GET');
      expect(tag.className).toContain('text-sm');
    });

    it('renders tags uppercase', () => {
      render(<EntryTags entryId={1} tags={['lowercase']} />);

      expect(screen.getByText('LOWERCASE')).toBeInTheDocument();
    });
  });

  describe('Editable Mode', () => {
    it('shows + Tag button when editable', () => {
      render(<EntryTags entryId={1} tags={[]} editable={true} />);

      expect(screen.getByText('+ Tag')).toBeInTheDocument();
    });

    it('shows remove button on tags when editable', () => {
      render(<EntryTags entryId={1} tags={['GET']} editable={true} />);

      expect(screen.getByText('×')).toBeInTheDocument();
    });

    it('opens input on + Tag click', () => {
      render(<EntryTags entryId={1} tags={[]} editable={true} />);

      fireEvent.click(screen.getByText('+ Tag'));

      expect(screen.getByPlaceholderText('New tag...')).toBeInTheDocument();
    });

    it('closes input on escape', () => {
      render(<EntryTags entryId={1} tags={[]} editable={true} />);

      fireEvent.click(screen.getByText('+ Tag'));
      const input = screen.getByPlaceholderText('New tag...');

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByPlaceholderText('New tag...')).not.toBeInTheDocument();
    });

    it('closes input on cancel button click', () => {
      render(<EntryTags entryId={1} tags={[]} editable={true} />);

      fireEvent.click(screen.getByText('+ Tag'));

      // Find the close button (×)
      const buttons = screen.getAllByRole('button');
      const cancelButton = buttons.find((btn) => btn.textContent === '×');
      fireEvent.click(cancelButton!);

      expect(screen.queryByPlaceholderText('New tag...')).not.toBeInTheDocument();
    });

    it('adds tag on Enter key', async () => {
      render(<EntryTags entryId={1} tags={[]} editable={true} />);

      fireEvent.click(screen.getByText('+ Tag'));
      const input = screen.getByPlaceholderText('New tag...');

      fireEvent.change(input, { target: { value: 'newtag' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Wait for API call and state update
      await screen.findByText('NEW');
    });

    it('adds tag on + button click', async () => {
      render(<EntryTags entryId={1} tags={[]} editable={true} />);

      fireEvent.click(screen.getByText('+ Tag'));
      const input = screen.getByPlaceholderText('New tag...');

      fireEvent.change(input, { target: { value: 'newtag' } });

      // Find the add button (+)
      const addButton = screen.getByText('+');
      fireEvent.click(addButton);

      // Wait for API call and state update
      await screen.findByText('EXISTING');
    });

    it('does not add empty tags', async () => {
      render(<EntryTags entryId={1} tags={['existing']} editable={true} />);

      fireEvent.click(screen.getByText('+ Tag'));
      const input = screen.getByPlaceholderText('New tag...');

      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Input should still be visible (not closed)
      expect(screen.getByPlaceholderText('New tag...')).toBeInTheDocument();
    });

    it('removes tag on × click', async () => {
      render(<EntryTags entryId={1} tags={['GET']} editable={true} />);

      const removeButton = screen.getByText('×');
      fireEvent.click(removeButton);

      // Wait for API call - the mock returns ['remaining']
      await screen.findByText('REMAINING');
    });

    it('calls onTagsChange when tags are added', async () => {
      const handleChange = vi.fn();
      render(
        <EntryTags entryId={1} tags={[]} editable={true} onTagsChange={handleChange} />
      );

      fireEvent.click(screen.getByText('+ Tag'));
      const input = screen.getByPlaceholderText('New tag...');

      fireEvent.change(input, { target: { value: 'newtag' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Wait for API call
      await vi.waitFor(() => {
        expect(handleChange).toHaveBeenCalledWith(['existing', 'new']);
      });
    });

    it('calls onTagsChange when tags are removed', async () => {
      const handleChange = vi.fn();
      render(
        <EntryTags entryId={1} tags={['GET']} editable={true} onTagsChange={handleChange} />
      );

      const removeButton = screen.getByText('×');
      fireEvent.click(removeButton);

      // Wait for API call
      await vi.waitFor(() => {
        expect(handleChange).toHaveBeenCalledWith(['remaining']);
      });
    });

    it('stops event propagation on + Tag button click', () => {
      const parentClick = vi.fn();
      render(
        <div onClick={parentClick}>
          <EntryTags entryId={1} tags={[]} editable={true} />
        </div>
      );

      fireEvent.click(screen.getByText('+ Tag'));

      expect(parentClick).not.toHaveBeenCalled();
    });

    it('stops event propagation on remove button click', () => {
      const parentClick = vi.fn();
      render(
        <div onClick={parentClick}>
          <EntryTags entryId={1} tags={['GET']} editable={true} />
        </div>
      );

      fireEvent.click(screen.getByText('×'));

      expect(parentClick).not.toHaveBeenCalled();
    });
  });
});

describe('getTagColor additional cases', () => {
  it('returns blue for REDIRECT', () => {
    expect(getTagColor('REDIRECT')).toContain('bg-blue');
  });

  it('returns blue for 3XX', () => {
    expect(getTagColor('3XX')).toContain('bg-blue');
  });

  it('returns gray for MISS', () => {
    expect(getTagColor('MISS')).toContain('bg-gray');
  });

  it('returns red for HTTP-ERROR', () => {
    expect(getTagColor('HTTP-ERROR')).toContain('bg-red');
  });

  it('returns red for VALIDATION-ERROR', () => {
    expect(getTagColor('VALIDATION-ERROR')).toContain('bg-red');
  });

  it('returns yellow for WARN', () => {
    expect(getTagColor('WARN')).toContain('bg-yellow');
  });

  it('returns yellow for CLIENT-ERROR', () => {
    expect(getTagColor('CLIENT-ERROR')).toContain('bg-yellow');
  });

  it('returns cyan for UPDATE', () => {
    expect(getTagColor('UPDATE')).toContain('bg-cyan');
  });
});
