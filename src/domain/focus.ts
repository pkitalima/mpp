import type { FocusBlock, QueuedNotification, User } from './types';

export const FOCUS_PRESETS = [25, 30, 50, 90] as const;

/** A block shorter than a minute is a mistake; longer than a working day is not a focus block. */
export const MIN_FOCUS_MINUTES = 1;
export const MAX_FOCUS_MINUTES = 480;

export function clampFocusMinutes(minutes: number): number | null {
  if (!Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  if (rounded < MIN_FOCUS_MINUTES || rounded > MAX_FOCUS_MINUTES) return null;
  return rounded;
}

export function blockEndsAt(block: FocusBlock): number {
  return Math.min(
    Date.parse(block.endsAt),
    block.endedEarlyAt ? Date.parse(block.endedEarlyAt) : Number.POSITIVE_INFINITY,
  );
}

export function isActive(block: FocusBlock, now: number = Date.now()): boolean {
  return Date.parse(block.startsAt) <= now && now < blockEndsAt(block);
}

export function activeBlocks(blocks: FocusBlock[], now: number = Date.now()): FocusBlock[] {
  return blocks.filter((b) => isActive(b, now));
}

/** The block a user is currently inside, if any. */
export function currentBlockFor(
  userId: string,
  blocks: FocusBlock[],
  now: number = Date.now(),
): FocusBlock | null {
  return activeBlocks(blocks, now).find((b) => b.participantIds.includes(userId)) ?? null;
}

export function isInDeepWork(userId: string, blocks: FocusBlock[], now: number = Date.now()): boolean {
  return currentBlockFor(userId, blocks, now) !== null;
}

export function presenceOf(
  user: User,
  blocks: FocusBlock[],
  now: number = Date.now(),
): { status: 'deep_work' | 'available'; until: string | null } {
  const block = currentBlockFor(user.id, blocks, now);
  return block
    ? { status: 'deep_work', until: new Date(blockEndsAt(block)).toISOString() }
    : { status: 'available', until: null };
}

/**
 * v1 suppression is in-app only (PRD §5.5 / OD-1): non-urgent notifications queue during a
 * block and are released as one digest when it ends. Urgent mentions still break through.
 */
export function shouldQueue(
  notification: Pick<QueuedNotification, 'urgent'>,
  inDeepWork: boolean,
): boolean {
  return inDeepWork && !notification.urgent;
}
