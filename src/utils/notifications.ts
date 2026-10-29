export type NotificationType = 'success' | 'warning' | 'error' | 'info';

export interface ToastNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  createdAt: number;
  durationMs: number;
}

export const MAX_SIMULTANEOUS_NOTIFICATIONS = 5;

const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  error: 6000,
  warning: 5000,
  success: 3500,
  info: 3500,
};

const DEDUPE_WINDOW_MS = 3500;

/**
 * Pure state reducer / manager for notifications.
 * Guarantees that at most 5 notifications can ever be present simultaneously.
 * Prevents rapid spamming of duplicate error messages.
 */
export class NotificationQueue {
  private notifications: ToastNotification[] = [];
  private recentKeys = new Map<string, number>();

  constructor(initial: ToastNotification[] = []) {
    this.notifications = initial.slice(-MAX_SIMULTANEOUS_NOTIFICATIONS);
  }

  public getAll(): ToastNotification[] {
    return [...this.notifications];
  }

  public add(
    title: string,
    message?: string,
    type: NotificationType = 'info',
    customDuration?: number
  ): ToastNotification | null {
    const now = Date.now();
    const cleanTitle = title.trim();
    const cleanMessage = message?.trim() || '';
    const dedupeKey = `${type}:${cleanTitle}:${cleanMessage}`;

    // Suppress rapid duplicates
    const lastSeen = this.recentKeys.get(dedupeKey);
    if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
      return null;
    }
    this.recentKeys.set(dedupeKey, now);

    // Prune old dedupe keys
    for (const [key, timestamp] of this.recentKeys.entries()) {
      if (now - timestamp > DEDUPE_WINDOW_MS * 2) {
        this.recentKeys.delete(key);
      }
    }

    const durationMs = customDuration ?? DEFAULT_DURATIONS[type];
    const id = `toast_${now}_${Math.random().toString(36).slice(2, 8)}`;
    const notification: ToastNotification = {
      id,
      type,
      title: cleanTitle,
      message: cleanMessage || undefined,
      createdAt: now,
      durationMs,
    };

    // Strictly enforce maximum of 5 simultaneous notifications
    const next = [...this.notifications, notification];
    if (next.length > MAX_SIMULTANEOUS_NOTIFICATIONS) {
      this.notifications = next.slice(-MAX_SIMULTANEOUS_NOTIFICATIONS);
    } else {
      this.notifications = next;
    }

    return notification;
  }

  public remove(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  public clear(): void {
    this.notifications = [];
    this.recentKeys.clear();
  }

  public count(): number {
    return this.notifications.length;
  }
}
