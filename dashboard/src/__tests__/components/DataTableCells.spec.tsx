import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  TextCell,
  TagsList,
  DurationCell,
} from '../../components/DataTable';

/**
 * DataTable Cell Components Tests
 *
 * Tests for all cell helper components used in DataTable.
 * Following AAA pattern (Arrange-Act-Assert).
 */

describe('TextCell', () => {
  describe('Rendering', () => {
    it('renders text content', () => {
      // Arrange & Act
      render(<TextCell>Hello World</TextCell>);

      // Assert
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('applies mono font when mono=true', () => {
      // Arrange & Act
      render(<TextCell mono>Code</TextCell>);

      // Assert
      const element = screen.getByText('Code');
      expect(element).toHaveClass('font-mono');
    });

    it('applies secondary styling when secondary=true', () => {
      // Arrange & Act
      render(<TextCell secondary>Secondary text</TextCell>);

      // Assert
      const element = screen.getByText('Secondary text');
      expect(element).toHaveClass('text-gray-500');
    });

    it('applies truncate class when truncate=true', () => {
      // Arrange & Act
      render(<TextCell truncate>Long text that should be truncated</TextCell>);

      // Assert
      const element = screen.getByText('Long text that should be truncated');
      expect(element).toHaveClass('truncate');
    });

    it('sets title attribute when truncate=true with string content', () => {
      // Arrange & Act
      render(<TextCell truncate>Truncated text</TextCell>);

      // Assert
      const element = screen.getByText('Truncated text');
      expect(element).toHaveAttribute('title', 'Truncated text');
    });

    it('applies maxWidth style when provided', () => {
      // Arrange & Act
      render(<TextCell maxWidth="200px">Constrained text</TextCell>);

      // Assert
      const element = screen.getByText('Constrained text');
      expect(element).toHaveStyle({ maxWidth: '200px' });
    });

    it('applies custom className', () => {
      // Arrange & Act
      render(<TextCell className="custom-class">Text</TextCell>);

      // Assert
      const element = screen.getByText('Text');
      expect(element).toHaveClass('custom-class');
    });
  });
});




describe('TagsList', () => {
  describe('Empty State', () => {
    it('shows dash for empty array', () => {
      // Arrange & Act
      render(<TagsList tags={[]} />);

      // Assert
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('Tag Rendering', () => {
    it('renders all tags within max limit', () => {
      // Arrange & Act
      render(<TagsList tags={['tag1', 'tag2']} max={3} />);

      // Assert
      expect(screen.getByText('TAG1')).toBeInTheDocument();
      expect(screen.getByText('TAG2')).toBeInTheDocument();
    });

    it('shows remaining count when exceeding max', () => {
      // Arrange & Act
      render(<TagsList tags={['a', 'b', 'c', 'd', 'e']} max={3} />);

      // Assert
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('uses default max of 3', () => {
      // Arrange & Act
      render(<TagsList tags={['a', 'b', 'c', 'd', 'e', 'f']} />);

      // Assert
      expect(screen.getByText('+3')).toBeInTheDocument();
    });
  });

  describe('Click Handler', () => {
    it('calls onTagClick when tag is clicked', () => {
      // Arrange
      const handleClick = vi.fn();

      // Act
      render(<TagsList tags={['clickable']} onTagClick={handleClick} />);
      fireEvent.click(screen.getByText('CLICKABLE'));

      // Assert
      expect(handleClick).toHaveBeenCalledWith('clickable', expect.any(Object));
    });

    it('applies cursor-pointer when onTagClick is provided', () => {
      // Arrange & Act
      render(<TagsList tags={['tag']} onTagClick={() => {}} />);

      // Assert
      const button = screen.getByText('TAG');
      expect(button).toHaveClass('cursor-pointer');
    });
  });
});

describe('DurationCell', () => {
  describe('Formatting', () => {
    it('displays milliseconds for values under 1000ms', () => {
      // Arrange & Act
      render(<DurationCell ms={500} />);

      // Assert
      expect(screen.getByText('500ms')).toBeInTheDocument();
    });

    it('displays seconds for values over 1000ms', () => {
      // Arrange & Act
      render(<DurationCell ms={2500} />);

      // Assert
      expect(screen.getByText('2.50s')).toBeInTheDocument();
    });
  });

  describe('Color Coding', () => {
    it('uses default color for fast requests', () => {
      // Arrange & Act
      render(<DurationCell ms={100} />);

      // Assert
      const element = screen.getByText('100ms');
      expect(element).toHaveClass('text-gray-600');
    });

    it('uses yellow for slow requests', () => {
      // Arrange & Act
      render(<DurationCell ms={1500} slowThreshold={1000} />);

      // Assert
      const element = screen.getByText('1.50s');
      expect(element).toHaveClass('text-yellow-600');
    });

    it('uses red for very slow requests', () => {
      // Arrange & Act
      render(<DurationCell ms={6000} verySlowThreshold={5000} />);

      // Assert
      const element = screen.getByText('6.00s');
      expect(element).toHaveClass('text-red-600');
    });

    it('uses custom thresholds', () => {
      // Arrange & Act
      render(<DurationCell ms={200} slowThreshold={100} verySlowThreshold={300} />);

      // Assert
      const element = screen.getByText('200ms');
      expect(element).toHaveClass('text-yellow-600');
    });
  });
});
