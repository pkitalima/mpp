import { describe, expect, it } from 'vitest';
import { clampFocusMinutes, MAX_FOCUS_MINUTES, MIN_FOCUS_MINUTES } from './focus';

describe('clampFocusMinutes', () => {
  it('accepts a whole number inside the range', () => {
    expect(clampFocusMinutes(45)).toBe(45);
    expect(clampFocusMinutes(MIN_FOCUS_MINUTES)).toBe(MIN_FOCUS_MINUTES);
    expect(clampFocusMinutes(MAX_FOCUS_MINUTES)).toBe(MAX_FOCUS_MINUTES);
  });

  it('rounds a fractional entry rather than rejecting it', () => {
    expect(clampFocusMinutes(45.4)).toBe(45);
  });

  it('rejects anything outside the range or not a number', () => {
    expect(clampFocusMinutes(0)).toBeNull();
    expect(clampFocusMinutes(-10)).toBeNull();
    expect(clampFocusMinutes(MAX_FOCUS_MINUTES + 1)).toBeNull();
    expect(clampFocusMinutes(Number.NaN)).toBeNull();
  });
});
