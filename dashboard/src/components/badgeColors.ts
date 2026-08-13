/**
 * Badge colours, keyed by what the text looks like.
 *
 * Lives apart from the component that uses it because a module exporting both a
 * component and a plain function loses fast refresh: editing the function
 * remounts the tree instead of patching it.
 */
// HTTP methods for category detection
export const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'GRAPHQL'];

/**
 * Hash-based colors for unknown labels
 * These classes are listed explicitly so Tailwind JIT includes them:
 * bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-400
 * bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400
 * bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-400
 * bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-400
 * bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-400
 * bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-400
 * bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-400
 * bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-400
 */
const hashColors = [
  'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-400',
  'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400',
  'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-400',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-400',
  'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-400',
  'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-400',
  'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-400',
  'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-400',
];

// Generate consistent color index from string hash
function getHashColorIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % hashColors.length;
}


/**
 * Get badge color class based on content.
 *
 * SINGLE SOURCE OF TRUTH for all badge colors in NestLens.
 * Used by: ClickableBadge, FilterBadge, DataTable badges, EntryTags
 *
 * @param text - Badge content to determine color for
 * @returns Tailwind CSS classes for background and text color
 *
 * @example
 * getBadgeColor('GET')     // → green (HTTP method)
 * getBadgeColor('200')     // → green (success status)
 * getBadgeColor('ERROR')   // → red (error state)
 * getBadgeColor('prisma')  // → indigo (ORM source)
 * getBadgeColor('N+1')     // → amber (N+1 warning)
 */
export function getBadgeColor(text: string): string {
  const t = text.toUpperCase();

  // Paths (start with /)
  if (text.startsWith('/')) {
    return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
  }

  // IP addresses (IPv4 like 192.168.1.1 or IPv6 like ::1)
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(text) || /^[a-fA-F0-9:]+$/.test(text) && text.includes(':') && !text.includes('.')) {
    return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
  }

  // Controller actions (contains # or :: or Controller.method pattern)
  if (text.includes('#') || text.includes('::') || /Controller\./i.test(text)) {
    return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400';
  }

  // User related tags (check BEFORE hostname to prevent USER:123 being treated as hostname)
  if (t.startsWith('USER:')) {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  }

  // Hostnames (like localhost:3000 or api.example.com)
  // Must have TLD-like ending or port number, exclude uppercase event names
  const lowerText = text.toLowerCase();
  const hasPort = /:\d+$/.test(text);
  const hasTld = /\.(com|org|net|io|dev|app|co|local|internal)$/i.test(text);
  const isAllUpperWithDot = /^[A-Z0-9_.]+$/.test(text) && text.includes('.');
  if (lowerText === 'localhost' || (hasPort && !text.startsWith('/')) || (hasTld && !isAllUpperWithDot)) {
    return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
  }

  // HTTP Methods
  if (t === 'GET') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (t === 'POST') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
  if (t === 'PUT') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  }
  if (t === 'PATCH') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  }
  if (t === 'DELETE') {
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  }
  if (['HEAD', 'OPTIONS'].includes(t)) {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
  if (t === 'GRAPHQL') {
    return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200';
  }

  // Status codes (actual numbers like 200, 404, 500)
  const statusCode = parseInt(t, 10);
  if (!isNaN(statusCode) && statusCode >= 100 && statusCode < 600) {
    if (statusCode >= 500) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
    if (statusCode >= 400) {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
    if (statusCode >= 300) {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }

  // Status code tags
  if (t === 'SUCCESS' || t === '2XX' || t === 'HIT') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (t === 'REDIRECT' || t === '3XX') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
  if (t === 'WARNING' || t === 'WARN' || t === '4XX' || t === 'CLIENT-ERROR') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  }
  if (t === 'ERROR' || t === '5XX' || t === 'HTTP-ERROR' || t === 'VALIDATION-ERROR' || t === 'FAILED') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }

  // Slow
  if (t === 'SLOW' || t === 'SLOW QUERY') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
  }

  // N+1 Warning (GraphQL/Query performance issue)
  if (t === 'N+1' || t === 'N1') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300';
  }

  // Query types
  if (['SELECT', 'INSERT', 'UPDATE'].includes(t)) {
    return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
  }

  // Log levels
  if (t === 'DEBUG') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
  if (t === 'LOG' || t === 'INFO') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (t === 'VERBOSE') {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }

  // GraphQL operation types (check BEFORE entry types to avoid conflict)
  // These are the operationType values from GraphQL entries
  if (t === 'QUERY' || t === 'MUTATION' || t === 'SUBSCRIPTION') {
    if (t === 'QUERY') {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    }
    if (t === 'MUTATION') {
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    }
    if (t === 'SUBSCRIPTION') {
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    }
  }

  // Entry types
  if (t === 'REQUEST') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
  // Note: QUERY is handled above as GraphQL operation type (returns blue)
  if (t === 'EXCEPTION') {
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  }
  if (t === 'LOG') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (t === 'EVENT') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (t === 'JOB') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  }
  if (t === 'CACHE') {
    return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
  }
  if (t === 'MAIL') {
    return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200';
  }
  if (t === 'SCHEDULE') {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
  if (t === 'HTTP-CLIENT') {
    return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
  }

  // Status badges
  if (t === 'RESOLVED' || t === 'COMPLETED' || t === 'SENT' || t === 'ACTIVE') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (t === 'WAITING' || t === 'DELAYED' || t === 'PENDING') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  }

  // Cache operations
  if (t === 'MISS') {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
  if (t === 'GET' && !httpMethods.includes(t)) {
    // Cache GET operation (already handled by HTTP methods above)
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
  if (t === 'SET') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (t === 'DEL' || t === 'DELETE') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }
  if (t === 'CLEAR') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  }

  // Schedule/Job statuses
  if (t === 'STARTED') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }

  // ORM sources
  if (t === 'TYPEORM') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
  }
  if (t === 'PRISMA') {
    return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
  }
  if (t === 'MONGOOSE') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (t === 'SEQUELIZE') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
  if (t === 'KNEX') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  }
  if (t === 'MIKRO-ORM') {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  }

  // Normal status
  if (t === 'NORMAL') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }

  // Hash-based color for unknown labels
  return hashColors[getHashColorIndex(t)];
}
