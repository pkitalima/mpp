/**
 * The Micro-Task Catalyst (PRD §5.3).
 *
 * The 120-second commitment is the whole mechanic: it puts the cost of starting below the cost
 * of continuing to avoid. Stopping at 120 seconds is a kept promise, never a failure — nothing
 * in this module or its UI may treat it as one.
 */
export const COMMITMENT_SECONDS = 120;

/** Steps are meant to be startable, not impressive. Anything longer belongs in its own card. */
export const MAX_STEP_MINUTES = 5;

export const STEP_SUGGESTION_PROMPTS = [
  'Open the file and read the last thing you wrote',
  'Write one bad sentence you intend to delete',
  'List the three sections, nothing more',
  'Find the one number you need and paste it in',
];

export function isValidStep(title: string, estMinutes: number): boolean {
  return title.trim().length > 0 && estMinutes > 0 && estMinutes <= MAX_STEP_MINUTES;
}
