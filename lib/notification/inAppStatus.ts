/**
 * #35 — source of truth for the read-state of an in-app notification.
 *
 * The REAL `notifications` table (no DDL) is shared with the outbound channels,
 * and its producers write different statuses for the very same meaning:
 *   - `app/api/admin/notifications/route.ts` inserts without `status`
 *     → the column default `'pending'`
 *   - `lib/services/notificationService.ts:160` writes `status: 'pending'`
 *   - this feature writes `status: 'unread'`
 *
 * For `channel = 'inapp'` there is no external delivery, so both `unread` and
 * `pending` mean "the tenant has not seen this yet". Treating only `unread` as
 * unread silently dropped every announcement created by the admin flow: the
 * badge stayed 0 and the chime never fired.
 */
export const IN_APP_UNREAD_STATUSES = ['unread', 'pending'] as const;

export type InAppStatus = (typeof IN_APP_UNREAD_STATUSES)[number] | 'read' | 'sent' | 'failed' | string;

/** `unread` and `pending` are both "not seen yet"; everything else is read. */
export function isInAppUnread(status: string | null | undefined): boolean {
  return status === 'unread' || status === 'pending';
}

/** The status this feature writes when the tenant opens an item. */
export const IN_APP_READ_STATUS = 'read';
