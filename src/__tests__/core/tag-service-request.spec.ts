/**
 * What a request entry gets tagged with.
 *
 * Two things were decided by guessing rather than by what the request watcher
 * already worked out:
 *
 * - GraphQL was recognised by `path.includes('/graphql')`. An application
 *   serving GraphQL at `/api/gql` had its operations tagged `POST`, and a REST
 *   route named `/graphql-docs` had its `GET` tag withheld. The watcher sets
 *   `isGraphQL` after inspecting the method, the content type and the body; the
 *   storage layer has always read that flag, and this was the last place that
 *   did not.
 * - A caller's own `tags` were appended without checking, so a tag that
 *   repeated a derived one appeared twice.
 */
import { TagService } from '../../core/tag.service';
import { StorageInterface } from '../../core/storage/storage.interface';
import { Entry } from '../../types';

const storage = {
  addTags: jest.fn(async () => undefined),
} as unknown as StorageInterface;

const service = new TagService(storage);

const request = (payload: Record<string, unknown>): Entry =>
  ({ id: 1, type: 'request', payload }) as unknown as Entry;

describe('tagging a request', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('the HTTP method tag', () => {
    it('is withheld from a GraphQL operation', async () => {
      const tags = await service.autoTag(
        request({ method: 'POST', path: '/graphql', statusCode: 200, isGraphQL: true }),
      );

      expect(tags).not.toContain('POST');
    });

    it('is withheld however the GraphQL route is spelled', async () => {
      // The flag says so; the path says nothing.
      const tags = await service.autoTag(
        request({ method: 'POST', path: '/api/gql', statusCode: 200, isGraphQL: true }),
      );

      expect(tags).not.toContain('POST');
    });

    it('is applied to a route that merely has graphql in its name', async () => {
      const tags = await service.autoTag(
        request({ method: 'GET', path: '/graphql-docs', statusCode: 200, isGraphQL: false }),
      );

      expect(tags).toContain('GET');
    });

    it('is applied to an ordinary request', async () => {
      const tags = await service.autoTag(
        request({ method: 'get', path: '/users', statusCode: 200 }),
      );

      expect(tags).toContain('GET');
    });
  });

  describe('status tags', () => {
    it.each([
      [200, 'SUCCESS'],
      [301, 'REDIRECT'],
      [404, 'CLIENT-ERROR'],
      [500, 'ERROR'],
    ])('tags %i as %s', async (statusCode, expected) => {
      const tags = await service.autoTag(request({ method: 'GET', path: '/x', statusCode }));

      expect(tags).toContain(expected);
    });
  });

  describe("a caller's own tags", () => {
    it('are included', async () => {
      const tags = await service.autoTag(
        request({ method: 'GET', path: '/x', statusCode: 200, tags: ['vip'] }),
      );

      expect(tags).toContain('VIP');
    });

    it('do not repeat a tag already derived', async () => {
      const tags = await service.autoTag(
        request({ method: 'GET', path: '/x', statusCode: 200, tags: ['success', 'SUCCESS'] }),
      );

      expect(tags.filter((t) => t === 'SUCCESS')).toHaveLength(1);
    });

    it('leave the list with no duplicates at all', async () => {
      const tags = await service.autoTag(
        request({ method: 'GET', path: '/x', statusCode: 200, tags: ['get', 'vip', 'vip'] }),
      );

      expect(new Set(tags).size).toBe(tags.length);
    });
  });

  it('marks a slow request', async () => {
    const tags = await service.autoTag(
      request({ method: 'GET', path: '/x', statusCode: 200, duration: 1500 }),
    );

    expect(tags).toContain('SLOW');
  });

  it('records the user it was made by', async () => {
    const tags = await service.autoTag(
      request({ method: 'GET', path: '/x', statusCode: 200, user: { id: 'u7' } }),
    );

    // The id is kept as the application wrote it here; the storage layer
    // normalises tags on the way in, which is where `USER:U7` comes from.
    expect(tags).toContain('USER:u7');
  });
});
