import { useState, ReactNode, useEffect, useCallback, useRef, KeyboardEvent } from 'react';

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
  badge?: number;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  /** When provided, persists selected tab to URL hash with this key */
  hashKey?: string;
  /** Content to render on the right side of the tab header */
  headerRight?: ReactNode;
  /** Callback when active tab changes */
  onTabChange?: (tabId: string) => void;
}

function getInitialTab(hashKey: string | undefined, defaultTab: string): string {
  if (!hashKey || typeof window === 'undefined') return defaultTab;
  const hash = window.location.hash.slice(1);
  if (!hash) return defaultTab;
  try {
    const params = new URLSearchParams(hash);
    return params.get(hashKey) || defaultTab;
  } catch {
    return defaultTab;
  }
}

export default function Tabs({ tabs, defaultTab, hashKey, headerRight, onTabChange }: TabsProps) {
  const effectiveDefault = defaultTab || tabs[0]?.id;
  const [activeTab, setActiveTabState] = useState(() => getInitialTab(hashKey, effectiveDefault));

  // Sync with hash changes
  useEffect(() => {
    if (!hashKey) return;
    const handleHashChange = () => {
      const newTab = getInitialTab(hashKey, effectiveDefault);
      setActiveTabState(newTab);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [hashKey, effectiveDefault]);

  const setActiveTab = useCallback((newValue: string) => {
    setActiveTabState(newValue);
    onTabChange?.(newValue);

    if (!hashKey) return;

    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);

    if (newValue === effectiveDefault) {
      params.delete(hashKey);
    } else {
      params.set(hashKey, newValue);
    }

    const newHash = params.toString();
    const newUrl = newHash ? `#${newHash}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, '', newUrl);
  }, [hashKey, effectiveDefault, onTabChange]);

  const activeContent = tabs.find((tab) => tab.id === activeTab)?.content;
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let newIndex: number | null = null;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = tabs.length - 1;
        break;
    }

    if (newIndex !== null) {
      const newTab = tabs[newIndex];
      setActiveTab(newTab.id);
      tabRefs.current.get(newTab.id)?.focus();
    }
  }, [tabs, setActiveTab]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Tab Headers */}
      <div className="flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div
          className="flex flex-1"
          role="tablist"
          aria-label="Content tabs"
        >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) tabRefs.current.set(tab.id, el);
            }}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <span className="flex items-center gap-2">
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded">
                  {tab.badge}
                </span>
              )}
            </span>
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400" aria-hidden="true" />
            )}
          </button>
        ))}
        </div>
        {headerRight && (
          <div className="px-3 flex items-center">
            {headerRight}
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
        className="bg-white dark:bg-gray-900"
      >
        {activeContent}
      </div>
    </div>
  );
}
