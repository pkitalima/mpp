import { describe, expect, it } from 'vitest';
import { canSeeAggregates, canSeeFlag, visibleEvaluation } from './visibility';
import type { Card, Evaluation, User } from './types';

const lead: User = { id: 'u_amina', teamId: 't1', email: 'a@x.co', displayName: 'Amina', role: 'lead' };
const owner: User = { id: 'u_josh', teamId: 't1', email: 'j@x.co', displayName: 'Josh', role: 'member' };
const peer: User = { id: 'u_sam', teamId: 't1', email: 's@x.co', displayName: 'Sam', role: 'member' };

const card: Card = {
  id: 'c1',
  teamId: 't1',
  title: 'Rewrite Q3 report',
  description: '',
  column: 'in_progress',
  assigneeId: 'u_josh',
  blockedReason: null,
  dueDate: null,
  createdAt: '2026-09-07T09:00:00Z',
  completedAt: null,
  position: 0,
};

describe('canSeeFlag', () => {
  it('shows every flag to everyone at the default team level', () => {
    for (const viewer of [lead, owner, peer]) {
      expect(canSeeFlag(viewer, card, 'team')).toBe(true);
    }
  });

  it('hides a flag from uninvolved peers at owner+lead', () => {
    expect(canSeeFlag(owner, card, 'owner_lead')).toBe(true);
    expect(canSeeFlag(lead, card, 'owner_lead')).toBe(true);
    expect(canSeeFlag(peer, card, 'owner_lead')).toBe(false);
  });

  it('hides a flag from the lead too at owner only', () => {
    expect(canSeeFlag(owner, card, 'owner')).toBe(true);
    expect(canSeeFlag(lead, card, 'owner')).toBe(false);
    expect(canSeeFlag(peer, card, 'owner')).toBe(false);
  });

  it('treats an unassigned card as having no owner to protect', () => {
    const orphan = { ...card, assigneeId: null };
    expect(canSeeFlag(peer, orphan, 'owner')).toBe(true);
  });
});

describe('aggregates', () => {
  it('stay with the lead at every level — the setting changes attribution, not the signal', () => {
    expect(canSeeAggregates(lead)).toBe(true);
    expect(canSeeAggregates(peer)).toBe(false);
  });
});

describe('visibleEvaluation', () => {
  const evaluation: Evaluation = {
    cardId: 'c1',
    column: 'in_progress',
    level: 'red',
    activeDays: 4,
    lastResetAt: '2026-09-07T09:00:00Z',
    threshold: { amberDays: 2, redDays: 4 },
  };

  it('redacts rather than downgrades', () => {
    expect(visibleEvaluation(peer, card, evaluation, 'owner')).toBeNull();
    expect(visibleEvaluation(owner, card, evaluation, 'owner')).toBe(evaluation);
  });

  it('is null when there is nothing to show', () => {
    expect(visibleEvaluation(owner, card, undefined, 'team')).toBeNull();
  });
});
