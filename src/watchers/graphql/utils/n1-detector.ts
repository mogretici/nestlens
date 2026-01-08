/**
 * N+1 Query Detection
 *
 * Detects potential N+1 query issues by tracking resolver call patterns.
 */

import { PotentialN1Warning } from '../../../types';

/**
 * Resolver call tracking data
 */
export interface ResolverCall {
  parentType: string;
  fieldName: string;
  returnType?: string;
  /** Parent object ID if available */
  parentId?: string | number;
}

/**
 * N+1 Detection result
 */
export interface N1DetectionResult {
  hasWarnings: boolean;
  warnings: PotentialN1Warning[];
}

/**
 * N+1 Query Detector
 *
 * Tracks resolver calls and detects patterns that suggest N+1 queries.
 * A potential N+1 is detected when the same resolver is called many times
 * in a single request, typically once for each item in a list.
 */
export class N1Detector {
  /** Map of "ParentType.fieldName" -> call count */
  private resolverCalls: Map<string, number> = new Map();

  /** Map of "ParentType.fieldName" -> set of parent IDs */
  private parentIds: Map<string, Set<string | number>> = new Map();

  /** Threshold for N+1 warnings */
  private threshold: number;

  constructor(threshold: number = 10) {
    this.threshold = threshold;
  }

  /**
   * Record a resolver call
   */
  recordCall(call: ResolverCall): void {
    const key = `${call.parentType}.${call.fieldName}`;

    // Increment call count
    const currentCount = this.resolverCalls.get(key) || 0;
    this.resolverCalls.set(key, currentCount + 1);

    // Track parent IDs if available
    if (call.parentId !== undefined) {
      if (!this.parentIds.has(key)) {
        this.parentIds.set(key, new Set());
      }
      this.parentIds.get(key)!.add(call.parentId);
    }
  }

  /**
   * Get the count for a specific resolver
   */
  getCount(parentType: string, fieldName: string): number {
    const key = `${parentType}.${fieldName}`;
    return this.resolverCalls.get(key) || 0;
  }

  /**
   * Get all resolver counts
   */
  getAllCounts(): Map<string, number> {
    return new Map(this.resolverCalls);
  }

  /**
   * Detect potential N+1 issues
   */
  detect(): N1DetectionResult {
    const warnings: PotentialN1Warning[] = [];

    for (const [key, count] of this.resolverCalls.entries()) {
      if (count >= this.threshold) {
        const [parentType, fieldName] = key.split('.');

        // Generate a helpful suggestion based on the pattern
        const suggestion = this.generateSuggestion(parentType, fieldName, count);

        warnings.push({
          field: fieldName,
          parentType,
          count,
          suggestion,
        });
      }
    }

    // Sort by count descending (most severe first)
    warnings.sort((a, b) => b.count - a.count);

    return {
      hasWarnings: warnings.length > 0,
      warnings,
    };
  }

  /**
   * Generate a helpful suggestion for fixing the N+1 issue
   */
  private generateSuggestion(parentType: string, fieldName: string, count: number): string {
    // Check if this looks like a relation field
    const isRelation = this.looksLikeRelation(fieldName);

    if (isRelation) {
      return (
        `Consider using DataLoader to batch ${parentType}.${fieldName} queries. ` +
        `This resolver was called ${count} times, likely once per parent item. ` +
        `DataLoader can batch these into a single database query.`
      );
    }

    // Check if it's a computed field
    const isComputed = this.looksLikeComputed(fieldName);

    if (isComputed) {
      return (
        `The computed field ${parentType}.${fieldName} was called ${count} times. ` +
        `If this involves database queries, consider caching or batching.`
      );
    }

    // Generic suggestion
    return (
      `The resolver ${parentType}.${fieldName} was called ${count} times. ` +
      `Consider using DataLoader or batch fetching to optimize this.`
    );
  }

  /**
   * Check if a field name suggests a relation
   */
  private looksLikeRelation(fieldName: string): boolean {
    const relationPatterns = [
      /s$/, // plural (e.g., "posts", "comments")
      /^get/, // getter (e.g., "getPosts")
      /^find/, // finder (e.g., "findUsers")
      /List$/, // list suffix (e.g., "userList")
      /All$/, // all suffix (e.g., "getAll")
    ];

    return relationPatterns.some((pattern) => pattern.test(fieldName));
  }

  /**
   * Check if a field name suggests a computed value
   */
  private looksLikeComputed(fieldName: string): boolean {
    const computedPatterns = [
      /^is/, // boolean (e.g., "isActive")
      /^has/, // has check (e.g., "hasPermission")
      /^can/, // can check (e.g., "canEdit")
      /Count$/, // count (e.g., "postCount")
      /Total$/, // total (e.g., "orderTotal")
      /^calculate/, // calculation (e.g., "calculatePrice")
      /^compute/, // computation (e.g., "computeHash")
    ];

    return computedPatterns.some((pattern) => pattern.test(fieldName));
  }

  /**
   * Reset the detector for a new request
   */
  reset(): void {
    this.resolverCalls.clear();
    this.parentIds.clear();
  }

  /**
   * Get statistics about resolver calls
   */
  getStats(): {
    totalResolvers: number;
    totalCalls: number;
    maxCalls: number;
    avgCalls: number;
  } {
    const counts = Array.from(this.resolverCalls.values());

    if (counts.length === 0) {
      return {
        totalResolvers: 0,
        totalCalls: 0,
        maxCalls: 0,
        avgCalls: 0,
      };
    }

    const totalCalls = counts.reduce((sum, c) => sum + c, 0);

    return {
      totalResolvers: counts.length,
      totalCalls,
      maxCalls: Math.max(...counts),
      avgCalls: totalCalls / counts.length,
    };
  }
}

/**
 * Create a new N+1 detector with the given threshold
 */
export function createN1Detector(threshold: number = 10): N1Detector {
  return new N1Detector(threshold);
}

/**
 * Quick detection from a resolver calls map
 */
export function detectN1FromMap(
  resolverCalls: Map<string, number>,
  threshold: number = 10,
): PotentialN1Warning[] {
  const detector = new N1Detector(threshold);

  for (const [key, count] of resolverCalls.entries()) {
    const [parentType, fieldName] = key.split('.');
    for (let i = 0; i < count; i++) {
      detector.recordCall({ parentType, fieldName });
    }
  }

  return detector.detect().warnings;
}
