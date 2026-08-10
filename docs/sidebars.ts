import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/quick-start',
        'getting-started/first-steps',
        'getting-started/upgrading',
      ],
    },
    {
      type: 'category',
      label: 'Configuration',
      items: [
        'configuration/basic-config',
        'configuration/authorization',
        'configuration/storage',
        'configuration/pruning',
        'configuration/rate-limiting',
        'configuration/alerting',
      ],
    },
    {
      type: 'category',
      label: 'Watchers',
      items: [
        'watchers/overview',
        {
          type: 'category',
          label: 'HTTP',
          items: [
            'watchers/request',
            'watchers/http-client',
          ],
        },
        {
          type: 'category',
          label: 'Database',
          items: [
            'watchers/query',
            'watchers/model',
          ],
        },
        {
          type: 'category',
          label: 'Errors & Logging',
          items: [
            'watchers/exception',
            'watchers/log',
            'watchers/dump',
          ],
        },
        {
          type: 'category',
          label: 'Background Processing',
          items: [
            'watchers/job',
            'watchers/schedule',
            'watchers/batch',
            'watchers/command',
          ],
        },
        {
          type: 'category',
          label: 'Caching',
          items: [
            'watchers/cache',
            'watchers/redis',
          ],
        },
        {
          type: 'category',
          label: 'Communication',
          items: [
            'watchers/mail',
            'watchers/notification',
            'watchers/event',
          ],
        },
        {
          type: 'category',
          label: 'Other',
          items: [
            'watchers/gate',
            'watchers/view',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Dashboard',
      items: [
        'dashboard/overview',
        'dashboard/navigation',
        'dashboard/filtering',
        'dashboard/keyboard-shortcuts',
        'dashboard/live-tail',
      ],
    },
    {
      type: 'category',
      label: 'Integrations',
      items: [
        'integrations/typeorm',
        'integrations/prisma',
        'integrations/bull-bullmq',
        'integrations/redis',
        'integrations/custom-integrations',
      ],
    },
    {
      type: 'category',
      label: 'Security',
      items: [
        'security/access-control',
        'security/ip-whitelisting',
        'security/data-masking',
        'security/production-usage',
      ],
    },
    {
      type: 'category',
      label: 'Advanced',
      items: [
        'advanced/custom-watchers',
        'advanced/extending-storage',
        'advanced/filtering-entries',
        'advanced/performance',
      ],
    },
    'faq',
  ],
};

export default sidebars;
