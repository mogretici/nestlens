/**
 * Every shape a thrown thing can take, and what the caller is told.
 *
 * The filter is the last thing between an exception and the reader, and most
 * of its branches had never been run: a `NestLensApiException`, a
 * `ValidationPipe`'s array of messages, a response body that is a bare string,
 * a plain `Error`, and something thrown that is not an error at all. What
 * separates them is the code, the message, and whether a stack goes out —
 * which is the part that reaches somebody who has just been refused.
 */
import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { NestLensApiExceptionFilter } from '../../api/filters/api-exception.filter';
import { NestLensApiException } from '../../api/exceptions';
import { ErrorCode } from '../../api/constants';

interface Sent {
  body: {
    success: boolean;
    error: { code: string; message: string; stack?: string; details?: unknown };
  };
  status: number;
}

/** Catches one exception and returns what was written to the response. */
const catchIt = (exception: unknown, nodeEnv?: string): Sent => {
  const before = process.env.NODE_ENV;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;

  try {
    const sent: Partial<Sent> = {};
    const host = new HttpAdapterHost();
    host.httpAdapter = {
      reply: (_response: unknown, body: Sent['body'], status: number) => {
        sent.body = body;
        sent.status = status;
      },
    } as never;

    const filter = new NestLensApiExceptionFilter(host);

    filter.catch(exception, {
      switchToHttp: () => ({
        getResponse: () => ({}),
        getRequest: () => ({ _startTime: Date.now() }),
      }),
    } as unknown as ArgumentsHost);

    return sent as Sent;
  } finally {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  }
};

describe('what the API says about an exception', () => {
  describe("one of NestLens's own", () => {
    it('carries its code and its status', () => {
      const sent = catchIt(new NestLensApiException(ErrorCode.ENTRY_NOT_FOUND));

      expect(sent.status).toBe(404);
      expect(sent.body.error.code).toBe('ERR_ENTRY_NOT_FOUND');
    });

    it('carries the details it was given', () => {
      const sent = catchIt(
        new NestLensApiException(ErrorCode.VALIDATION_ERROR, 'bad limit', { limit: 'nope' }),
      );

      expect(sent.body.error.message).toBe('bad limit');
      expect(sent.body.error.details).toEqual({ limit: 'nope' });
    });

    it('sends no stack for a fault of the caller', () => {
      const sent = catchIt(new NestLensApiException(ErrorCode.BAD_REQUEST), 'development');

      expect(sent.body.error.stack).toBeUndefined();
    });
  });

  describe('a validation failure', () => {
    const validation = new BadRequestException({
      message: ['limit must be a number', 'type must be one of …'],
      error: 'Bad Request',
      statusCode: 400,
    });

    it('joins the messages into one sentence', () => {
      const sent = catchIt(validation);

      expect(sent.body.error.message).toContain('limit must be a number');
      expect(sent.body.error.message).toContain('type must be one of');
    });

    it('keeps them apart in the details', () => {
      const sent = catchIt(validation);

      expect(sent.body.error.details).toEqual({
        validationErrors: ['limit must be a number', 'type must be one of …'],
      });
    });

    it('is a bad request, not an internal error', () => {
      const sent = catchIt(validation);

      expect(sent.status).toBe(400);
      expect(sent.body.error.code).toBe('ERR_BAD_REQUEST');
    });
  });

  it('reads a response body that is a bare string', () => {
    const sent = catchIt(new NotFoundException('no such entry'));

    expect(sent.body.error.message).toBe('no such entry');
    expect(sent.body.error.code).toBe('ERR_NOT_FOUND');
  });

  describe('an error nobody expected', () => {
    it('is an internal error', () => {
      const sent = catchIt(new Error('the database fell over'));

      expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(sent.body.error.code).toBe('ERR_INTERNAL');
    });

    it('says what happened while developing', () => {
      const sent = catchIt(new Error('the database fell over'), 'development');

      expect(sent.body.error.message).toBe('the database fell over');
      expect(sent.body.error.stack).toBeDefined();
    });

    it('says nothing in particular in production', () => {
      const sent = catchIt(new Error('the database fell over'), 'production');

      expect(sent.body.error.message).toBe('An internal error occurred');
      expect(sent.body.error.stack).toBeUndefined();
    });
  });

  describe('something thrown that is not an error', () => {
    it.each([
      ['a string', 'just a string'],
      ['a number', 42],
      ['null', null],
    ])('answers %s as an internal error', (_name, thrown) => {
      const sent = catchIt(thrown);

      expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(sent.body.error.code).toBe('ERR_INTERNAL');
      expect(sent.body.error.message).toBe('An internal error occurred');
    });

    it('never sends a stack for one', () => {
      const sent = catchIt('just a string', 'development');

      expect(sent.body.error.stack).toBeUndefined();
    });
  });

  it('always answers in the documented envelope', () => {
    const sent = catchIt(new Error('x'));

    expect(sent.body).toMatchObject({ success: false, data: null });
    expect(sent.body.error).toBeDefined();
  });
});
