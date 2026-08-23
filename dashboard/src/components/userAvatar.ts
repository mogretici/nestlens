import { RequestUser } from '../types';

/**
 * The avatar is drawn here rather than fetched.
 *
 * It used to be a Gravatar: the card hashed the authenticated user's email
 * address with a hand-written MD5 and pointed an `<img>` at
 * `gravatar.com/avatar/<hash>`. Opening a request entry therefore sent that
 * hash — the identifier Gravatar itself is built on, and one that is reversible
 * for any address a wordlist has seen — to a third party, along with a `Referer`
 * naming the host the dashboard is served from.
 *
 * NestLens masks credentials before they reach storage, keeps the entry data
 * inside the application, and is often reached over a private network precisely
 * so that none of it leaves. A debugging dashboard quietly announcing every
 * user it displays to an outside service is the opposite of that, and it fails
 * where it matters most: an air-gapped deployment or a strict `img-src 'self'`
 * shows a broken image where a face should be.
 *
 * Initials on a colour derived from the address say as much as an identicon and
 * are computed here, from what the page already has.
 */
const AVATAR_COLOURS = [
  'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
];

/** Stable for one identity, so the same user keeps the same colour. */
export function avatarColour(seed: string): string {
  let hash = 0;

  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }

  return AVATAR_COLOURS[Math.abs(hash) % AVATAR_COLOURS.length];
}

/**
 * One or two letters for a name, and the first letter of an address for
 * everything else. Split on what separates words in a name written any way —
 * `Ada Lovelace`, `ada.lovelace`, `ada_lovelace`.
 */
export function initialsFor(user: RequestUser): string {
  const named = user.name?.trim();
  // Only the local part of an address names anyone: `ada@example.com` split on
  // its separators would otherwise read as "Ada Com".
  const addressed = user.email?.trim().split('@')[0];
  const source = named || addressed || String(user.id ?? '');
  const words = source.split(/[\s._-]+/).filter((word) => word.length > 0);

  if (words.length === 0) return '?';

  const letters =
    words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0].slice(0, 2);

  return letters.toUpperCase();
}
