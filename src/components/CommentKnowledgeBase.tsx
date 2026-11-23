import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Save, MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';
import { useProfile } from '@/hooks/useProfile';

type Kb = { comment_topics: string; comment_avoid: string; comment_views: string; comment_examples: string; comment_search_terms: string };
const LIMITS: Record<keyof Kb, number> = { comment_topics: 600, comment_avoid: 400, comment_views: 2500, comment_examples: 1200, comment_search_terms: 600 };

/**
 * What the AI needs to know before it drafts a comment in the user's name: the subjects they have
 * something to say about, the ones they stay out of, what they think and have seen on those subjects
 * (so drafts state a point of view instead of asking questions), a few comments they wrote
 * themselves, and the terms used to look for posts of their own connections.
 * A post that is not about one of the subjects is skipped: no draft. The exception is a milestone of
 * the author (a new role, an anniversary), which gets a short congratulation draft whatever the subject.
 * Nothing is liked by the extension: AUTO_LIKE is false in schedule-actions, so the find visit only reads.
 */
export default function CommentKnowledgeBase() {
  const { profile, updateProfile } = useProfile();
  const [form, setForm] = useState<Kb>({ comment_topics: '', comment_avoid: '', comment_views: '', comment_examples: '', comment_search_terms: '' });

  useEffect(() => {
    // The knowledge base columns are not in the generated types yet.
    const p = (profile || {}) as Partial<Record<Exclude<keyof Kb, 'comment_search_terms'>, string | null>> & { comment_search_terms?: string[] | null };
    setForm({
      comment_topics: p.comment_topics || '', comment_avoid: p.comment_avoid || '', comment_views: p.comment_views || '',
      comment_examples: p.comment_examples || '', comment_search_terms: (p.comment_search_terms || []).join('\n'),
    });
  }, [profile]);

  const set = (k: keyof Kb) => (e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value.slice(0, LIMITS[k]) }));
  const save = async () => {
    // One search term per line (commas and semicolons also split), at most 15.
    const terms = Array.from(new Set(form.comment_search_terms.split(/[\n;,]+/).map(t => t.trim()).filter(Boolean))).slice(0, 15);
    try {
      await updateProfile.mutateAsync({
        comment_topics: form.comment_topics.trim() || null,
        comment_avoid: form.comment_avoid.trim() || null,
        comment_views: form.comment_views.trim() || null,
        comment_examples: form.comment_examples.trim() || null,
        comment_search_terms: terms.length ? terms : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      toast.success('Saved. New drafts will use it.');
    } catch { toast.error('Failed to save'); }
  };
  const empty = !form.comment_topics.trim();

  return (
    <Card id="comment-knowledge-base">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><MessageSquareText className="w-4 h-4" /> What you comment on</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <p className="text-sm text-muted-foreground">
          Comments are drafted only for posts about your subjects, and for milestones of your contacts (a new role, an anniversary).
          Every other post is skipped: no draft, and nothing is liked for you.
          {empty && <span className="block mt-1 font-medium text-foreground">Nothing here yet: until you fill in your subjects, no comment is drafted.</span>}
        </p>
        <div>
          <Label htmlFor="kb-topics">Subjects you have something to say about</Label>
          <Textarea id="kb-topics" rows={3} value={form.comment_topics} onChange={set('comment_topics')}
            placeholder="Water loss and leak detection; predictive maintenance of pumps and motors; sewer inspection" />
          <p className="text-xs text-muted-foreground text-right">{form.comment_topics.length}/{LIMITS.comment_topics}</p>
        </div>
        <div>
          <Label htmlFor="kb-avoid">Subjects you stay out of</Label>
          <Textarea id="kb-avoid" rows={2} value={form.comment_avoid} onChange={set('comment_avoid')}
            placeholder="Politics; job openings; sponsorships; tenders and contracts" />
          <p className="text-xs text-muted-foreground text-right">{form.comment_avoid.length}/{LIMITS.comment_avoid}</p>
        </div>
        <div>
          <Label htmlFor="kb-views">What you think and what you have seen on these subjects</Label>
          <Textarea id="kb-views" rows={6} value={form.comment_views} onChange={set('comment_views')}
            placeholder={"Two or three sentences per subject, in your own words. For example:\nWater loss: most programs fail after the first year because the field team is not part of the target.\nPredictive maintenance: it only pays off when the alert reaches the person who schedules the crew."} />
          <p className="text-xs text-muted-foreground">Drafts use this to state a point of view. Without it they tend to ask questions, because nothing is invented in your name.</p>
          <p className="text-xs text-muted-foreground text-right">{form.comment_views.length}/{LIMITS.comment_views}</p>
        </div>
        <div>
          <Label htmlFor="kb-examples">Two or three comments you wrote yourself (optional)</Label>
          <Textarea id="kb-examples" rows={5} value={form.comment_examples} onChange={set('comment_examples')}
            placeholder="Paste comments you left on LinkedIn and liked, one per paragraph. Drafts will follow your voice, not copy them." />
          <p className="text-xs text-muted-foreground text-right">{form.comment_examples.length}/{LIMITS.comment_examples}</p>
        </div>
        <div>
          <Label htmlFor="kb-terms">Search terms for posts of your connections (one per line)</Label>
          <Textarea id="kb-terms" rows={4} value={form.comment_search_terms} onChange={set('comment_search_terms')}
            placeholder={"water loss\nleak detection\npredictive maintenance"} />
          <p className="text-xs text-muted-foreground">A few times a day Copilot searches last week's posts of your 1st-degree connections for one of these terms. Leave empty to turn it off.</p>
        </div>
        <Button size="sm" onClick={save} disabled={updateProfile.isPending}><Save className="w-3 h-3 mr-1" /> Save</Button>
      </CardContent>
    </Card>
  );
}
