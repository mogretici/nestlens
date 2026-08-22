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
