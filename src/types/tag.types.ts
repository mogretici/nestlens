/**
 * Tag associated with an entry
 */
export interface Tag {
  id: number;
  entryId: number;
  tag: string;
  createdAt: string;
}

/**
 * Monitored tag for tracking specific tags
 */
export interface MonitoredTag {
  id: number;
  tag: string;
  createdAt: string;
}

/**
 * Tag with count for listing
 */
export interface TagWithCount {
  tag: string;
  count: number;
}

/**
 * Tag filter options
 */
export interface TagFilter {
  tags?: string[];
  tagLogic?: 'AND' | 'OR';
}
