import { MailPayload } from '../types';

/**
 * Format email addresses for RFC 2822 header
 */
function formatAddresses(addresses: string | string[]): string {
  if (Array.isArray(addresses)) {
    return addresses.join(', ');
  }
  return addresses;
}

/**
 * Encode string for RFC 2047 if it contains non-ASCII characters
 */
function encodeSubject(subject: string): string {
  // Check if subject contains non-ASCII characters
  const hasNonAscii = /[^\x00-\x7F]/.test(subject);
  if (hasNonAscii) {
    // Use UTF-8 Base64 encoding for subjects with non-ASCII characters
    const encoded = btoa(unescape(encodeURIComponent(subject)));
    return `=?UTF-8?B?${encoded}?=`;
  }
  return subject;
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `<${timestamp}.${random}@nestlens.local>`;
}

/**
 * Generate .eml file content from mail payload
 * EML format follows RFC 2822 specification
 */
export function generateEmlContent(payload: MailPayload, createdAt: string): string {
  const lines: string[] = [];
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const hasMultipleParts = payload.html && payload.text;

  // Required headers
  if (payload.from) {
    lines.push(`From: ${payload.from}`);
  }
  lines.push(`To: ${formatAddresses(payload.to)}`);
  if (payload.cc) {
    lines.push(`Cc: ${formatAddresses(payload.cc)}`);
  }
  if (payload.bcc) {
    lines.push(`Bcc: ${formatAddresses(payload.bcc)}`);
  }
  lines.push(`Subject: ${encodeSubject(payload.subject)}`);
  lines.push(`Date: ${new Date(createdAt).toUTCString()}`);
  lines.push(`Message-ID: ${generateMessageId()}`);
  lines.push('MIME-Version: 1.0');
  lines.push('X-NestLens-Status: ' + payload.status);
  if (payload.duration) {
    lines.push('X-NestLens-Duration: ' + payload.duration + 'ms');
  }

  if (hasMultipleParts) {
    // Multipart message with both HTML and plain text
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');

    // Plain text part
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset=utf-8');
    lines.push('Content-Transfer-Encoding: 8bit');
    lines.push('');
    lines.push(payload.text || '');
    lines.push('');

    // HTML part
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('Content-Transfer-Encoding: 8bit');
    lines.push('');
    lines.push(payload.html || '');
    lines.push('');

    // End boundary
    lines.push(`--${boundary}--`);
  } else if (payload.html) {
    // HTML only
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('Content-Transfer-Encoding: 8bit');
    lines.push('');
    lines.push(payload.html);
  } else {
    // Plain text only (or empty)
    lines.push('Content-Type: text/plain; charset=utf-8');
    lines.push('Content-Transfer-Encoding: 8bit');
    lines.push('');
    lines.push(payload.text || '');
  }

  return lines.join('\r\n');
}

/**
 * Download mail entry as .eml file
 */
export function downloadAsEml(payload: MailPayload, createdAt: string, filename?: string): void {
  const emlContent = generateEmlContent(payload, createdAt);
  const blob = new Blob([emlContent], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `mail-${payload.subject.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.eml`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL object
  URL.revokeObjectURL(url);
}
