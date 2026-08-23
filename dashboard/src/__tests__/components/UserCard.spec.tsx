/**
 * The dashboard does not tell anyone else who its users are.
 *
 * The card used to hash the authenticated user's email with a hand-written MD5
 * and point an `<img>` at `gravatar.com/avatar/<hash>`. Opening a request entry
 * sent that hash — Gravatar's own identifier for a person, and reversible for
 * any address a wordlist has seen — to a third party, with a `Referer` naming
 * the host the dashboard runs on.
 *
 * NestLens masks credentials before they reach storage and is often reached
 * over a private network so that none of this leaves. It also has to work where
 * nothing may: an air-gapped deployment, or `img-src 'self'`, showed a broken
 * image where a face should be.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import UserCard from '../../components/UserCard';
import { initialsFor } from '../../components/userAvatar';
import { RequestUser } from '../../types';

const ada: RequestUser = { id: 42, name: 'Ada Lovelace', email: 'ada@example.com' };

describe('UserCard', () => {
  it('requests nothing from anywhere', () => {
    const { container } = render(<UserCard user={ada} />);

    const remote = Array.from(container.querySelectorAll('[src], [href]'))
      .map((node) => node.getAttribute('src') ?? node.getAttribute('href') ?? '')
      .filter((value) => /^(https?:)?\/\//.test(value));

    expect(remote).toEqual([]);
  });

  it('draws the avatar itself', () => {
    render(<UserCard user={ada} />);

    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('still shows who the user is', () => {
    render(<UserCard user={ada} />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('keeps the mail link, which is the reader’s own action', () => {
    render(<UserCard user={ada} />);

    expect(screen.getByText('ada@example.com')).toHaveAttribute(
      'href',
      'mailto:ada@example.com',
    );
  });

  it('renders a user with nothing but an id', () => {
    render(<UserCard user={{ id: 'u-7' } as RequestUser} />);

    expect(screen.getByText('u-7')).toBeInTheDocument();
  });

  describe('initials', () => {
    it.each([
      [{ id: 1, name: 'Ada Lovelace' }, 'AL'],
      [{ id: 1, name: 'Ada' }, 'AD'],
      [{ id: 1, email: 'ada.lovelace@example.com' }, 'AL'],
      [{ id: 1, email: 'ada@example.com' }, 'AD'],
      [{ id: 1, name: '  ' as string, email: 'bob_smith@example.com' }, 'BS'],
      [{ id: 'u-7' }, 'U7'],
    ])('reads %j as %s', (user, expected) => {
      expect(initialsFor(user as RequestUser)).toBe(expected);
    });

    it('says something for a user with nothing to read', () => {
      expect(initialsFor({} as RequestUser)).toBe('?');
    });
  });
});
