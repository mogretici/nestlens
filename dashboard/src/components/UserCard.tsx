import { RequestUser } from '../types';
import DetailRow from './DetailRow';
import { avatarColour, initialsFor } from './userAvatar';

interface UserCardProps {
  user: RequestUser;
}

// The avatar is drawn rather than fetched; see `userAvatar`.

function Avatar({ user }: { user: RequestUser }) {
  const seed = user.email ?? user.name ?? String(user.id ?? '');

  return (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColour(seed)}`}
    >
      {initialsFor(user)}
    </span>
  );
}

export default function UserCard({ user }: UserCardProps) {
  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Authenticated User
        </h2>
      </div>
      <div className="p-4">
        <dl className="divide-y-0">
          <DetailRow
            label="ID"
            value={
              <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                {String(user.id)}
              </code>
            }
          />
          {user.name && (
            <DetailRow
              label="Name"
              value={
                <span className="flex items-center gap-2">
                  <Avatar user={user} />
                  <span>{user.name}</span>
                </span>
              }
            />
          )}
          {user.email && (
            <DetailRow
              label="Email Address"
              value={
                <a
                  href={`mailto:${user.email}`}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {user.email}
                </a>
              }
            />
          )}
        </dl>
      </div>
    </div>
  );
}
