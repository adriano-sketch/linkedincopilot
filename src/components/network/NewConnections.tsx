import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExternalLink, UserPlus, UserCheck, Clock, Search, MessageSquareText, Sparkles } from 'lucide-react';
import { useIcps, useNetworkProspects, useNetworkStats } from '@/hooks/useNetwork';

function Stat({ icon: Icon, label, value, hint, featured = false, progress }: {
  icon: typeof UserPlus; label: string; value: string | number; hint?: string; featured?: boolean; progress?: number;
}) {
  return (
    <div className={featured
      ? 'rounded-2xl p-5 bg-navy text-background flex flex-col gap-1.5'
      : 'rounded-2xl p-5 bg-card border border-border flex flex-col gap-1.5'}>
      <div className={`flex items-center gap-2 text-[13px] ${featured ? 'text-slate-300' : 'text-muted-foreground'}`}>
        <Icon className="w-4 h-4" />{label}
      </div>
      <div className="font-display font-semibold text-5xl leading-none tabular-nums">{value}</div>
      {hint && <div className={`text-[13px] ${featured ? 'text-emerald-400' : 'text-muted-foreground'}`}>{hint}</div>}
      {progress != null && (
        <div className="h-1.5 rounded bg-secondary mt-1"><div className="h-1.5 rounded bg-[#C99526]" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>
      )}
    </div>
  );
}

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '');

export default function NewConnections({ searchBudget }: { searchBudget?: number | null }) {
  const [days, setDays] = useState(30);
  const [list, setList] = useState<'accepted' | 'invited' | 'qualified'>('accepted');
  const { data: stats } = useNetworkStats(days);
  const { data: people = [], isLoading } = useNetworkProspects(list);
  const { icps } = useIcps();
  const icpName = (id: string | null) => icps.find(i => i.id === id)?.name || '';

  const rate = stats && stats.invited > 0 ? `${Math.round((stats.accepted / stats.invited) * 100)}%` : '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat icon={UserCheck} label="New connections" value={stats?.accepted ?? 0} hint={`Acceptance rate ${rate}`} featured />
        <Stat icon={UserPlus} label="Invites sent" value={stats?.invited ?? 0} hint={`${stats?.invited_last_7d ?? 0} in the last 7 days`} />
        <Stat icon={Clock} label="Pending invites" value={stats?.pending_invites ?? 0} hint="Withdrawn after 21 days" />
        <Stat icon={Sparkles} label="Qualified, ready to invite" value={stats?.qualified_waiting ?? 0} />
        <Stat icon={Search} label="People searches this month" value={stats?.people_searches_this_month ?? 0}
          hint={searchBudget ? `Budget ${searchBudget}` : undefined} />
        <Stat icon={MessageSquareText} label="Comments to approve" value={stats?.comments_pending_approval ?? 0} />
        <Stat icon={MessageSquareText} label="Comments posted" value={stats?.comments_posted ?? 0} />
        <Stat icon={Sparkles} label="Open business signals" value={stats?.opportunities_open ?? 0} />
      </div>

      {stats?.by_icp?.length ? (
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-base">By ICP</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ICP</TableHead>
                  <TableHead className="text-right">Invited</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead className="text-right">Ready</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.by_icp.map(r => (
                  <TableRow key={r.icp_id}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.invited}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.accepted}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.acceptance_rate != null ? `${r.acceptance_rate}%` : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.pending}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.ready_to_invite}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-2xl">
        <CardHeader className="pb-2 flex flex-row flex-wrap gap-3 items-center justify-between">
          <CardTitle className="text-base">People</CardTitle>
          <Tabs value={list} onValueChange={v => setList(v as typeof list)}>
            <TabsList>
              <TabsTrigger value="accepted">Connected</TabsTrigger>
              <TabsTrigger value="invited">Invited</TabsTrigger>
              <TabsTrigger value="qualified">Up next</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : people.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {list === 'accepted' ? 'No new connections yet. Accepted invites show up here after the next sync (twice a day).' : 'Nobody here yet.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Why it fits</TableHead>
                  <TableHead>ICP</TableHead>
                  <TableHead className="text-right">{list === 'accepted' ? 'Connected' : list === 'invited' ? 'Invited' : 'Fit'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-navy text-primary grid place-items-center text-sm font-semibold">
                        {(p.full_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                      <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="font-medium hover:underline inline-flex items-center gap-1">
                        {p.full_name || p.linkedin_url.replace('https://www.linkedin.com/in/', '')}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <div className="text-xs text-muted-foreground line-clamp-1">{p.headline}</div>
                      {p.mutual_connections != null && p.mutual_connections > 0 && (
                        <div className="text-xs text-gold-dark">{p.mutual_connections} mutual connections</div>
                      )}
                      </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-xs">{p.fit_reason}</TableCell>
                    <TableCell><Badge variant="outline" className="rounded-full bg-background font-medium whitespace-nowrap">{icpName(p.icp_id)}</Badge></TableCell>
                    <TableCell className="text-right text-sm font-mono text-muted-foreground tabular-nums">
                      {list === 'accepted' ? fmtDate(p.accepted_at) : list === 'invited' ? fmtDate(p.invited_at) : p.fit_score}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
