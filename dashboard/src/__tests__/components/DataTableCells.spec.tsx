import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  TextCell,
  NumberCell,
  StatusBadge,
  TimeCell,
  TagsList,
  MethodBadge,
  StatusCodeBadge,
  DurationCell,
  LogLevelBadge,
  JobStatusBadge,
  CacheOperationBadge,
  CacheHitBadge,
  MailStatusBadge,
  ScheduleStatusBadge,
  SourceBadge,
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

describe('NumberCell', () => {
  describe('Basic Rendering', () => {
    it('renders number value', () => {
      // Arrange & Act
      render(<NumberCell value={42} />);

      // Assert
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders string value', () => {
      // Arrange & Act
      render(<NumberCell value="100" />);

      // Assert
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('renders with prefix', () => {
      // Arrange & Act
      render(<NumberCell value={50} prefix="$" />);

      // Assert
      expect(screen.getByText('$50')).toBeInTheDocument();
    });

    it('renders with suffix', () => {
      // Arrange & Act
      render(<NumberCell value={75} suffix="%" />);

      // Assert
      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('renders with both prefix and suffix', () => {
      // Arrange & Act
      render(<NumberCell value={100} prefix="~" suffix="ms" />);

      // Assert
      expect(screen.getByText('~100ms')).toBeInTheDocument();
    });
  });

  describe('Highlight Variants', () => {
    it('applies success highlight', () => {
      // Arrange & Act
      render(<NumberCell value={200} highlight="success" />);

      // Assert
      const element = screen.getByText('200');
      expect(element).toHaveClass('text-green-600');
    });

    it('applies warning highlight', () => {
      // Arrange & Act
      render(<NumberCell value={404} highlight="warning" />);

      // Assert
      const element = screen.getByText('404');
      expect(element).toHaveClass('text-yellow-600');
    });

    it('applies error highlight', () => {
      // Arrange & Act
      render(<NumberCell value={500} highlight="error" />);

      // Assert
      const element = screen.getByText('500');
      expect(element).toHaveClass('text-red-600');
    });

    it('applies info highlight', () => {
      // Arrange & Act
      render(<NumberCell value={100} highlight="info" />);

      // Assert
      const element = screen.getByText('100');
      expect(element).toHaveClass('text-blue-600');
    });

    it('applies default styling without highlight', () => {
      // Arrange & Act
      render(<NumberCell value={42} />);

      // Assert
      const element = screen.getByText('42');
      expect(element).toHaveClass('text-gray-600');
    });
  });
});

describe('StatusBadge', () => {
  describe('Rendering', () => {
    it('renders status text', () => {
      // Arrange & Act
      render(<StatusBadge status="Active" />);

      // Assert
      expect(screen.getByText('Active')).toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('applies default variant styling', () => {
      // Arrange & Act
      render(<StatusBadge status="Unknown" variant="default" />);

      // Assert
      const element = screen.getByText('Unknown');
      expect(element).toHaveClass('bg-gray-100', 'text-gray-700');
    });

    it('applies success variant styling', () => {
      // Arrange & Act
      render(<StatusBadge status="Complete" variant="success" />);

      // Assert
      const element = screen.getByText('Complete');
      expect(element).toHaveClass('bg-green-100', 'text-green-700');
    });

    it('applies warning variant styling', () => {
      // Arrange & Act
      render(<StatusBadge status="Pending" variant="warning" />);

      // Assert
      const element = screen.getByText('Pending');
      expect(element).toHaveClass('bg-yellow-100', 'text-yellow-700');
    });

    it('applies error variant styling', () => {
      // Arrange & Act
      render(<StatusBadge status="Failed" variant="error" />);

      // Assert
      const element = screen.getByText('Failed');
      expect(element).toHaveClass('bg-red-100', 'text-red-700');
    });

    it('applies info variant styling', () => {
      // Arrange & Act
      render(<StatusBadge status="Info" variant="info" />);

      // Assert
      const element = screen.getByText('Info');
      expect(element).toHaveClass('bg-blue-100', 'text-blue-700');
    });
  });

  describe('Sizes', () => {
    it('applies sm size by default', () => {
      // Arrange & Act
      render(<StatusBadge status="Test" />);

      // Assert
      const element = screen.getByText('Test');
      expect(element).toHaveClass('text-xs');
    });

    it('applies md size when specified', () => {
      // Arrange & Act
      render(<StatusBadge status="Test" size="md" />);

      // Assert
      const element = screen.getByText('Test');
      expect(element).toHaveClass('text-sm');
    });
  });
});

describe('TimeCell', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Relative Format', () => {
    it('shows "just now" for recent times', () => {
      // Arrange
      const recentTime = new Date('2025-01-15T11:59:30Z'); // 30 seconds ago

      // Act
      render(<TimeCell date={recentTime} format="relative" />);

      // Assert
      expect(screen.getByText('just now')).toBeInTheDocument();
    });

    it('shows minutes ago', () => {
      // Arrange
      const minutesAgo = new Date('2025-01-15T11:55:00Z'); // 5 minutes ago

      // Act
      render(<TimeCell date={minutesAgo} format="relative" />);

      // Assert
      expect(screen.getByText('5m ago')).toBeInTheDocument();
    });

    it('shows hours ago', () => {
      // Arrange
      const hoursAgo = new Date('2025-01-15T09:00:00Z'); // 3 hours ago

      // Act
      render(<TimeCell date={hoursAgo} format="relative" />);

      // Assert
      expect(screen.getByText('3h ago')).toBeInTheDocument();
    });

    it('shows days ago', () => {
      // Arrange
      const daysAgo = new Date('2025-01-13T12:00:00Z'); // 2 days ago

      // Act
      render(<TimeCell date={daysAgo} format="relative" />);

      // Assert
      expect(screen.getByText('2d ago')).toBeInTheDocument();
    });
  });

  describe('Absolute Format', () => {
    it('shows formatted date for absolute format', () => {
      // Arrange
      const date = new Date('2025-01-15T10:30:00Z');

      // Act
      render(<TimeCell date={date} format="absolute" />);

      // Assert
      const element = screen.getByText(/2025/);
      expect(element).toBeInTheDocument();
    });
  });

  describe('String Input', () => {
    it('handles string date input', () => {
      // Arrange & Act
      render(<TimeCell date="2025-01-15T11:59:30Z" format="relative" />);

      // Assert
      expect(screen.getByText('just now')).toBeInTheDocument();
    });
  });

  describe('Custom Formatter', () => {
    it('uses custom formatter when provided', () => {
      // Arrange
      const customFormatter = (date: Date) => `Custom: ${date.getFullYear()}`;

      // Act
      render(<TimeCell date={new Date('2025-01-15')} formatter={customFormatter} />);

      // Assert
      expect(screen.getByText('Custom: 2025')).toBeInTheDocument();
    });
  });

  describe('Title Attribute', () => {
    it('has title with full date', () => {
      // Arrange
      const date = new Date('2025-01-15T10:30:00Z');

      // Act
      render(<TimeCell date={date} />);

      // Assert
      const element = screen.getByText(/ago|just now|2025/);
      expect(element).toHaveAttribute('title');
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

describe('MethodBadge', () => {
  it('renders method text uppercase', () => {
    // Arrange & Act
    render(<MethodBadge method="get" />);

    // Assert
    expect(screen.getByText('GET')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    // Arrange
    const handleClick = vi.fn();

    // Act
    render(<MethodBadge method="POST" onClick={handleClick} />);
    fireEvent.click(screen.getByText('POST'));

    // Assert
    expect(handleClick).toHaveBeenCalled();
  });

  it('applies hover styles when clickable', () => {
    // Arrange & Act
    render(<MethodBadge method="PUT" onClick={() => {}} />);

    // Assert
    const button = screen.getByText('PUT');
    expect(button).toHaveClass('cursor-pointer', 'hover:scale-105');
  });
});

describe('StatusCodeBadge', () => {
  it('renders status code', () => {
    // Arrange & Act
    render(<StatusCodeBadge code={200} />);

    // Assert
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    // Arrange
    const handleClick = vi.fn();

    // Act
    render(<StatusCodeBadge code={404} onClick={handleClick} />);
    fireEvent.click(screen.getByText('404'));

    // Assert
    expect(handleClick).toHaveBeenCalled();
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

describe('LogLevelBadge', () => {
  it('renders level uppercase', () => {
    // Arrange & Act
    render(<LogLevelBadge level="debug" />);

    // Assert
    expect(screen.getByText('DEBUG')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    // Arrange
    const handleClick = vi.fn();

    // Act
    render(<LogLevelBadge level="error" onClick={handleClick} />);
    fireEvent.click(screen.getByText('ERROR'));

    // Assert
    expect(handleClick).toHaveBeenCalled();
  });
});

describe('JobStatusBadge', () => {
  it('renders status uppercase', () => {
    // Arrange & Act
    render(<JobStatusBadge status="completed" />);

    // Assert
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    // Arrange
    const handleClick = vi.fn();

    // Act
    render(<JobStatusBadge status="failed" onClick={handleClick} />);
    fireEvent.click(screen.getByText('FAILED'));

    // Assert
    expect(handleClick).toHaveBeenCalled();
  });
});

describe('CacheOperationBadge', () => {
  it('renders operation uppercase', () => {
    // Arrange & Act
    render(<CacheOperationBadge operation="get" />);

    // Assert
    expect(screen.getByText('GET')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    // Arrange
    const handleClick = vi.fn();

    // Act
    render(<CacheOperationBadge operation="set" onClick={handleClick} />);
    fireEvent.click(screen.getByText('SET'));

    // Assert
    expect(handleClick).toHaveBeenCalled();
  });
});

describe('CacheHitBadge', () => {
  it('renders HIT when hit=true', () => {
    // Arrange & Act
    render(<CacheHitBadge hit={true} />);

    // Assert
    expect(screen.getByText('HIT')).toBeInTheDocument();
  });

  it('renders MISS when hit=false', () => {
    // Arrange & Act
    render(<CacheHitBadge hit={false} />);

    // Assert
    expect(screen.getByText('MISS')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    // Arrange
    const handleClick = vi.fn();

    // Act
    render(<CacheHitBadge hit={true} onClick={handleClick} />);
    fireEvent.click(screen.getByText('HIT'));

    // Assert
    expect(handleClick).toHaveBeenCalled();
  });
});

describe('MailStatusBadge', () => {
  it('renders status uppercase', () => {
    // Arrange & Act
    render(<MailStatusBadge status="sent" />);

    // Assert
    expect(screen.getByText('SENT')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    // Arrange
    const handleClick = vi.fn();

    // Act
    render(<MailStatusBadge status="failed" onClick={handleClick} />);
    fireEvent.click(screen.getByText('FAILED'));

    // Assert
    expect(handleClick).toHaveBeenCalled();
  });
});

describe('ScheduleStatusBadge', () => {
  it('renders status uppercase', () => {
    // Arrange & Act
    render(<ScheduleStatusBadge status="running" />);

    // Assert
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    // Arrange
    const handleClick = vi.fn();

    // Act
    render(<ScheduleStatusBadge status="completed" onClick={handleClick} />);
    fireEvent.click(screen.getByText('COMPLETED'));

    // Assert
    expect(handleClick).toHaveBeenCalled();
  });
});

describe('SourceBadge', () => {
  it('renders source uppercase', () => {
    // Arrange & Act
    render(<SourceBadge source="typeorm" />);

    // Assert
    expect(screen.getByText('TYPEORM')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    // Arrange
    const handleClick = vi.fn();

    // Act
    render(<SourceBadge source="prisma" onClick={handleClick} />);
    fireEvent.click(screen.getByText('PRISMA'));

    // Assert
    expect(handleClick).toHaveBeenCalled();
  });
});
