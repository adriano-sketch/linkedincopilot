import { describe, it, expect } from 'vitest';
import {
  brokeOnSubject, commentRules, draftNotes, factsForPost, readEditVerdict, readPick, readSubject, readVerdicts, splitNotes, type Reading, type SenderFacts,
} from '../../supabase/functions/_shared/comment-quality.ts';

// The case that started this: a post about connecting control systems that mentions "3 million assets"
// got a comment about consequence of failure and budget approval, taken from a note on replacing pipes.
const VIEWS = [
  'Water loss: finding a suspect point is only one step. The result depends on the field crew finding and repairing the leak.',
  'Asset management: the budget is limited and not every pipe needs replacing at once. Combining history, condition and consequence of failure helps direct investment. The priority must be explainable to whoever approves it.',
  'Technology adoption: a pilot needs a goal, owners and success criteria defined before it starts.',
  'My voice: short, direct, human comments. No automatic praise, no forced questions, no sales talk.',
].join('\n\n');
const FACTS: SenderFacts = {
  name: 'Ana', title: 'CEO', company: 'Acme', about: 'We sell leak detection and pipe replacement planning.',
  topics: 'water loss; asset management; technology adoption', views: VIEWS,
};
const reading = (over: Partial<Reading> = {}): Reading => ({
  available: true, subject: 'a utility integrating SCADA, GIS and real-time control', intent: 'announcing a live demonstration',
  detail: 'nearly 3 million assets managed across 380 metered areas', plans: 'AI for consumption forecasting and decision support',
  notes: [], voice: [3], why: 'no note is about system integration', ...over,
});

describe('splitNotes', () => {
  it('gives one note per paragraph, in order', () => {
    const notes = splitNotes(VIEWS);
    expect(notes).toHaveLength(4);
    expect(notes[1]).toMatch(/^Asset management/);
  });
  it('takes one note per line when there is no blank line, as in the form example', () => {
    const example = 'Two or three sentences per subject, in your own words.\nCash flow: most small manufacturers run out of cash while growing, not while shrinking.\nField technicians: people leave over the schedule more often than over the pay.';
    const notes = splitNotes(example);
    expect(notes).toHaveLength(3);
    expect(notes[2]).toMatch(/^Field technicians/);
  });
  it('reads a bullet list as notes', () => {
    expect(splitNotes('- Pricing: discounts train customers to wait.\n- Hiring: the schedule matters more than the pay.')).toEqual([
      'Pricing: discounts train customers to wait.', 'Hiring: the schedule matters more than the pay.',
    ]);
  });
  it('keeps a very short paragraph by joining it to the note before it', () => {
    const notes = splitNotes('My voice: short and direct, one point per comment.\n\nNo emojis.');
    expect(notes).toEqual(['My voice: short and direct, one point per comment. No emojis.']);
  });
  it('keeps more than fourteen notes', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Subject ${i}: one thing I have seen about it.`).join('\n\n');
    expect(splitNotes(many)).toHaveLength(20);
  });
  it('gives nothing for empty text and ignores stray blank lines', () => {
    expect(splitNotes(null)).toEqual([]);
    expect(splitNotes('\n\n   \n\nOnly one real note here.\n\n\n')).toEqual(['Only one real note here.']);
  });
});

describe('reading a post', () => {
  it('is not a reading without a subject', () => {
    for (const bad of [null, 'text', {}, { subject: '  ', detail: 'x' }]) expect(readSubject(bad)).toBeNull();
    expect(readSubject({ subject: 'a utility connecting its control systems', plans: 'AI forecasting' })?.plans).toBe('AI forecasting');
  });
  it('keeps only indexes of notes that exist, once each', () => {
    const r = readPick({ notes: [1, 1, 9, -1, 2.5, '0'], voice: [3] }, 4)!;
    expect(r.notes).toEqual([1]);
    expect(r.voice).toEqual([3]);
  });
  it('never counts a voice note as knowledge', () => {
    expect(readPick({ notes: [2, 3], voice: [3] }, 4)!.notes).toEqual([2]);
  });
  it('cannot pass every note along, as knowledge or as voice', () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(readPick({ notes: all, voice: [] }, 8)!.notes).toHaveLength(3);
    const r = readPick({ notes: [], voice: all }, 8)!;
    expect(r.voice).toHaveLength(3);
  });
  it('treats a reply that is not an object as unreadable', () => {
    for (const bad of [null, 'text', [1, 2]]) expect(readPick(bad, 4)).toBeNull();
  });
});

describe('which rejection drops the notes on the second attempt', () => {
  it('reads the rule the reviewer named', () => {
    const [v] = readVerdicts([{ index: 0, ok: false, rule: 9, reason: 'another subject' }], 1);
    expect(v).toEqual({ ok: false, reason: 'another subject', rule: 9 });
    expect(readVerdicts([{ index: 0, ok: false, rule: 'nine', reason: 'x' }], 1)[0].rule).toBeUndefined();
  });
  it('drops them when the draft was about the wrong thing', () => {
    for (const rule of [4, 9, 11, 12, 13, 14]) expect(brokeOnSubject({ ok: false, reason: 'x', rule })).toBe(true);
  });
  it('keeps them when the problem was wording, or when no rule was named', () => {
    for (const rule of [1, 2, 3, 5, 6, 7, 8, 10]) expect(brokeOnSubject({ ok: false, reason: 'x', rule })).toBe(false);
    expect(brokeOnSubject({ ok: false, reason: 'no em dashes' })).toBe(false);
    expect(brokeOnSubject({ ok: true, reason: '' })).toBe(false);
  });
});

describe('the writer only gets the notes picked for the post', () => {
  it('leaves an unpicked note out of the prompt, whatever word it shares with the post', () => {
    const r = reading();
    const prompt = commentRules(factsForPost(FACTS, r), 'on_topic', 'asset management', '', r);
    expect(prompt).not.toMatch(/consequence of failure/);
    expect(prompt).not.toMatch(/approves it/);
    expect(prompt).toMatch(/None of their notes bears on this post/);
    // The voice note applies to every post.
    expect(prompt).toMatch(/No automatic praise/);
  });
  it('passes a picked note, and only that one', () => {
    const r = reading({ subject: 'choosing which water mains to replace first', notes: [1] });
    const prompt = commentRules(factsForPost(FACTS, r), 'on_topic', 'asset management', '', r);
    expect(prompt).toMatch(/consequence of failure/);
    expect(prompt).not.toMatch(/field crew finding/);
  });
  it('drops every subject note on the second attempt and keeps the voice', () => {
    const r = reading({ notes: [1, 2] });
    const bare = factsForPost(FACTS, r, false);
    expect(bare.views).toBe('');
    expect(bare.voice).toMatch(/^My voice/);
  });
  it('tells the writer what the post is about and what is only planned', () => {
    const r = reading();
    const prompt = commentRules(factsForPost(FACTS, r), 'on_topic', 'asset management', '', r);
    expect(prompt).toMatch(/It is mainly about: a utility integrating SCADA/);
    expect(prompt).toMatch(/NOT achieved: AI for consumption forecasting/);
    // The old lens told the writer to write from the matched subject. It must not come back.
    expect(prompt).not.toMatch(/Write from that\s+knowledge/);
  });
  it('keeps the list of subjects out of the prompt for one post', () => {
    const r = reading();
    expect(commentRules(factsForPost(FACTS, r), 'on_topic', '', '', r)).not.toMatch(/Subjects they have something to say about/);
  });
});

describe('learning from an edit', () => {
  it('keeps a note only for a change of subject', () => {
    expect(readEditVerdict({ kind: 'subject', note: 'On a post about system integration, they dropped budget approval' }))
      .toEqual({ kind: 'subject', note: 'On a post about system integration, they dropped budget approval' });
    expect(readEditVerdict({ kind: 'style', note: 'shorter' })).toEqual({ kind: 'style', note: '' });
    expect(readEditVerdict({ kind: 'fact', note: 'x' }).note).toBe('');
  });
  it('does not generalise when the reason is not clear', () => {
    expect(readEditVerdict({ kind: 'subject', note: '' })).toEqual({ kind: 'unclear', note: '' });
    expect(readEditVerdict({ kind: 'something else' }).kind).toBe('unclear');
    expect(readEditVerdict(null).kind).toBe('unclear');
  });
  it('shows published comments for voice only, never as a guide to the subject', () => {
    const f: SenderFacts = { ...FACTS, learned: { posted: [{ kind: 'topic', text: 'A comment they rewrote about pumps and energy.', edited: true }], rejected: [] } };
    const prompt = commentRules(f, 'on_topic', 'x');
    expect(prompt).toMatch(/ONLY for voice, length and rhythm/);
    expect(prompt).not.toMatch(/the kind of point they\s+make/);
  });
});

describe('draftNotes', () => {
  it('says which notes were used and which were left out', () => {
    const r = reading({ notes: [2] });
    const d = draftNotes(FACTS, r, { attempts: 1, withoutNotes: false, outcome: 'drafted' }) as Record<string, unknown>;
    expect((d.notes_used as string[])[0]).toMatch(/^Technology adoption/);
    expect((d.notes_left as string[]).some((n) => /^Asset management/.test(n))).toBe(true);
    expect((d.voice_notes as string[])[0]).toMatch(/^My voice/);
  });
  it('counts picked notes as left out when the second attempt dropped them', () => {
    const d = draftNotes(FACTS, reading({ notes: [2] }), { attempts: 2, withoutNotes: true, outcome: 'drafted' }) as Record<string, unknown>;
    expect(d.notes_used).toEqual([]);
    expect((d.notes_left as string[]).some((n) => /^Technology adoption/.test(n))).toBe(true);
  });
});
