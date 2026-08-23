/**
 * How many errors an operation had, not how many were kept.
 *
 * graphql-js stops validating at a hundred errors and only the first few are
 * recorded — one rejected query used to store all hundred and one, at 152,749
 * bytes an entry. Printing the recorded count on its own would report ten
 * errors for an operation that had a hundred and one.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GraphQLDetailView from '../../components/GraphQLDetailView';
import { Entry } from '../../types';

const entry = (errors: number, errorCount?: number): Entry =>
  ({
    id: 1,
    type: 'graphql',
    createdAt: '2026-08-22T00:00:00.000Z',
    payload: {
      operationType: 'query',
      operationName: 'Broken',
      query: '{ nope }',
      duration: 1,
      statusCode: 400,
      hasErrors: true,
      errorCount,
      errors: Array.from({ length: errors }, (_, i) => ({
        message: `Cannot query field "nope${i}"`,
        locations: [{ line: 1, column: 3 }],
      })),
    },
  }) as unknown as Entry;

const draw = (errors: number, errorCount?: number) =>
  render(
    <MemoryRouter>
      <GraphQLDetailView entry={entry(errors, errorCount)} />
    </MemoryRouter>,
  );

describe('the error count on a GraphQL operation', () => {
  it('says how many there were when only some were kept', () => {
    draw(10, 101);

    expect(screen.getByRole('tab', { name: /Errors \(10 of 101\)/i })).toBeInTheDocument();
  });

  it('says a plain count when every error was kept', () => {
    draw(3);

    expect(screen.getByRole('tab', { name: /Errors \(3\)/i })).toBeInTheDocument();
  });

  it('does not claim more were kept than there were', () => {
    draw(10, 101);

    expect(screen.queryByRole('tab', { name: /Errors \(101\)/i })).not.toBeInTheDocument();
  });

  it('shows both numbers on the section itself', () => {
    draw(10, 101);
    fireEvent.click(screen.getByRole('tab', { name: /Errors/i }));

    expect(screen.getByText(/GraphQL Errors \(10 of 101\)/i)).toBeInTheDocument();
  });
});
