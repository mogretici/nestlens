/**
 * Data masking.
 *
 * NestLens records request bodies, headers and user objects as the application
 * receives them, so this is what stands between a credential and permanent
 * storage. It had no tests of its own — the only coverage was a GraphQL header
 * spec — and the gap hid a real one: matching was an exact comparison against a
 * list holding `password`, `access_token` and `secret`, while payloads hold
 * `confirmPassword`, `accessToken` and `clientSecret`. Every one of those was
 * written down in the clear.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { DataMaskerService } from '../../core/data-masker.service';

describe('DataMaskerService', () => {
  const masker = new DataMaskerService();
  const MASK = '***REDACTED***';

  describe('field names as payloads actually write them', () => {
    /**
     * The regression. Each of these is a name in ordinary use, and none of them
     * is in the term list verbatim — they contain a term, or spell it in
     * another case.
     */
    it.each([
      'confirmPassword',
      'currentPassword',
      'newPassword',
      'password_confirmation',
      'accessToken',
      'refreshToken',
      'clientSecret',
      'stripeSecretKey',
      'API_KEY',
    ])('masks %s', (fieldName) => {
      // Act
      const masked = masker.maskBody({ [fieldName]: 'hunter2' }) as Record<string, unknown>;

      // Assert
      expect(masked[fieldName]).toBe(MASK);
      expect(JSON.stringify(masked)).not.toContain('hunter2');
    });

    it('leaves ordinary fields readable', () => {
      // Arrange - a debugging tool that masks everything is not a debugging tool
      const body = { email: 'user@example.com', quantity: 3, title: 'Widget' };

      // Act
      const masked = masker.maskBody(body);

      // Assert
      expect(masked).toEqual(body);
    });
  });

  describe('where the secret is nested', () => {
    it('reaches through objects', () => {
      // Act
      const masked = masker.maskBody({ user: { profile: { password: 'hunter2' } } });

      // Assert
      expect(JSON.stringify(masked)).not.toContain('hunter2');
    });

    it('reaches through arrays of objects', () => {
      // Act
      const masked = masker.maskBody({ users: [{ apiKey: 'sk_live_1' }, { name: 'ok' }] });

      // Assert
      expect(JSON.stringify(masked)).not.toContain('sk_live_1');
      expect(JSON.stringify(masked)).toContain('ok');
    });

    /**
     * A body that arrived as text — a raw or unparsed payload — is still JSON
     * that can be read, masked and written back.
     */
    it('reaches into a body that is still a string', () => {
      // Act
      const masked = masker.maskBody(JSON.stringify({ password: 'hunter2' }));

      // Assert
      expect(masked).toBe(JSON.stringify({ password: MASK }));
    });

    it('leaves text it cannot parse alone', () => {
      // Act & Assert - unchanged rather than mangled into a map of characters
      expect(masker.maskBody('plain text body')).toBe('plain text body');
    });
  });

  describe('headers', () => {
    it('masks the ones that carry credentials, in any spelling', () => {
      // Act
      const masked = masker.maskHeaders({
        Authorization: 'Bearer eyJhbGciOi',
        'X-Api-Key': 'sk_live_1',
        'proxy-authorization': 'Basic abc',
        'content-type': 'application/json',
      });

      // Assert
      expect(masked['Authorization']).toBe(MASK);
      expect(masked['X-Api-Key']).toBe(MASK);
      expect(masked['proxy-authorization']).toBe(MASK);
      expect(masked['content-type']).toBe('application/json');
    });
  });

  describe('user objects', () => {
    it('keeps who the user is and drops what proves it', () => {
      // Act
      const masked = masker.maskUserInfo({
        id: 42,
        email: 'user@example.com',
        hashedPassword: 'argon2id$v=19$...',
        apiKey: 'sk_live_1',
      });

      // Assert
      expect(masked).toMatchObject({ id: 42, email: 'user@example.com' });
      expect(JSON.stringify(masked)).not.toContain('argon2id');
      expect(JSON.stringify(masked)).not.toContain('sk_live_1');
    });
  });

  describe('configuration', () => {
    it('adds the terms an application names', () => {
      // Arrange
      const custom = new DataMaskerService({ sensitiveParams: ['tenantSalt'] });

      // Act
      const masked = custom.maskBody({ tenantSaltValue: 'nacl', keep: 'yes' }) as Record<
        string,
        unknown
      >;

      // Assert
      expect(masked.tenantSaltValue).toBe(MASK);
      expect(masked.keep).toBe('yes');
    });

    it('uses the replacement it was given', () => {
      // Arrange
      const custom = new DataMaskerService({ maskReplacement: '[hidden]' });

      // Act
      const masked = custom.maskBody({ password: 'hunter2' }) as Record<string, unknown>;

      // Assert
      expect(masked.password).toBe('[hidden]');
    });
  });
});
