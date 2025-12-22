import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'NestLens',
  tagline: 'Laravel Telescope-like debugging and monitoring for NestJS',
  favicon: 'img/favicon.ico',

  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/img/favicon-32.png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/img/favicon-16.png',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/img/apple-touch-icon.png',
      },
    },
  ],

  future: {
    v4: true,
  },

  url: 'https://nestlens-docs.vercel.app',
  baseUrl: '/',

  organizationName: 'mogretici',
  projectName: 'nestlens',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  trailingSlash: false,

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: ['../src/index.ts'],
        tsconfig: '../tsconfig.json',
        out: 'api',
        excludePrivate: true,
        excludeProtected: true,
        excludeInternal: true,
        readme: 'none',
      },
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['en'],
        indexDocs: true,
        indexBlog: false,
        indexPages: true,
        docsRouteBasePath: '/docs',
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 8,
        searchResultContextMaxLength: 50,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/mogretici/nestlens/tree/main/docs/',
          remarkPlugins: [
            [require('@docusaurus/remark-plugin-npm2yarn'), { sync: true }],
          ],
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/nestlens-social-card.png',
    ogImage: 'img/nestlens-social-card.png',
    metadata: [
      { name: 'keywords', content: 'nestjs, debugging, monitoring, telescope, devtools, typescript' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'NestLens',
      logo: {
        alt: 'NestLens Logo',
        src: 'img/logo.svg',
        srcDark: 'img/logo-dark.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/docs/api',
          label: 'API',
          position: 'left',
        },
        {
          href: 'https://github.com/mogretici/nestlens',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
        {
          href: 'https://www.npmjs.com/package/nestlens',
          position: 'right',
          className: 'header-npm-link',
          'aria-label': 'npm package',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started/installation',
            },
            {
              label: 'Watchers',
              to: '/docs/watchers/overview',
            },
            {
              label: 'API Reference',
              to: '/docs/api',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/mogretici/nestlens/discussions',
            },
            {
              label: 'Issues',
              href: 'https://github.com/mogretici/nestlens/issues',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/mogretici/nestlens',
            },
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/nestlens',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} NestLens. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'typescript', 'json', 'sql'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
