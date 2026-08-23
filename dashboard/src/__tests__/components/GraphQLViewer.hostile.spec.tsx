/**
 * A recorded query cannot take the tab down.
 *
 * The viewer parses the query itself, recursively, one call per `{` — and the
 * query came off an entry, so whoever can reach the GraphQL endpoint decides
 * its shape. Nesting one deeply enough was measured at 3.0 seconds of frozen
 * page followed by `RangeError: Maximum call stack size exceeded`, from a query
 * well inside the 8KB the watcher records.
 *
 * Rendering an entry must not depend on the entry being friendly.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GraphQLViewer from '../../components/GraphQLViewer';

/** Comfortably past the depth any schema is written to answer. */
const deeplyNested = (levels: number): string =>
  `{ ${'a { '.repeat(levels)}b${' }'.repeat(levels)} }`;

describe('a query the viewer did not write', () => {
  it.each([
    ['nested two thousand deep', deeplyNested(2000)],
    ['three thousand open braces', '{'.repeat(3000)],
    ['closing braces only', '} } } a'],
    ['nothing but punctuation', '{}()[]!$@:'.repeat(400)],
    ['an argument full of braces', '{ a(f: { b: { c: ) } }) { d } }'],
  ])('renders %s without crashing', (_name, query) => {
    expect(() => render(<GraphQLViewer query={query} />)).not.toThrow();
  });

  it('renders a deep query quickly', () => {
    const started = performance.now();
    render(<GraphQLViewer query={deeplyNested(2000)} />);

    // Measured at 3,000ms before the depth bound; a tenth of a second is
    // already far more than this needs.
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('says where it stopped following', () => {
    render(<GraphQLViewer query={deeplyNested(200)} />);

    expect(screen.getByText(/deeper than this viewer follows/)).toBeInTheDocument();
  });

  it('still shows an ordinary query in full', () => {
    render(<GraphQLViewer query="{ orders(first: 10) { id items { product { name } } } }" />);

    expect(screen.getByText('orders')).toBeInTheDocument();
    expect(screen.queryByText(/deeper than this viewer follows/)).not.toBeInTheDocument();
  });
});
