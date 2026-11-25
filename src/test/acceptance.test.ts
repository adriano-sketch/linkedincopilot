import { describe, expect, it } from 'vitest';
import { acceptance, FEW_INVITES } from '../lib/acceptance';

describe('acceptance rate display', () => {
  it('is accepted out of settled, not out of all invites', () => {
    expect(acceptance({ accepted: 8, settled: 30, waiting: 9 })).toEqual({ rate: '27%', basis: '8 of 30', few: false, waiting: 9 });
  });

  it('has no rate while nothing is settled, and still says how many are waiting', () => {
    expect(acceptance({ accepted: 0, settled: 0, waiting: 6 })).toEqual({ rate: null, basis: '', few: false, waiting: 6 });
  });

  it('shows 0% when invites settled and none was accepted', () => {
    expect(acceptance({ accepted: 0, settled: 12, waiting: 0 }).rate).toBe('0%');
  });

  it('warns while the rate rests on few invites', () => {
    expect(acceptance({ accepted: 2, settled: FEW_INVITES - 1 }).few).toBe(true);
    expect(acceptance({ accepted: 2, settled: FEW_INVITES }).few).toBe(false);
  });

  it('never shows more than 100%, and reads missing or odd numbers as zero', () => {
    expect(acceptance({ accepted: 5, settled: 3 }).rate).toBe('100%');
    expect(acceptance({})).toEqual({ rate: null, basis: '', few: false, waiting: 0 });
    expect(acceptance({ accepted: '4', settled: '8', waiting: -2 })).toEqual({ rate: '50%', basis: '4 of 8', few: true, waiting: 0 });
    expect(acceptance({ accepted: NaN, settled: null }).rate).toBe(null);
  });
});
