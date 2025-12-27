import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { CollectorService } from '../core/collector.service';
import {
  DEFAULT_CONFIG,
  NestLensConfig,
  NESTLENS_API_PREFIX,
  NESTLENS_CONFIG,
  RequestWatcherConfig,
} from '../nestlens.config';
import { NestLensRequest, RequestEntry, RequestUser } from '../types';

export const REQUEST_ID_HEADER = 'x-nestlens-request-id';

@Injectable()
export class RequestWatcher implements NestInterceptor {
  private readonly config: RequestWatcherConfig;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
  ) {
    const watcherConfig = nestlensConfig.watchers?.request;
    this.config =
      typeof watcherConfig === 'object'
        ? watcherConfig
        : { enabled: watcherConfig !== false };
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.config.enabled) {
      return next.handle();
    }

    // Only handle HTTP context (skip GraphQL, WebSocket, etc.)
    const contextType = context.getType<string>();
    if (contextType !== 'http') {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const request = ctx.getRequest<NestLensRequest>();
    const response = ctx.getResponse<Response>();

    // Guard against undefined request or missing path (e.g., in non-HTTP contexts)
    if (!request?.path) {
      return next.handle();
    }

    // Skip NestLens own routes (dashboard and API)
    const nestlensPath = this.nestlensConfig.path || DEFAULT_CONFIG.path;
    const apiPrefix = `/${NESTLENS_API_PREFIX}`;
    if (request.path.startsWith(nestlensPath) || request.path.startsWith(apiPrefix)) {
      return next.handle();
    }

    // Skip ignored paths
    if (this.config.ignorePaths?.some((p) => request.path.startsWith(p))) {
      return next.handle();
    }

    const requestId = uuidv4();
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    // Attach request ID to request object for correlation
    request.nestlensRequestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    // Capture headers (filtered)
    const headers = this.captureHeaders(request.headers);

    // Capture body
    const body = this.config.captureBody !== false ? this.captureBody(request.body) : undefined;

    // Capture controller/handler info (Telescope-like)
    const controllerInfo = this.captureControllerInfo(context);

    // Capture user info (Telescope-like)
    const user = this.captureUser(request);

    // Capture session (Telescope-like)
    const session = this.captureSession(request);

    // Get custom tags
    const tagsPromise = this.captureTags(request);

    // Detect if this is a GraphQL request (robust detection)
    const isGraphQL = this.isGraphQLRequest(request);

    return next.handle().pipe(
      tap({
        next: async (responseBody) => {
          const duration = Date.now() - startTime;
          const memory = process.memoryUsage().heapUsed - startMemory;

          // Capture response headers (Telescope-like)
          const responseHeaders = this.captureResponseHeaders(response);

          // Await tags
          const tags = await tagsPromise;

          const payload: RequestEntry['payload'] = {
            method: request.method,
            url: request.originalUrl || request.url,
            path: request.path,
            query: request.query as Record<string, unknown>,
            params: request.params as Record<string, unknown>,
            headers,
            body,
            ip: this.getClientIp(request),
            userAgent: request.headers['user-agent'],
            statusCode: response.statusCode,
            responseBody:
              this.config.captureResponse !== false
                ? this.captureBody(responseBody)
                : undefined,
            responseHeaders,
            duration,
            memory,
            // Telescope-like fields
            controllerAction: controllerInfo.controllerAction,
            handler: controllerInfo.handler,
            user,
            session,
            tags,
            // GraphQL detection flag
            isGraphQL,
          };

          this.collector.collect('request', payload, requestId);
        },
        error: async (error) => {
          const duration = Date.now() - startTime;
          const memory = process.memoryUsage().heapUsed - startMemory;

          // Capture response headers (Telescope-like)
          const responseHeaders = this.captureResponseHeaders(response);

          // Await tags
          const tags = await tagsPromise;

          const payload: RequestEntry['payload'] = {
            method: request.method,
            url: request.originalUrl || request.url,
            path: request.path,
            query: request.query as Record<string, unknown>,
            params: request.params as Record<string, unknown>,
            headers,
            body,
            ip: this.getClientIp(request),
            userAgent: request.headers['user-agent'],
            statusCode: error.status || 500,
            responseBody: {
              error: error.message,
              name: error.name,
            },
            responseHeaders,
            duration,
            memory,
            // Telescope-like fields
            controllerAction: controllerInfo.controllerAction,
            handler: controllerInfo.handler,
            user,
            session,
            tags,
            // GraphQL detection flag
            isGraphQL,
          };

          this.collector.collect('request', payload, requestId);
        },
      }),
    );
  }

  private captureHeaders(
    headers: Request['headers'],
  ): Record<string, string> {
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'set-cookie',
      'x-api-key',
      'x-auth-token',
    ];

    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        result[key] = '***';
      } else if (typeof value === 'string') {
        result[key] = value;
      } else if (Array.isArray(value)) {
        result[key] = value.join(', ');
      }
    }

    return result;
  }

  private captureBody(body: unknown): unknown {
    if (!body) return undefined;

    const maxSize = this.config.maxBodySize || 64 * 1024; // 64KB default

    try {
      const json = JSON.stringify(body);
      if (json.length > maxSize) {
        return { _truncated: true, _size: json.length };
      }
      return body;
    } catch {
      return { _error: 'Unable to serialize body' };
    }
  }

  private getClientIp(request: Request): string | undefined {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }
    return request.ip || request.socket?.remoteAddress;
  }

  private captureControllerInfo(context: ExecutionContext): {
    controllerAction?: string;
    handler?: string;
  } {
    if (this.config.captureControllerInfo === false) {
      return {};
    }

    try {
      const controller = context.getClass();
      const handler = context.getHandler();
      const controllerName = controller?.name;
      const handlerName = handler?.name;

      return {
        controllerAction: controllerName && handlerName
          ? `${controllerName}.${handlerName}`
          : undefined,
        handler: handlerName,
      };
    } catch {
      return {};
    }
  }

  private captureUser(request: NestLensRequest): RequestUser | undefined {
    if (this.config.captureUser === false) {
      return undefined;
    }

    try {
      const user = (request as Request & { user?: Record<string, unknown> }).user;
      if (!user) return undefined;

      // Extract common user fields
      return {
        id: (user.id ?? user._id ?? user.userId) as string | number,
        name: (user.name ?? user.username ?? user.displayName) as string | undefined,
        email: (user.email ?? user.emailAddress) as string | undefined,
      };
    } catch {
      return undefined;
    }
  }

  private captureSession(request: NestLensRequest): Record<string, unknown> | undefined {
    if (this.config.captureSession === false) {
      return undefined;
    }

    try {
      const session = (request as Request & { session?: Record<string, unknown> }).session;
      if (!session) return undefined;

      // Filter out internal session properties
      const filtered: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(session)) {
        if (!key.startsWith('_') && key !== 'cookie') {
          filtered[key] = value;
        }
      }

      return Object.keys(filtered).length > 0 ? filtered : undefined;
    } catch {
      return undefined;
    }
  }

  private captureResponseHeaders(response: Response): Record<string, string> | undefined {
    if (this.config.captureResponseHeaders === false) {
      return undefined;
    }

    try {
      const headers: Record<string, string> = {};
      const rawHeaders = response.getHeaders();

      for (const [key, value] of Object.entries(rawHeaders)) {
        if (typeof value === 'string') {
          headers[key] = value;
        } else if (typeof value === 'number') {
          headers[key] = String(value);
        } else if (Array.isArray(value)) {
          headers[key] = value.join(', ');
        }
      }

      return Object.keys(headers).length > 0 ? headers : undefined;
    } catch {
      return undefined;
    }
  }

  private async captureTags(request: NestLensRequest): Promise<string[] | undefined> {
    if (!this.config.tags) {
      return undefined;
    }

    try {
      const tags = await this.config.tags(request);
      return tags && tags.length > 0 ? tags : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Detect if a request is a GraphQL request using content-based detection.
   *
   * Best Practice: Detect based on request body structure, not URL path.
   * This works regardless of which endpoint serves GraphQL (/graphql, /api/gql, etc.)
   *
   * GraphQL request characteristics:
   * 1. POST method (standard for mutations, common for queries)
   * 2. JSON or GraphQL content-type
   * 3. Body contains 'query' field with valid GraphQL syntax
   * 4. Optionally: 'variables' (object) and 'operationName' (string)
   */
  private isGraphQLRequest(request: Request): boolean {
    // GraphQL requests are typically POST
    if (request.method !== 'POST') {
      return false;
    }

    // Check Content-Type
    const contentType = request.headers['content-type']?.toLowerCase() || '';
    if (!contentType.includes('application/json') && !contentType.includes('application/graphql')) {
      return false;
    }

    // Body must be an object
    const body = request.body;
    if (!body || typeof body !== 'object') {
      return false;
    }

    const bodyObj = body as Record<string, unknown>;

    // GraphQL requests MUST have a 'query' field that is a string
    if (!('query' in bodyObj) || typeof bodyObj.query !== 'string') {
      return false;
    }

    const query = bodyObj.query.trim();
    if (!query) {
      return false;
    }

    // Validate GraphQL syntax: must start with query/mutation/subscription or anonymous query {
    const graphqlPattern = /^(query|mutation|subscription)\b|^\s*\{/i;

    return graphqlPattern.test(query);
  }
}
