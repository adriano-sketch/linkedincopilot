import { describe, expect, it, vi } from 'vitest';
import { acceptance, waitingText, FEW_INVITES } from '../lib/acceptance';

describe('acceptance rate display', () => {
  it('is accepted out of matured invites, not out of all invites', () => {
    expect(acceptance({ matured: 30, accepted_matured: 8, waiting: 9, accepted_early: 0 }))
      .toEqual({ rate: '27%', basis: '8 of 30', few: false, waiting: 9, acceptedEarly: 0, known: true });
  });

  it('has no rate while nothing has matured, and still says how many are waiting', () => {
    const a = acceptance({ matured: 0, accepted_matured: 0, waiting: 6, accepted_early: 2 });
    expect(a.rate).toBe(null);
    expect(a.known).toBe(true);
    expect(waitingText(a)).toBe('6 (2 already accepted)');
  });

  it('keeps an early acceptance out of the rate', () => {
    // 1 matured invite not accepted, 1 young invite accepted: 0%, not 50% or 100%.
    const a = acceptance({ matured: 1, accepted_matured: 0, waiting: 1, accepted_early: 1 });
    expect(a.rate).toBe('0%');
    expect(a.basis).toBe('0 of 1');
  });

  it('shows 0% when invites matured and none was accepted', () => {
    expect(acceptance({ matured: 12, accepted_matured: 0 }).rate).toBe('0%');
  });

  it('warns while the rate rests on few invites', () => {
    expect(acceptance({ matured: FEW_INVITES - 1, accepted_matured: 2 }).few).toBe(true);
    expect(acceptance({ matured: FEW_INVITES, accepted_matured: 2 }).few).toBe(false);
  });

  it('never shows more than 100%, and says so in the console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = acceptance({ matured: 3, accepted_matured: 5 });
    expect(a.rate).toBe('100%');
    expect(a.basis).toBe('3 of 3');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reads missing or odd numbers as zero, and knows when the server did not send them', () => {
    const none = acceptance({});
    expect(none.rate).toBe(null);
    expect(none.known).toBe(false);
    expect(waitingText(none)).toBe('—');
    expect(acceptance({ matured: '8', accepted_matured: '4', waiting: -2 }).rate).toBe('50%');
    expect(acceptance({ matured: null, accepted_matured: NaN }).known).toBe(false);
  });

  it('never counts more early acceptances than invites waiting', () => {
    expect(waitingText(acceptance({ matured: 0, waiting: 2, accepted_early: 5 }))).toBe('2 (2 already accepted)');
  });
});
