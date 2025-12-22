import type { ReactNode } from 'react';
import { useState, useEffect, useRef } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

/* ===========================================
   DATA - All content data
   =========================================== */

const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: 'Real-time Monitoring',
    description: 'Watch requests, queries, and exceptions as they happen. No more console.log debugging.',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
    accent: '#0ea5e9',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    title: 'Zero Configuration',
    description: 'Import and go. Auto-detects TypeORM, Prisma, Bull, and more. No setup required.',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
    accent: '#8b5cf6',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: 'Security Built-in',
    description: 'IP whitelist, role-based access, and automatic data masking for production safety.',
    gradient: 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)',
    accent: '#10b981',
  },
];

const watcherGroups = [
  {
    name: 'HTTP & Requests',
    description: 'Track every HTTP request, catch exceptions, and monitor application logs in real-time.',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
    accent: '#0ea5e9',
    watchers: [
      { name: 'Request', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" /></svg> },
      { name: 'Exception', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg> },
      { name: 'Log', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg> },
    ],
  },
  {
    name: 'Database & Storage',
    description: 'Monitor SQL queries, cache operations, Redis commands, and ORM model changes.',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
    accent: '#8b5cf6',
    watchers: [
      { name: 'Query', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg> },
      { name: 'Cache', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" /></svg> },
      { name: 'Redis', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg> },
      { name: 'Model', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg> },
    ],
  },
  {
    name: 'Background Jobs',
    description: 'Track queue jobs, scheduled tasks, event emissions, and batch operations.',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
    accent: '#f59e0b',
    watchers: [
      { name: 'Job', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.794l-.75-1.299M7.5 4.205L12 12m6.894 5.785l-1.149-.964M6.256 7.178l-1.15-.964m15.352 8.864l-1.41-.513M4.954 9.435l-1.41-.514M12.002 12l-3.75 6.495" /></svg> },
      { name: 'Schedule', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
      { name: 'Event', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg> },
      { name: 'Batch', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" /></svg> },
    ],
  },
  {
    name: 'Communication',
    description: 'Monitor outgoing emails, HTTP client requests, and multi-channel notifications.',
    gradient: 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
    accent: '#10b981',
    watchers: [
      { name: 'Mail', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg> },
      { name: 'HTTP Client', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg> },
      { name: 'Notification', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg> },
    ],
  },
  {
    name: 'Security & System',
    description: 'Track authorization gates, CLI commands, template rendering, and data exports.',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
    accent: '#ef4444',
    watchers: [
      { name: 'Gate', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg> },
      { name: 'Command', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" /></svg> },
      { name: 'View', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
      { name: 'Dump', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg> },
    ],
  },
];

const getStartedCards = [
  {
    id: 'opensource',
    label: 'Community',
    title: 'Open Source',
    description: 'Free forever, MIT licensed. Star us on GitHub and join the community.',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
    accent: '#8b5cf6',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>,
    links: [
      { label: 'Star on GitHub', href: 'https://github.com/mogretici/nestlens' },
      { label: 'Discussions', href: 'https://github.com/mogretici/nestlens/discussions' },
      { label: 'Report Issue', href: 'https://github.com/mogretici/nestlens/issues' },
    ],
    badges: ['MIT License', 'TypeScript', 'NestJS 9+'],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    title: 'Works With Your Stack',
    description: 'Auto-detects and integrates with popular NestJS libraries out of the box.',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
    accent: '#0ea5e9',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" /></svg>,
    integrations: [
      { name: 'TypeORM', desc: 'Query & Model tracking' },
      { name: 'Prisma', desc: 'Query & Model tracking' },
      { name: 'Bull / BullMQ', desc: 'Job monitoring' },
      { name: 'Redis', desc: 'Command tracking' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    title: 'Production Ready',
    description: 'Built with security in mind. Control access, mask sensitive data, auto-cleanup.',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    accent: '#10b981',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
    features: [
      { name: 'IP Whitelist', desc: 'Restrict dashboard access' },
      { name: 'Role-based Access', desc: 'Custom authorization' },
      { name: 'Data Masking', desc: 'Hide sensitive fields' },
      { name: 'Auto Pruning', desc: 'Automatic cleanup' },
    ],
  },
];

// Total states: 4 (hero) + 5 (watchers) + 3 (getstarted) + 1 (closing) = 13
const HERO_STATES = 4;
const WATCHER_STATES = 5;
const GETSTARTED_STATES = 3;
const CLOSING_STATES = 1;
const TOTAL_STATES = HERO_STATES + WATCHER_STATES + GETSTARTED_STATES + CLOSING_STATES;

/* ===========================================
   UNIFIED SECTION COMPONENT
   =========================================== */

function UnifiedSection() {
  const [currentState, setCurrentState] = useState(0);
  const [copied, setCopied] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  // Derived states
  const phase = currentState < HERO_STATES ? 'hero'
    : currentState < HERO_STATES + WATCHER_STATES ? 'watchers'
    : currentState < HERO_STATES + WATCHER_STATES + GETSTARTED_STATES ? 'getstarted'
    : 'closing';

  const heroIndex = currentState; // 0 = dashboard, 1-3 = features
  const watcherIndex = currentState - HERO_STATES;
  const getStartedIndex = currentState - HERO_STATES - WATCHER_STATES;

  useEffect(() => {
    const handleScroll = () => {
      if (sectionRef.current) {
        const rect = sectionRef.current.getBoundingClientRect();
        const sectionHeight = sectionRef.current.offsetHeight;
        const viewportHeight = window.innerHeight;
        const scrollableHeight = sectionHeight - viewportHeight;
        const scrollProgress = Math.max(0, -rect.top) / scrollableHeight;

        const stateIndex = Math.min(
          Math.floor(scrollProgress * TOTAL_STATES),
          TOTAL_STATES - 1
        );
        setCurrentState(Math.max(0, stateIndex));
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText('npm install nestlens');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section ref={sectionRef} className={styles.unifiedSection}>
      <div className={styles.unifiedInner}>
        {/* Background */}
        <div className={styles.heroBackground}>
          <div className={styles.heroGlow} />
          <div className={styles.heroGlowSecondary} />
          <div className={styles.heroGrid} />
        </div>

        {/* =================== HERO PHASE =================== */}
        <div className={`${styles.phaseContent} ${phase === 'hero' ? styles.active : ''}`}>
          <div className={styles.heroLeft}>
            <div className={styles.heroContent}>
              <div className={styles.heroBadge}>
                <span className={styles.badgeDot} />
                <span>Open Source Debugging Tool</span>
              </div>

              <Heading as="h1" className={styles.heroTitle}>
                Debug <span className={styles.gradient}>NestJS</span>
                <br />
                Like Never Before
              </Heading>

              <p className={styles.heroSubtitle}>
                Laravel Telescope-inspired debugging and monitoring for NestJS.
                Track requests, queries, exceptions, jobs, and 14 more watchers
                with a beautiful real-time dashboard.
              </p>

              <div className={styles.installBox}>
                <div className={styles.installContent}>
                  <span className={styles.installPrompt}>$</span>
                  <code>npm install nestlens</code>
                </div>
                <button className={styles.copyButton} onClick={handleCopy} title="Copy to clipboard">
                  {copied ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                  )}
                </button>
              </div>

              <div className={styles.heroActions}>
                <Link className={styles.primaryButton} to="/docs/getting-started/installation">
                  <span>Get Started</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6.5 3.5L11 8L6.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Link>
                <Link className={styles.secondaryButton} to="https://github.com/mogretici/nestlens">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  <span>Star on GitHub</span>
                </Link>
              </div>
            </div>
          </div>

          <div className={styles.heroRight}>
            {/* Scroll Indicators */}
            <div className={styles.scrollIndicators}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`${styles.indicator} ${heroIndex === i ? styles.active : ''}`}
                  style={{ '--accent': i === 0 ? '#0ea5e9' : features[i-1]?.accent } as React.CSSProperties}
                />
              ))}
            </div>

            {/* Dashboard Preview */}
            <div className={`${styles.heroVisualCard} ${heroIndex === 0 ? styles.active : ''}`}>
              <div className={styles.dashboardPreview}>
                <div className={styles.previewHeader}>
                  <div className={styles.previewDots}><span /><span /><span /></div>
                  <span className={styles.previewUrl}>localhost:3000/nestlens</span>
                </div>
                <div className={styles.previewContent}>
                  <div className={styles.previewSidebar}>
                    <div className={`${styles.previewNavItem} ${styles.active}`}>Requests</div>
                    <div className={styles.previewNavItem}>Queries</div>
                    <div className={styles.previewNavItem}>Exceptions</div>
                    <div className={styles.previewNavItem}>Jobs</div>
                    <div className={styles.previewNavItem}>Logs</div>
                  </div>
                  <div className={styles.previewMain}>
                    {[
                      { method: 'GET', path: '/api/users', status: '200', time: '45ms', type: 'success' },
                      { method: 'POST', path: '/api/auth/login', status: '201', time: '123ms', type: 'success' },
                      { method: 'GET', path: '/api/orders/123', status: '404', time: '12ms', type: 'error' },
                      { method: 'PUT', path: '/api/users/profile', status: '200', time: '89ms', type: 'success' },
                    ].map((row, i) => (
                      <div key={i} className={`${styles.previewRow} ${styles[row.type]}`}>
                        <span className={styles.previewMethod}>{row.method}</span>
                        <span className={styles.previewPath}>{row.path}</span>
                        <span className={styles.previewStatus}>{row.status}</span>
                        <span className={styles.previewTime}>{row.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Feature Cards */}
            {features.map((feature, i) => (
              <div
                key={i}
                className={`${styles.heroVisualCard} ${styles.featureCard} ${heroIndex === i + 1 ? styles.active : ''}`}
                style={{
                  '--feature-gradient': feature.gradient,
                  '--feature-accent': feature.accent,
                } as React.CSSProperties}
              >
                <div className={styles.featureBackground}>
                  <div className={styles.featureOrb1} />
                  <div className={styles.featureOrb2} />
                  <div className={styles.featureOrb3} />
                </div>
                <div className={styles.featureBorder} />
                <div className={styles.featureCardInner}>
                  <div className={styles.featureIconWrapper}>
                    <div className={styles.featureIconGlow} />
                    <div className={styles.featureIcon}>{feature.icon}</div>
                    <div className={styles.featureIconRing} />
                  </div>
                  <h3 className={styles.featureTitle}>{feature.title}</h3>
                  <p className={styles.featureDesc}>{feature.description}</p>
                  <div className={styles.featureFloaters}>
                    <span className={styles.floater} />
                    <span className={styles.floater} />
                    <span className={styles.floater} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* =================== WATCHERS PHASE =================== */}
        <div className={`${styles.phaseContent} ${styles.watchersPhase} ${phase === 'watchers' ? styles.active : ''}`}>
          <div className={styles.watchersLeft}>
            {watcherGroups.map((group, i) => (
              <div
                key={i}
                className={`${styles.watcherGroupCard} ${watcherIndex === i ? styles.active : ''}`}
                style={{
                  '--group-gradient': group.gradient,
                  '--group-accent': group.accent,
                  '--group-shadow': `${group.accent}40`,
                } as React.CSSProperties}
              >
                <div className={styles.groupCardInner}>
                  <div className={styles.groupOrb1} />
                  <div className={styles.groupOrb2} />
                  <div className={styles.groupBorder} />
                  <div className={styles.groupContent}>
                    <div className={styles.groupHeader}>
                      <h3 className={styles.groupName}>{group.name}</h3>
                      <p className={styles.groupDescription}>{group.description}</p>
                    </div>
                    <div className={styles.groupWatchers}>
                      {group.watchers.map((watcher, j) => (
                        <Link
                          key={j}
                          to={`/docs/watchers/${watcher.name.toLowerCase().replace(' ', '-')}`}
                          className={styles.watcherItem}
                        >
                          <div className={styles.watcherIconWrapper}>
                            <div className={styles.watcherIcon}>{watcher.icon}</div>
                          </div>
                          <span className={styles.watcherName}>{watcher.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.watchersRight}>
            <span className={styles.sectionLabel}>18 Watchers</span>
            <Heading as="h2" className={styles.watchersTitle}>
              Everything Your<br />
              App Does,<br />
              <span className={styles.gradient}>Tracked.</span>
            </Heading>
            <p className={styles.watchersSubtitle}>
              From HTTP requests to background jobs, NestLens captures it all
              with specialized watchers for every part of your application.
            </p>

            <div className={styles.groupIndicators}>
              {watcherGroups.map((group, i) => (
                <button
                  key={i}
                  className={`${styles.groupIndicator} ${watcherIndex === i ? styles.active : ''}`}
                  style={{ '--indicator-color': group.accent } as React.CSSProperties}
                  onClick={() => setCurrentState(HERO_STATES + i)}
                >
                  <span className={styles.indicatorDot} />
                  <span className={styles.indicatorLabel}>{group.name}</span>
                </button>
              ))}
            </div>

            <Link to="/docs/watchers/overview" className={styles.textLink}>
              Explore all watchers
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        </div>

        {/* =================== GET STARTED PHASE =================== */}
        <div className={`${styles.phaseContent} ${phase === 'getstarted' ? styles.active : ''}`}>
          <div className={styles.getStartedLeft}>
            <span className={styles.sectionLabel}>Quick Start</span>
            <Heading as="h2" className={styles.codeTitle}>
              Three Lines to <span className={styles.gradient}>Full Visibility</span>
            </Heading>
            <p className={styles.codeDesc}>
              Import the module, start your app, and open the dashboard.
            </p>

            <div className={styles.codeWindow}>
              <div className={styles.codeWindowHeader}>
                <div className={styles.codeDots}><span /><span /><span /></div>
                <span className={styles.codeFilename}>app.module.ts</span>
              </div>
              <pre className={styles.codeContent}>
                <code>{`import { Module } from '@nestjs/common';
import { NestLensModule } from 'nestlens';

@Module({
  imports: [
    NestLensModule.forRoot({
      enabled: process.env.NODE_ENV !== 'production',
    }),
  ],
})
export class AppModule {}`}</code>
              </pre>
            </div>

            <Link to="/docs/getting-started/quick-start" className={styles.textLink}>
              Read the full guide
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>

          <div className={styles.getStartedRight}>
            {getStartedCards.map((card, i) => (
              <div
                key={card.id}
                className={`${styles.infoCard} ${getStartedIndex === i ? styles.active : ''}`}
                style={{
                  '--card-gradient': card.gradient,
                  '--card-accent': card.accent,
                } as React.CSSProperties}
              >
                <div className={styles.infoCardInner}>
                  <div className={styles.cardGlow} />
                  <div className={styles.cardPattern} />
                  <div className={styles.infoCardHeader}>
                    <span className={styles.cardLabel}>{card.label}</span>
                    <div className={styles.cardTitleRow}>
                      <div className={styles.cardIcon}>{card.icon}</div>
                      <h3 className={styles.cardTitle}>{card.title}</h3>
                    </div>
                    <p className={styles.cardDesc}>{card.description}</p>
                  </div>
                  <div className={styles.infoCardContent}>
                    {card.links && (
                      <div className={styles.cardLinks}>
                        {card.links.map((link, j) => (
                          <Link key={j} to={link.href} className={styles.cardLink}>
                            <span>{link.label}</span>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M4 12L12 4M12 4H6M12 4V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </Link>
                        ))}
                      </div>
                    )}
                    {card.integrations && (
                      <div className={styles.cardGrid}>
                        {card.integrations.map((item, j) => (
                          <div key={j} className={styles.cardGridItem}>
                            <span className={styles.gridItemName}>{item.name}</span>
                            <span className={styles.gridItemDesc}>{item.desc}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {card.features && (
                      <div className={styles.cardGrid}>
                        {card.features.map((item, j) => (
                          <div key={j} className={styles.cardGridItem}>
                            <span className={styles.gridItemName}>{item.name}</span>
                            <span className={styles.gridItemDesc}>{item.desc}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {card.badges && (
                    <div className={styles.cardBadges}>
                      {card.badges.map((badge, j) => (
                        <span key={j} className={styles.cardBadge}>{badge}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className={styles.cardIndicators}>
              {getStartedCards.map((card, i) => (
                <button
                  key={i}
                  className={`${styles.cardIndicator} ${getStartedIndex === i ? styles.active : ''}`}
                  style={{ '--indicator-color': card.accent } as React.CSSProperties}
                  onClick={() => setCurrentState(HERO_STATES + WATCHER_STATES + i)}
                >
                  <span className={styles.cardIndicatorDot} />
                  <span className={styles.cardIndicatorLabel}>{card.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* =================== CLOSING PHASE =================== */}
        <div className={`${styles.phaseContent} ${styles.closingPhase} ${phase === 'closing' ? styles.active : ''}`}>
          <div className={styles.closingContent}>
            <div className={styles.closingGlow} />

            <span className={styles.sectionLabel}>Ready?</span>
            <Heading as="h2" className={styles.closingTitle}>
              Start Debugging <span className={styles.gradient}>Today</span>
            </Heading>
            <p className={styles.closingDesc}>
              Join developers who are already using NestLens to debug their NestJS applications faster.
            </p>

            <div className={styles.closingInstall}>
              <div className={styles.installBox}>
                <div className={styles.installContent}>
                  <span className={styles.installPrompt}>$</span>
                  <code>npm install nestlens</code>
                </div>
                <button className={styles.copyButton} onClick={handleCopy} title="Copy to clipboard">
                  {copied ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className={styles.closingActions}>
              <Link className={styles.primaryButton} to="/docs/getting-started/installation">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                </svg>
                <span>Read the Docs</span>
              </Link>
              <Link className={styles.secondaryButton} to="https://github.com/mogretici/nestlens">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                <span>Star on GitHub</span>
              </Link>
              <Link className={styles.secondaryButton} to="https://www.npmjs.com/package/nestlens">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z"/>
                </svg>
                <span>View on npm</span>
              </Link>
            </div>

            <div className={styles.closingLinks}>
              <Link to="/docs/getting-started/installation" className={styles.closingLink}>
                <span className={styles.closingLinkText}>Quick Start</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
              <span className={styles.linkDivider} />
              <Link to="/docs/watchers/overview" className={styles.closingLink}>
                <span className={styles.closingLinkText}>Watchers</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
              <span className={styles.linkDivider} />
              <Link to="/docs/api" className={styles.closingLink}>
                <span className={styles.closingLinkText}>API</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </Link>
              <span className={styles.linkDivider} />
              <Link to="https://github.com/mogretici/nestlens/discussions" className={styles.closingLink}>
                <span className={styles.closingLinkText}>Community</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </Link>
            </div>

            <div className={styles.closingFooter}>
              <p>MIT License</p>
              <span className={styles.footerDot} />
              <p>TypeScript</p>
              <span className={styles.footerDot} />
              <p>NestJS 9+</p>
            </div>
          </div>
        </div>

        {/* Vertical Progress Bar */}
        <div className={styles.progressBar}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ height: `${((currentState + 1) / TOTAL_STATES) * 100}%` }}
            />
          </div>
          <div className={styles.progressPhases}>
            {[
              { id: 'hero', label: 'Intro', states: HERO_STATES },
              { id: 'watchers', label: 'Watchers', states: WATCHER_STATES },
              { id: 'getstarted', label: 'Setup', states: GETSTARTED_STATES },
              { id: 'closing', label: 'Start', states: CLOSING_STATES },
            ].map((p, i) => {
              const phaseStart = i === 0 ? 0
                : i === 1 ? HERO_STATES
                : i === 2 ? HERO_STATES + WATCHER_STATES
                : HERO_STATES + WATCHER_STATES + GETSTARTED_STATES;
              const isActive = phase === p.id;
              const isPast = currentState >= phaseStart + p.states;

              return (
                <div
                  key={p.id}
                  className={`${styles.progressPhase} ${isActive ? styles.active : ''} ${isPast ? styles.past : ''}`}
                >
                  <div className={styles.phaseDot} />
                  <span className={styles.phaseLabel}>{p.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===========================================
   MAIN EXPORT
   =========================================== */

export default function Home(): ReactNode {
  return (
    <Layout
      title="Debug and Monitor NestJS Applications"
      description="Laravel Telescope-like debugging and monitoring for NestJS. Track requests, queries, exceptions, logs, jobs, and more with a beautiful real-time dashboard.">
      <div className={styles.homePage} data-homepage="true">
        <UnifiedSection />
      </div>
    </Layout>
  );
}
