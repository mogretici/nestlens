#!/usr/bin/env node
/**
 * Measures what the GraphQL sanitizer costs per captured operation.
 *
 * The HTTP benchmark next door measures an empty controller, so it never
 * touches this code — which is where the time actually goes once
 * `watchers.graphql.captureResponse` is on. A 20-item feed carries a few
 * thousand key occurrences and every one of them is tested against every
 * configured pattern, so a regression here is invisible to every other number
 * this repository prints.
 *
 * Run against the built library:
 *   npm run build:lib && npm run benchmark:sanitizer
 */
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const { sanitizeResponse, sanitizeVariables } = require('../dist/watchers/graphql/utils/variable-sanitizer.js');
const { DataMaskerService } = require('../dist/core/data-masker.service.js');
const { GRAPHQL_DEFAULTS } = require('../dist/watchers/graphql/types.js');

const PATTERNS = GRAPHQL_DEFAULTS.sensitiveVariables;

const us = (value) => `${value.toFixed(1)} µs`;
const ms = (value) => `${value.toFixed(2)} ms`;

/**
 * Times `fn` and returns microseconds per call.
 *
 * Warmed first so the figure describes optimised code rather than the
 * interpreter still deciding what to do with it.
 */
function time(fn, iterations, warmup = Math.max(1, Math.floor(iterations / 10))) {
  for (let i = 0; i < warmup; i += 1) fn();

  const started = performance.now();
  for (let i = 0; i < iterations; i += 1) fn();
  return ((performance.now() - started) * 1000) / iterations;
}

/**
 * A feed response shaped like the ones this watcher actually sees.
 *
 * Deliberately carries the names that a substring matcher gets wrong —
 * `shippingAddress`, `shoppingCart`, `tokenCount`, `isPinned`, `topping`,
 * `spinner`, `secretary` — alongside the ones it must catch, so the fixture
 * doubles as a record of the two directions.
 */
function buildFeedResponse(items = 20) {
  return {
    feed: {
      __typename: 'FeedConnection',
      totalCount: items * 7,
      pageInfo: {
        __typename: 'PageInfo',
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: 'Y3Vyc29yOjA=',
        endCursor: 'Y3Vyc29yOjE5',
      },
      edges: Array.from({ length: items }, (_, i) => ({
        __typename: 'FeedEdge',
        cursor: `Y3Vyc29yOjke${i}`,
        node: {
          __typename: 'Outfit',
          id: `outfit-${i}`,
          title: `Autumn layering ${i}`,
          description: 'A caption of the length a real post carries, give or take.',
          createdAt: '2026-08-01T10:00:00.000Z',
          updatedAt: '2026-08-02T10:00:00.000Z',
          likeCount: i * 3,
          commentCount: i % 4,
          shareCount: i % 5,
          tokenCount: i,
          isPinned: i === 0,
          shoppingCart: {
            __typename: 'Cart',
            itemCount: 2,
            currency: 'TRY',
            subtotal: 1299.9,
          },
          shippingAddress: {
            __typename: 'Address',
            line1: 'Bagdat Caddesi 1',
            line2: 'Daire 4',
            city: 'Istanbul',
            postalCode: '34710',
            country: 'TR',
          },
          author: {
            __typename: 'User',
            id: `user-${i}`,
            username: `wearer${i}`,
            displayName: `Wearer ${i}`,
            avatarUrl: 'https://cdn.example.com/a.jpg',
            followerCount: 100 + i,
            followingCount: 50,
            email: `wearer${i}@example.com`,
            password: 'hunter2',
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.sig',
            refreshToken: 'rt_9f3c1a77c0de4f2a',
            apiKey: 'ak_live_51H8xY2eZvKYlo2C',
          },
          products: Array.from({ length: 4 }, (_, p) => ({
            __typename: 'Product',
            id: `product-${i}-${p}`,
            title: `Wool coat ${p}`,
            brand: 'Example',
            price: 4990 + p,
            currency: 'TRY',
            inStock: true,
            imageUrl: 'https://cdn.example.com/p.jpg',
            topping: null,
            spinner: false,
            secretary: null,
          })),
          comments: Array.from({ length: 3 }, (_, c) => ({
            __typename: 'Comment',
            id: `comment-${i}-${c}`,
            body: 'Where is the coat from?',
            createdAt: '2026-08-01T10:00:00.000Z',
            author: {
              __typename: 'User',
              id: `user-${c}`,
              username: `asker${c}`,
              avatarUrl: 'https://cdn.example.com/b.jpg',
            },
          })),
        },
      })),
    },
  };
}

/** Counts key occurrences and distinct key names, which is what the memo trades on. */
function describeKeys(value, seen = new Set(), counter = { total: 0 }) {
  if (Array.isArray(value)) {
    for (const item of value) describeKeys(item, seen, counter);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      counter.total += 1;
      seen.add(key);
      describeKeys(child, seen, counter);
    }
  }
  return { occurrences: counter.total, distinct: seen.size };
}

/** A payload of roughly `targetKb` kilobytes, used to price the size probe. */
function buildPayloadOfSize(targetKb) {
  const rows = [];
  let bytes = 0;
  let i = 0;
  while (bytes < targetKb * 1024) {
    const row = {
      __typename: 'Row',
      id: `row-${i}`,
      label: `Row number ${i} with enough text to weigh something`,
      value: i * 1.5,
      createdAt: '2026-08-01T10:00:00.000Z',
    };
    rows.push(row);
    bytes += JSON.stringify(row).length;
    i += 1;
  }
  return { rows };
}

export function runSanitizerBenchmark() {
  const feed = buildFeedResponse();
  const { occurrences, distinct } = describeKeys(feed);
  const feedBytes = JSON.stringify(feed).length;

  console.log('\nGraphQL sanitizer');
  console.log(
    `  fixture            20-item feed, ${feedBytes.toLocaleString('en-US')} bytes, ` +
      `${occurrences.toLocaleString('en-US')} key occurrences over ${distinct} distinct names`,
  );
  console.log(`  patterns           ${PATTERNS.length} configured`);

  const perCall = time(() => sanitizeResponse(feed, PATTERNS, 64 * 1024 * 1024), 200);
  console.log(`\n  sanitizeResponse   ${us(perCall)} per operation`);

  // Key matching in isolation: one flat object holding every distinct name once,
  // repeated, so the figure is the matcher rather than the tree walk.
  const flatKeys = {};
  const collect = (value) => {
    if (Array.isArray(value)) return value.forEach(collect);
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        flatKeys[key] = 1;
        collect(child);
      }
    }
  };
  collect(feed);
  const matcher = time(() => sanitizeVariables(flatKeys, PATTERNS), 2000);
  console.log(`  key matching       ${us(matcher)} for ${Object.keys(flatKeys).length} distinct names`);

  // The masker runs after the watcher has already produced a clean copy.
  const masker = new DataMaskerService();
  const sanitized = sanitizeResponse(feed, PATTERNS, 64 * 1024 * 1024);
  const secondPass = time(() => masker.maskBody(sanitized), 200);
  console.log(`  collector re-mask  ${us(secondPass)} on the already-sanitised copy`);

  console.log('\n  Size probe — what a raised maxResponseSize costs per operation');
  for (const kb of [70, 279, 975, 4875]) {
    const payload = buildPayloadOfSize(kb);
    const actualKb = Math.round(JSON.stringify(payload).length / 1024);
    const iterations = kb > 1000 ? 20 : 100;

    // Over the limit: the watcher stores a marker, so this is pure overhead.
    const rejected = time(() => sanitizeResponse(payload, PATTERNS, 64 * 1024), iterations);
    // Under the limit: the payload is probed, sanitised and then stored.
    const captured = time(() => sanitizeResponse(payload, PATTERNS, 16 * 1024 * 1024), iterations);

    console.log(
      `    ${String(actualKb).padStart(4)} KB   rejected ${ms(rejected / 1000).padStart(9)}` +
        `   captured ${ms(captured / 1000).padStart(9)}`,
    );
  }
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(
    `\nNestLens sanitizer benchmark — Node ${process.version}, ${process.platform}/${process.arch}`,
  );
  runSanitizerBenchmark();
}
