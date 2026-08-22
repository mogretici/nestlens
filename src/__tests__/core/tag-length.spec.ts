/**
 * A tag NestLens writes has to be as bounded as one a reader writes.
 *
 * The API has capped a reader's tags at a hundred characters since they were
 * given a validator. The tags the library writes itself were not capped at
 * all, and every one of them is built from application data — an event's name,
 * a queue, an entity, a template, a user id:
 *
 * ```text
 * emit('x'.repeat(5000), …)   ->  a 5,000-character tag, on every such entry
 * ```
 *
 * stored per entry, indexed by tag in all three backends, and listed in the
 * dashboard's tag filter.
 */
import { MAX_TAG_LENGTH } from '../../core/storage/tag-normalization';
import { StorageInterface } from '../../core/storage/storage.interface';
import { TagService } from '../../core/tag.service';
import { Entry } from '../../types';

const written: string[] = [];

const service = (): TagService =>
  new TagService({
    addTags: async (_id: number, tags: string[]) => void written.push(...tags),
  } as unknown as StorageInterface);

beforeEach(() => {
  written.length = 0;
});

const tag = async (entry: Partial<Entry>): Promise<string[]> =>
  service().autoTag({ id: 1, ...entry } as Entry);

describe('the length of a tag NestLens writes', () => {
  const long = 'x'.repeat(5_000);

  it.each([
    [
      'an event name',
      { type: 'event', payload: { name: long, payload: {}, listeners: [], duration: 1 } },
    ],
    [
      'a user id',
      {
        type: 'request',
        payload: {
          method: 'GET',
          url: '/x',
          path: '/x',
          statusCode: 200,
          duration: 1,
          user: { id: long },
        },
      },
    ],
    [
      'a queue',
      { type: 'job', payload: { name: 'j', queue: long, status: 'completed', attempts: 1 } },
    ],
    [
      'an entity',
      { type: 'model', payload: { action: 'save', entity: long, source: 'typeorm', duration: 1 } },
    ],
    [
      'a hostname',
      {
        type: 'http-client',
        payload: { method: 'GET', url: 'https://x/y', hostname: long, path: '/y', duration: 1 },
      },
    ],
  ])('bounds one built from %s', async (_name, entry) => {
    const tags = await tag(entry as Partial<Entry>);

    expect(Math.max(...tags.map((value) => value.length))).toBeLessThanOrEqual(MAX_TAG_LENGTH);
  });

  it('writes what it returns', async () => {
    await tag({
      type: 'event',
      payload: { name: long, payload: {}, listeners: [], duration: 1 },
    } as Partial<Entry>);

    expect(Math.max(...written.map((value) => value.length))).toBeLessThanOrEqual(MAX_TAG_LENGTH);
  });

  it('says a tag was cut rather than pretending it is the whole name', async () => {
    const [first] = await tag({
      type: 'event',
      payload: { name: long, payload: {}, listeners: [], duration: 1 },
    } as Partial<Entry>);

    expect(first.endsWith('…')).toBe(true);
  });

  it('leaves an ordinary tag exactly as it was', async () => {
    const tags = await tag({
      type: 'event',
      payload: { name: 'order.created', payload: {}, listeners: [], duration: 1 },
    } as Partial<Entry>);

    expect(tags).toContain('ORDER.CREATED');
  });

  it('leaves one of exactly the limit alone', async () => {
    const name = 'a'.repeat(MAX_TAG_LENGTH);

    const tags = await tag({
      type: 'event',
      payload: { name, payload: {}, listeners: [], duration: 1 },
    } as Partial<Entry>);

    expect(tags).toContain(name.toUpperCase());
  });
});
