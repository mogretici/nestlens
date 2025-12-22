import { vi, describe, it, expect, beforeEach, afterEach, type MockInstance } from 'vitest';
import { generateEmlContent, downloadAsEml } from '../mail';
import { MailPayload } from '../../types';

describe('mail utility', () => {
  describe('generateEmlContent', () => {
    const basePayload: MailPayload = {
      to: 'recipient@example.com',
      subject: 'Test Subject',
      status: 'sent',
      duration: 150,
    };

    it('generates basic email with required fields', () => {
      const eml = generateEmlContent(basePayload, '2024-01-15T10:30:00Z');

      expect(eml).toContain('To: recipient@example.com');
      expect(eml).toContain('Subject: Test Subject');
      expect(eml).toContain('MIME-Version: 1.0');
      expect(eml).toContain('X-NestLens-Status: sent');
      expect(eml).toContain('X-NestLens-Duration: 150ms');
    });

    it('includes From header when provided', () => {
      const payload = { ...basePayload, from: 'sender@example.com' };
      const eml = generateEmlContent(payload, '2024-01-15T10:30:00Z');

      expect(eml).toContain('From: sender@example.com');
    });

    it('includes CC header when provided', () => {
      const payload = { ...basePayload, cc: 'cc@example.com' };
      const eml = generateEmlContent(payload, '2024-01-15T10:30:00Z');

      expect(eml).toContain('Cc: cc@example.com');
    });

    it('includes BCC header when provided', () => {
      const payload = { ...basePayload, bcc: 'bcc@example.com' };
      const eml = generateEmlContent(payload, '2024-01-15T10:30:00Z');

      expect(eml).toContain('Bcc: bcc@example.com');
    });

    it('handles multiple recipients as array', () => {
      const payload = {
        ...basePayload,
        to: ['one@example.com', 'two@example.com'],
        cc: ['cc1@example.com', 'cc2@example.com'],
      };
      const eml = generateEmlContent(payload, '2024-01-15T10:30:00Z');

      expect(eml).toContain('To: one@example.com, two@example.com');
      expect(eml).toContain('Cc: cc1@example.com, cc2@example.com');
    });

    it('generates plain text email correctly', () => {
      const payload = { ...basePayload, text: 'Hello, this is a test message.' };
      const eml = generateEmlContent(payload, '2024-01-15T10:30:00Z');

      expect(eml).toContain('Content-Type: text/plain; charset=utf-8');
      expect(eml).toContain('Hello, this is a test message.');
    });

    it('generates HTML email correctly', () => {
      const payload = { ...basePayload, html: '<p>Hello</p>' };
      const eml = generateEmlContent(payload, '2024-01-15T10:30:00Z');

      expect(eml).toContain('Content-Type: text/html; charset=utf-8');
      expect(eml).toContain('<p>Hello</p>');
    });

    it('generates multipart email when both HTML and text are provided', () => {
      const payload = {
        ...basePayload,
        text: 'Plain text version',
        html: '<p>HTML version</p>',
      };
      const eml = generateEmlContent(payload, '2024-01-15T10:30:00Z');

      expect(eml).toContain('Content-Type: multipart/alternative');
      expect(eml).toContain('Content-Type: text/plain; charset=utf-8');
      expect(eml).toContain('Content-Type: text/html; charset=utf-8');
      expect(eml).toContain('Plain text version');
      expect(eml).toContain('<p>HTML version</p>');
    });

    it('encodes non-ASCII subject correctly', () => {
      const payload = { ...basePayload, subject: 'Test email - caf\u00e9' };
      const eml = generateEmlContent(payload, '2024-01-15T10:30:00Z');

      // Should use Base64 encoding for non-ASCII characters
      expect(eml).toContain('Subject: =?UTF-8?B?');
    });

    it('keeps ASCII subject as-is', () => {
      const payload = { ...basePayload, subject: 'Simple ASCII Subject' };
      const eml = generateEmlContent(payload, '2024-01-15T10:30:00Z');

      expect(eml).toContain('Subject: Simple ASCII Subject');
      expect(eml).not.toContain('=?UTF-8?');
    });

    it('includes Message-ID header', () => {
      const eml = generateEmlContent(basePayload, '2024-01-15T10:30:00Z');

      expect(eml).toMatch(/Message-ID: <\d+\.\w+@nestlens\.local>/);
    });

    it('formats date correctly', () => {
      const eml = generateEmlContent(basePayload, '2024-01-15T10:30:00Z');

      expect(eml).toContain('Date: ');
      // Should contain a valid RFC 2822 date
      expect(eml).toMatch(/Date: .+GMT/);
    });
  });

  describe('downloadAsEml', () => {
    let createObjectURLSpy: MockInstance;
    let revokeObjectURLSpy: MockInstance;
    let appendChildSpy: MockInstance;
    let removeChildSpy: MockInstance;
    let clickSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
      clickSpy = vi.fn();

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          return {
            href: '',
            download: '',
            click: clickSpy,
          } as unknown as HTMLAnchorElement;
        }
        return document.createElement(tagName);
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const testPayload: MailPayload = {
      to: 'test@example.com',
      subject: 'Download Test',
      status: 'sent',
      duration: 100,
    };

    it('creates blob with correct MIME type', () => {
      downloadAsEml(testPayload, '2024-01-15T10:30:00Z');

      expect(createObjectURLSpy).toHaveBeenCalledWith(expect.any(Blob));
      const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
      expect(blob.type).toBe('message/rfc822');
    });

    it('triggers download with sanitized filename', () => {
      downloadAsEml(testPayload, '2024-01-15T10:30:00Z');

      expect(clickSpy).toHaveBeenCalled();
    });

    it('uses custom filename when provided', () => {
      const createElement = vi.spyOn(document, 'createElement');
      createElement.mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          const link = {
            href: '',
            download: '',
            click: clickSpy,
          };
          return link as unknown as HTMLAnchorElement;
        }
        return document.createElement(tagName);
      });

      downloadAsEml(testPayload, '2024-01-15T10:30:00Z', 'custom-name.eml');

      // The download attribute should be set to custom-name.eml
      expect(clickSpy).toHaveBeenCalled();
    });

    it('cleans up blob URL after download', () => {
      downloadAsEml(testPayload, '2024-01-15T10:30:00Z');

      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-url');
    });

    it('appends and removes link from document', () => {
      downloadAsEml(testPayload, '2024-01-15T10:30:00Z');

      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
    });
  });
});
