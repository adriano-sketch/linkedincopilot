import { describe, it, expect } from 'vitest';
import { parseJsonArray, repairJsonStrings } from '../../supabase/functions/_shared/network.ts';

describe('parseJsonArray', () => {
  it('reads a clean reply', () => {
    expect(parseJsonArray('[{"index": 0, "skip": false, "comment": "Plain text."}]'))
      .toEqual([{ index: 0, skip: false, comment: 'Plain text.' }]);
  });

  it('reads a reply wrapped in a code fence', () => {
    expect(parseJsonArray('```json\n[{"index":0,"skip":true,"skip_reason":"nothing to add"}]\n```'))
      .toEqual([{ index: 0, skip: true, skip_reason: 'nothing to add' }]);
  });

  it('keeps a quoted word inside a comment (the reply that failed for a Polish post)', () => {
    const reply = '[{"index": 0, "skip": false, "comment": "Te trzy "bezproblemowe" strefy pokazują, że nikt ich nie sprawdzał."}]';
    expect(parseJsonArray(reply)[0].comment).toBe('Te trzy "bezproblemowe" strefy pokazują, że nikt ich nie sprawdzał.');
  });

  it('keeps a line break inside a comment', () => {
    expect(parseJsonArray('[{"index": 0, "comment": "Line one.\nLine two."}]')[0].comment).toBe('Line one.\nLine two.');
  });

  it('repairs each entry of a batch on its own', () => {
    const reply = '[{"index":0,"ok":false,"reason":"Says "x" twice"},{"index":1,"ok":true,"reason":""}]';
    expect(parseJsonArray(reply)).toEqual([{ index: 0, ok: false, reason: 'Says "x" twice' }, { index: 1, ok: true, reason: '' }]);
  });

  it('does not touch quotes that are already escaped', () => {
    expect(parseJsonArray('[{"index": 0, "comment": "He said \\"fine\\" and left.", "skip": false}]')[0].comment)
      .toBe('He said "fine" and left.');
  });

  it('still fails, rather than guess, when the text itself looks like the end of a value', () => {
    expect(() => parseJsonArray('[{"index":0,"comment":"He wrote "a", "b": and left","skip":false}]')).toThrow();
  });

  it('fails when there is no array at all', () => {
    expect(() => parseJsonArray('I cannot help with that.')).toThrow('No JSON array');
  });
});

describe('repairJsonStrings', () => {
  it('leaves valid JSON as it is', () => {
    const ok = '[{"index":0,"comment":"Plain.","skip":false}]';
    expect(repairJsonStrings(ok)).toBe(ok);
  });
});
