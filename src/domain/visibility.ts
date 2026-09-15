import type { Card, Evaluation, FlagVisibility, User } from './types';

export const VISIBILITY_LEVELS: {
  id: FlagVisibility;
  label: string;
  description: string;
}[] = [
  {
    id: 'team',
    label: 'Team',
    description: 'Everyone on the team sees the flag on every card. Default — this is what makes peer support work.',
  },
  {
    id: 'owner_lead',
    label: 'Owner + Lead',
    description: "The card's assignee and the team lead see the flag. Other teammates see the card unflagged.",
  },
  {
    id: 'owner',
    label: 'Owner only',
    description: 'Only the assignee sees the flag. The lead still sees aggregate counts on Pulse, but not which card or whose.',
  },
];

/**
 * Whether `viewer` may see the flag on `card` at the team's configured level (PRD §5.4).
 * An unassigned card has no owner to protect, so it follows the team rule.
 */
export function canSeeFlag(viewer: User, card: Card, level: FlagVisibility): boolean {
  switch (level) {
    case 'team':
      return true;
    case 'owner_lead':
      return viewer.role === 'lead' || card.assigneeId === viewer.id || card.assigneeId === null;
    case 'owner':
      return card.assigneeId === viewer.id || card.assigneeId === null;
  }
}

/**
 * Aggregate metrics stay available to the lead at every visibility level — what the setting
 * changes is attribution, not the existence of the signal.
 */
export function canSeeAggregates(viewer: User): boolean {
  return viewer.role === 'lead';
}

/** The evaluation a given viewer is allowed to see for a card, or null if it is hidden from them. */
export function visibleEvaluation(
  viewer: User,
  card: Card,
  evaluation: Evaluation | undefined,
  level: FlagVisibility,
): Evaluation | null {
  if (!evaluation) return null;
  return canSeeFlag(viewer, card, level) ? evaluation : null;
}
