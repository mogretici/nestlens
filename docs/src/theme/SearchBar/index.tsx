import React, { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useHistory } from '@docusaurus/router';
import useIsBrowser from '@docusaurus/useIsBrowser';

import styles from './styles.module.css';

interface SearchResult {
  title: string;
  url: string;
  summary?: string;
}

// Quick links for when no search query
const QUICK_LINKS: SearchResult[] = [
  { title: 'Getting Started', url: '/docs/getting-started/installation' },
  { title: 'Quick Start Guide', url: '/docs/getting-started/quick-start' },
  { title: 'Watchers Overview', url: '/docs/watchers/overview' },
  { title: 'Request Watcher', url: '/docs/watchers/request' },
  { title: 'Query Watcher', url: '/docs/watchers/query' },
  { title: 'Configuration', url: '/docs/configuration/basic-config' },
  { title: 'API Reference', url: '/docs/api' },
];

// Static search index - will be populated from page titles
const SEARCH_PAGES: SearchResult[] = [
  { title: 'Installation', url: '/docs/getting-started/installation', summary: 'Install NestLens package' },
  { title: 'Quick Start', url: '/docs/getting-started/quick-start', summary: 'Get started in 3 steps' },
  { title: 'First Steps', url: '/docs/getting-started/first-steps', summary: 'Your first NestLens experience' },
  { title: 'Basic Configuration', url: '/docs/configuration/basic-config', summary: 'Configure NestLens module' },
  { title: 'Authorization', url: '/docs/configuration/authorization', summary: 'Access control settings' },
  { title: 'Storage', url: '/docs/configuration/storage', summary: 'SQLite storage configuration' },
  { title: 'Pruning', url: '/docs/configuration/pruning', summary: 'Auto-cleanup old entries' },
  { title: 'Watchers Overview', url: '/docs/watchers/overview', summary: 'All 18 watchers explained' },
  { title: 'Request Watcher', url: '/docs/watchers/request', summary: 'HTTP requests monitoring' },
  { title: 'Query Watcher', url: '/docs/watchers/query', summary: 'Database query tracking' },
  { title: 'Exception Watcher', url: '/docs/watchers/exception', summary: 'Error and exception tracking' },
  { title: 'Log Watcher', url: '/docs/watchers/log', summary: 'Application logs' },
  { title: 'Job Watcher', url: '/docs/watchers/job', summary: 'Queue job monitoring' },
  { title: 'Schedule Watcher', url: '/docs/watchers/schedule', summary: 'Cron task tracking' },
  { title: 'Cache Watcher', url: '/docs/watchers/cache', summary: 'Cache operations' },
  { title: 'Mail Watcher', url: '/docs/watchers/mail', summary: 'Email sending tracking' },
  { title: 'HTTP Client Watcher', url: '/docs/watchers/http-client', summary: 'Outgoing HTTP requests' },
  { title: 'Redis Watcher', url: '/docs/watchers/redis', summary: 'Redis commands' },
  { title: 'Model Watcher', url: '/docs/watchers/model', summary: 'ORM operations' },
  { title: 'Event Watcher', url: '/docs/watchers/event', summary: 'Event emitter tracking' },
  { title: 'Gate Watcher', url: '/docs/watchers/gate', summary: 'Authorization checks' },
  { title: 'Notification Watcher', url: '/docs/watchers/notification', summary: 'Multi-channel notifications' },
  { title: 'View Watcher', url: '/docs/watchers/view', summary: 'Template rendering' },
  { title: 'Command Watcher', url: '/docs/watchers/command', summary: 'CQRS commands' },
  { title: 'Batch Watcher', url: '/docs/watchers/batch', summary: 'Bulk operations' },
  { title: 'Dump Watcher', url: '/docs/watchers/dump', summary: 'Data exports' },
  { title: 'Dashboard Overview', url: '/docs/dashboard/overview', summary: 'Dashboard features' },
  { title: 'TypeORM Integration', url: '/docs/integrations/typeorm', summary: 'TypeORM setup' },
  { title: 'Prisma Integration', url: '/docs/integrations/prisma', summary: 'Prisma setup' },
  { title: 'Access Control', url: '/docs/security/access-control', summary: 'Security settings' },
  { title: 'API Reference', url: '/docs/api', summary: 'Full API documentation' },
];

export default function SearchBar(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const history = useHistory();
  const isBrowser = useIsBrowser();

  // Open modal
  const openSearch = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
  }, []);

  // Close modal
  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD+K or CTRL+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          closeSearch();
        } else {
          openSearch();
        }
      }

      // ESC to close
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closeSearch();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openSearch, closeSearch]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard navigation in results
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = query ? results : QUICK_LINKS;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && items[selectedIndex]) {
      e.preventDefault();
      history.push(items[selectedIndex].url);
      closeSearch();
    }
  }, [results, selectedIndex, history, closeSearch, query]);

  // Search functionality
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    const searchQuery = query.toLowerCase();
    const filtered = SEARCH_PAGES
      .filter(page => {
        const title = page.title.toLowerCase();
        const summary = (page.summary || '').toLowerCase();
        return title.includes(searchQuery) || summary.includes(searchQuery);
      })
      .slice(0, 8);

    setResults(filtered);
    setSelectedIndex(0);
  }, [query]);

  // Trigger button in navbar
  const SearchTrigger = (
    <button
      type="button"
      className={styles.searchTrigger}
      onClick={openSearch}
      aria-label="Search"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={styles.searchIcon}>
        <path
          d="M8.5 3a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 8.5a6.5 6.5 0 1111.436 4.23l3.917 3.917a.5.5 0 01-.707.707l-3.917-3.917A6.5 6.5 0 012 8.5z"
          fill="currentColor"
        />
      </svg>
      <span className={styles.searchPlaceholder}>Search</span>
      <span className={styles.searchShortcut}>
        <kbd>⌘</kbd>
        <kbd>K</kbd>
      </span>
    </button>
  );

  // Modal content
  const SearchModal = isOpen && isBrowser ? createPortal(
    <div className={styles.modalOverlay} onClick={closeSearch}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.searchHeader}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={styles.inputIcon}>
            <path
              d="M8.5 3a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 8.5a6.5 6.5 0 1111.436 4.23l3.917 3.917a.5.5 0 01-.707.707l-3.917-3.917A6.5 6.5 0 012 8.5z"
              fill="currentColor"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search documentation..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className={styles.closeButton} onClick={closeSearch}>
            <kbd>ESC</kbd>
          </button>
        </div>

        <div className={styles.searchBody}>
          {query && results.length === 0 && (
            <div className={styles.noResults}>
              <p>No results found for "<strong>{query}</strong>"</p>
              <p className={styles.noResultsHint}>Try different keywords or check your spelling</p>
            </div>
          )}

          {results.length > 0 && (
            <ul className={styles.resultsList}>
              {results.map((result, index) => (
                <li key={result.url}>
                  <a
                    href={result.url}
                    className={`${styles.resultItem} ${index === selectedIndex ? styles.selected : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      history.push(result.url);
                      closeSearch();
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className={styles.resultIcon}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10,9 9,9 8,9"/>
                      </svg>
                    </div>
                    <div className={styles.resultContent}>
                      <div className={styles.resultTitle}>{result.title}</div>
                      {result.summary && (
                        <div className={styles.resultSummary}>{result.summary}...</div>
                      )}
                    </div>
                    <div className={styles.resultArrow}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {!query && (
            <div className={styles.quickLinks}>
              <p className={styles.quickLinksTitle}>Quick Links</p>
              <ul className={styles.resultsList}>
                {QUICK_LINKS.map((link, index) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      className={`${styles.resultItem} ${index === selectedIndex ? styles.selected : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        history.push(link.url);
                        closeSearch();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className={styles.resultIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14,2 14,8 20,8"/>
                        </svg>
                      </div>
                      <div className={styles.resultContent}>
                        <div className={styles.resultTitle}>{link.title}</div>
                      </div>
                      <div className={styles.resultArrow}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.searchFooter}>
          <div className={styles.footerHint}>
            <kbd>↑</kbd><kbd>↓</kbd> to navigate
            <kbd>↵</kbd> to select
            <kbd>esc</kbd> to close
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {SearchTrigger}
      {SearchModal}
    </>
  );
}
