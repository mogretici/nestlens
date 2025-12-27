import { useState, useCallback, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  Database,
  AlertTriangle,
  FileText,
  Menu,
  X,
  Moon,
  Sun,
  Trash2,
  Telescope,
  Briefcase,
  HardDrive,
  Mail,
  Clock,
  LayoutDashboard,
  Radio,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Globe,
  Box,
  Bell,
  Layout as LayoutIcon,
  Terminal,
  Shield,
  Layers,
  Pause,
  Play,
  GitBranch,
  Package,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clearEntries, getRecordingStatus, pauseRecording, resumeRecording, RecordingStatus } from '../api';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useStats } from '../contexts/StatsContext';

// Minimal Recording Toggle Component
function RecordingToggle() {
  const [status, setStatus] = useState<RecordingStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await getRecordingStatus();
        setStatus(response.data);
      } catch (error) {
        console.error('Failed to fetch recording status:', error);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    if (!status || loading) return;
    setLoading(true);
    try {
      if (status.isPaused) {
        const response = await resumeRecording();
        setStatus(response.data);
        toast.success('Recording resumed');
      } else {
        const response = await pauseRecording();
        setStatus(response.data);
        toast.success('Recording paused');
      }
    } catch (error) {
      toast.error('Failed to toggle recording');
    } finally {
      setLoading(false);
    }
  };

  if (!status) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`p-2.5 rounded-lg transition-colors ${
        status.isPaused
          ? 'text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
          : 'text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20'
      } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      aria-label={status.isPaused ? 'Resume recording' : 'Pause recording'}
      title={status.isPaused ? 'Resume Recording' : 'Pause Recording'}
    >
      {status.isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
    </button>
  );
}

// Icon colors matching Dashboard Entry Types
const iconColors: Record<string, string> = {
  dashboard: 'text-primary-500',
  request: 'text-blue-500',
  query: 'text-purple-500',
  graphql: 'text-fuchsia-500',
  exception: 'text-red-500',
  log: 'text-green-500',
  job: 'text-yellow-500',
  schedule: 'text-gray-500',
  batch: 'text-lime-500',
  command: 'text-slate-500',
  cache: 'text-cyan-500',
  redis: 'text-rose-500',
  model: 'text-violet-500',
  'http-client': 'text-indigo-500',
  mail: 'text-pink-500',
  notification: 'text-orange-500',
  event: 'text-emerald-500',
  view: 'text-teal-500',
  gate: 'text-amber-500',
  dump: 'text-stone-500',
};

// Navigation structure with categories (matches Dashboard)
const navigationGroups = [
  {
    name: 'Overview',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard, colorKey: 'dashboard' },
    ],
  },
  {
    name: 'Core',
    items: [
      { name: 'Requests', href: '/requests', icon: Activity, colorKey: 'request' },
      { name: 'Queries', href: '/queries', icon: Database, colorKey: 'query' },
      { name: 'GraphQL', href: '/graphql', icon: GitBranch, colorKey: 'graphql' },
      { name: 'Exceptions', href: '/exceptions', icon: AlertTriangle, badge: 'exceptions', colorKey: 'exception' },
      { name: 'Logs', href: '/logs', icon: FileText, colorKey: 'log' },
    ],
  },
  {
    name: 'Background',
    items: [
      { name: 'Jobs', href: '/jobs', icon: Briefcase, colorKey: 'job' },
      { name: 'Schedule', href: '/schedule', icon: Clock, colorKey: 'schedule' },
      { name: 'Batches', href: '/batches', icon: Package, colorKey: 'batch' },
      { name: 'Commands', href: '/commands', icon: Terminal, colorKey: 'command' },
    ],
  },
  {
    name: 'Data',
    items: [
      { name: 'Cache', href: '/cache', icon: HardDrive, colorKey: 'cache' },
      { name: 'Redis', href: '/redis', icon: Box, colorKey: 'redis' },
      { name: 'Models', href: '/models', icon: Layers, colorKey: 'model' },
    ],
  },
  {
    name: 'Communication',
    items: [
      { name: 'HTTP Client', href: '/http-client', icon: Globe, colorKey: 'http-client' },
      { name: 'Mail', href: '/mail', icon: Mail, colorKey: 'mail' },
      { name: 'Notifications', href: '/notifications', icon: Bell, colorKey: 'notification' },
      { name: 'Events', href: '/events', icon: Radio, colorKey: 'event' },
    ],
  },
  {
    name: 'System',
    items: [
      { name: 'Views', href: '/views', icon: LayoutIcon, colorKey: 'view' },
      { name: 'Gates', href: '/gates', icon: Shield, colorKey: 'gate' },
      { name: 'Dumps', href: '/dumps', icon: HardDrive, colorKey: 'dump' },
    ],
  },
] as const;

type BadgeKey = 'exceptions';

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { stats } = useStats();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    // Load collapsed state from localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nestlens-collapsed-groups');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    }
    return new Set();
  });
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  const [themePreference, setThemePreference] = useState<'system' | 'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('nestlens-theme');
      if (stored === 'system' || stored === 'light' || stored === 'dark') {
        return stored;
      }
    }
    return 'system';
  });

  const toggleGroup = useCallback((groupName: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      localStorage.setItem('nestlens-collapsed-groups', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const getBadgeCount = useCallback((badgeKey: BadgeKey): number => {
    if (!stats) return 0;
    switch (badgeKey) {
      case 'exceptions':
        // Use unresolvedExceptions if available, otherwise fall back to total
        return stats.unresolvedExceptions ?? stats.byType.exception ?? 0;
      default:
        return 0;
    }
  }, [stats]);

  const applyTheme = useCallback((preference: 'system' | 'light' | 'dark') => {
    let shouldBeDark = false;

    if (preference === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      shouldBeDark = mediaQuery.matches;
    } else {
      shouldBeDark = preference === 'dark';
    }

    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    setDarkMode(shouldBeDark);
  }, []);

  const toggleDarkMode = useCallback(() => {
    const nextPreference = darkMode ? 'light' : 'dark';
    setThemePreference(nextPreference);
    localStorage.setItem('nestlens-theme', nextPreference);
    applyTheme(nextPreference);
  }, [darkMode, applyTheme]);

  const handleClear = useCallback(async () => {
    if (window.confirm('Are you sure you want to clear all entries?')) {
      await clearEntries();
      toast.success('All entries cleared');
      window.location.reload();
    }
  }, []);

  // Apply theme on mount and when system preference changes
  useEffect(() => {
    applyTheme(themePreference);

    if (themePreference === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => {
        const shouldBeDark = e.matches;
        if (shouldBeDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        setDarkMode(shouldBeDark);
      };

      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [themePreference, applyTheme]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'k',
      ctrl: true,
      handler: () => handleClear(),
    },
    {
      key: 'Escape',
      handler: () => {
        if (sidebarOpen) {
          setSidebarOpen(false);
        }
      },
      preventDefault: false,
    },
    {
      key: 'd',
      ctrl: true,
      handler: () => toggleDarkMode(),
    },
  ]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? '' : 'hidden'}`}
      >
        <div
          className="fixed inset-0 bg-gray-900/80"
          onClick={() => setSidebarOpen(false)}
        />
        <div id="mobile-sidebar" className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-800 flex flex-col">
          <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
            <Link to="/" className="flex items-center space-x-2">
              <Telescope className="h-8 w-8 text-primary-600" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                NestLens
              </span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
              aria-label="Close sidebar"
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3">
            {navigationGroups.map((group, groupIndex) => {
              const isCollapsed = collapsedGroups.has(group.name);
              return (
                <div key={group.name} className={groupIndex > 0 ? 'mt-4' : ''}>
                  <button
                    onClick={() => toggleGroup(group.name)}
                    className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                    aria-expanded={!isCollapsed}
                    aria-controls={`nav-group-${group.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <span>{group.name}</span>
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                  {!isCollapsed && (
                    <div className="mt-1 space-y-0.5">
                      {group.items.map((item) => {
                        const isActive = item.href === '/'
                          ? location.pathname === '/'
                          : location.pathname.startsWith(item.href);
                        const badgeCount = 'badge' in item ? getBadgeCount(item.badge as BadgeKey) : 0;
                        return (
                          <Link
                            key={item.name}
                            to={item.href}
                            aria-current={isActive ? 'page' : undefined}
                            className={`group flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                              isActive
                                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-200 font-medium'
                                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                            }`}
                            onClick={() => setSidebarOpen(false)}
                          >
                            <div className="flex items-center space-x-3">
                              <item.icon className={`h-4 w-4 ${iconColors[item.colorKey] || 'text-gray-400'}`} />
                              <span className="text-sm">{item.name}</span>
                            </div>
                            {badgeCount > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 rounded-full">
                                {badgeCount > 99 ? '99+' : badgeCount}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          {/* Mobile Footer - Fixed at bottom */}
          <div className="flex-shrink-0 p-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center gap-1">
              <RecordingToggle />
              <button
                onClick={toggleDarkMode}
                className="p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <button
                onClick={handleClear}
                className="p-2.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                aria-label="Clear all data"
              >
                <Trash2 className="h-5 w-5" />
              </button>
              <a
                href="https://github.com/mogretici/nestlens"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Documentation"
              >
                <ExternalLink className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          {/* Logo */}
          <div className="flex h-16 items-center px-4 border-b border-gray-200 dark:border-gray-700">
            <Link to="/" className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-primary-100 dark:bg-primary-900/50 rounded-lg">
                <Telescope className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  NestLens
                </span>
                <span className="hidden xl:inline text-xs text-gray-400 dark:text-gray-500 ml-1.5">
                  v{__APP_VERSION__}
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation Groups - Scrollable */}
          <nav className="flex-1 min-h-0 overflow-y-auto py-4 px-3">
            {navigationGroups.map((group, groupIndex) => {
              const isCollapsed = collapsedGroups.has(group.name);
              return (
                <div key={group.name} className={groupIndex > 0 ? 'mt-6' : ''}>
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(group.name)}
                    className="flex items-center justify-between w-full px-2 py-1.5 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                    aria-expanded={!isCollapsed}
                    aria-controls={`desktop-nav-group-${group.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <span>{group.name}</span>
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                  {/* Group Items */}
                  {!isCollapsed && (
                    <div className="mt-1 space-y-0.5">
                      {group.items.map((item) => {
                        const isActive = item.href === '/'
                          ? location.pathname === '/'
                          : location.pathname.startsWith(item.href);
                        const badgeCount = 'badge' in item ? getBadgeCount(item.badge as BadgeKey) : 0;
                        return (
                          <Link
                            key={item.name}
                            to={item.href}
                            aria-current={isActive ? 'page' : undefined}
                            className={`group flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-150 ${
                              isActive
                                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-200 font-medium shadow-sm'
                                : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <item.icon className={`h-[18px] w-[18px] ${iconColors[item.colorKey] || 'text-gray-400'}`} />
                              <span className="text-sm">{item.name}</span>
                            </div>
                            {badgeCount > 0 && (
                              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold rounded-full transition-colors ${
                                isActive
                                  ? 'bg-primary-200 text-primary-800 dark:bg-primary-800 dark:text-primary-200'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
                              }`}>
                                {badgeCount > 99 ? '99+' : badgeCount}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer - Fixed at bottom */}
          <div className="flex-shrink-0 p-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-center gap-1">
              {/* Recording Toggle */}
              <RecordingToggle />

              {/* Theme Toggle */}
              <button
                onClick={toggleDarkMode}
                className="p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                title={darkMode ? 'Light Mode (⌘D)' : 'Dark Mode (⌘D)'}
              >
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {/* Clear Data */}
              <button
                onClick={handleClear}
                className="p-2.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                aria-label="Clear all data"
                title="Clear All Data (⌘K)"
              >
                <Trash2 className="h-5 w-5" />
              </button>

              {/* Docs Link */}
              <a
                href="https://github.com/mogretici/nestlens"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label="Documentation"
                title="Documentation"
              >
                <ExternalLink className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header - only shown on small screens */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
            aria-expanded={sidebarOpen}
            aria-controls="mobile-sidebar"
            aria-label="Open navigation menu"
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
          <Link to="/" className="flex items-center space-x-2">
            <Telescope className="h-6 w-6 text-primary-600" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">NestLens</span>
          </Link>
        </header>
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
