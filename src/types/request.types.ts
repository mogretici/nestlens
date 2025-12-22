import { Request } from 'express';

/**
 * Extended Express Request with NestLens request ID
 * Used for correlating requests with their related entries (queries, exceptions, logs)
 */
export interface NestLensRequest extends Request {
  nestlensRequestId?: string;
}
