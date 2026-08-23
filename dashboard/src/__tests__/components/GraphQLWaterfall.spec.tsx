/**
 * The resolver waterfall, in the units the entry carries.
 *
 * `GraphQLFieldTrace` records nanoseconds — both of its numbers say so — and
 * `GraphQLPayload.duration` is milliseconds. The waterfall divided one by the
 * other. Measured against the example application on an operation that took
 * 3.44ms in total:
 *
 *     orders   1213.04 s     (1,213,042 ns)
 *     product   164.92 s
 *     id          7.00 s
 *
 * Every number a million times too large, and every bar positioned at tens of
 * millions of percent — off the right-hand edge of the chart.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GraphQLDetailView from '../../components/GraphQLDetailView';
import { Entry } from '../../types';

const entry = (fieldTraces: Record<string, unknown>[]): Entry =>
  ({
    id: 1,
    type: 'graphql',
    createdAt: '2026-08-22T00:00:00.000Z',
    payload: {
      operationType: 'query',
      operationName: 'GetOrders',
      query: '{ orders { id } }',
      // Milliseconds, as the type says.
      duration: 3.437833,
      statusCode: 200,
      hasErrors: false,
      fieldTraces,
    },
  }) as unknown as Entry;

const trace = (fieldName: string, startOffset: number, duration: number) => ({
  path: `Query.${fieldName}`,
  parentType: 'Query',
  fieldName,
  returnType: 'String',
  // Nanoseconds, as the type says.
  startOffset,
  duration,
});

/** The waterfall lives behind the Resolvers tab. */
const draw = (traces: Record<string, unknown>[]) => {
  const result = render(
    <MemoryRouter>
      <GraphQLDetailView entry={entry(traces)} />
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole('tab', { name: /Resolvers/i }));
  return result;
};

/** Every bar, as the percentages it was positioned at. */
const bars = (container: HTMLElement) =>
  [...container.querySelectorAll('.bg-primary-400')].map((bar) => ({
    left: Number.parseFloat((bar as HTMLElement).style.left),
    width: Number.parseFloat((bar as HTMLElement).style.width),
  }));

describe('the resolver waterfall', () => {
  it('reads a nanosecond duration as the milliseconds it is', () => {
    // 1,213,042 ns is 1.21 ms, not 1213 seconds.
    draw([trace('orders', 1_845_583, 1_213_042)]);

    expect(screen.getByText('1.21 ms')).toBeInTheDocument();
  });

  it('reads a sub-millisecond resolver in microseconds', () => {
    draw([trace('id', 3_113_041, 7_000)]);

    expect(screen.getByText('7 us')).toBeInTheDocument();
  });

  it('keeps every bar inside the chart', () => {
    const { container } = draw([
      trace('orders', 1_845_583, 1_213_042),
      trace('id', 3_113_041, 7_000),
      trace('items', 3_131_000, 3_500),
    ]);

    const drawn = bars(container);
    expect(drawn).toHaveLength(3);
    for (const bar of drawn) {
      expect(bar.left).toBeGreaterThanOrEqual(0);
      expect(bar.left).toBeLessThanOrEqual(100);
      expect(bar.left + bar.width).toBeLessThanOrEqual(100.001);
    }
  });

  it('puts a resolver halfway through the operation halfway along', () => {
    // Starts at 1.72ms of a 3.44ms operation.
    const { container } = draw([trace('orders', 1_718_916, 100_000)]);

    expect(bars(container)[0].left).toBeGreaterThan(45);
    expect(bars(container)[0].left).toBeLessThan(55);
  });

  it('widens the window for a resolver that outlives the operation', () => {
    // 10ms of resolver inside a 3.44ms operation: the bar has to fit somewhere.
    const { container } = draw([trace('slow', 0, 10_000_000)]);

    const bar = bars(container)[0];
    expect(bar.left + bar.width).toBeLessThanOrEqual(100.001);
    expect(bar.width).toBeGreaterThan(50);
  });

  it('gives a zero-length resolver a bar to be seen by', () => {
    const { container } = draw([trace('instant', 1_000_000, 0)]);

    expect(bars(container)[0].width).toBeGreaterThan(0);
  });
});
