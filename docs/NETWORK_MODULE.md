# Network module (ICP prospecting + post monitoring)

## What it does
1. **Grow the network**: for each active ICP, the extension runs a LinkedIn people search limited to
   2nd-degree connections (people with mutual connections), the AI scores each result card against the ICP,
   and qualified people receive a connection request **without a note**, within the weekly invite limit.
   Invites pending for 21 days are withdrawn. Accepted invites are detected twice a day.
2. **Stay present**: for each ICP the extension searches recent posts (last 24h). The AI keeps posts whose
   author fits the ICP, tags the business signal (opportunity, hiring, pain point, launch, milestone,
   relationship) and drafts a comment. **Nothing is posted until the user approves it** in the dashboard
   (single or bulk approval, editable). Approved comments are posted spaced out during active hours,
   within the daily comment limit.

## Pieces
| Layer | Files |
|---|---|
| DB | `supabase/migrations/20261003205032_network_module_2026_10.sql` (+ timezone column, cron) |
| Scheduler (cron, every 20 min) | `supabase/functions/network-scheduler` |
| Extension results | `supabase/functions/network-action-completed` |
| AI (scoring, signals, drafts) | `supabase/functions/network-process` |
| Shared helpers | `supabase/functions/_shared/network.ts`, `_shared/auth.ts` |
| Extension | `chrome-extension/network.js` (+ 4 small hooks in `background.js`), v0.3.0 |
| Dashboard | `src/pages/Network.tsx`, `src/components/network/*`, `src/hooks/useNetwork.tsx` |

## Extension actions (action_queue, `action_data.module = 'network'`)
`network_search_people`, `network_search_posts`, `network_sync_connections`, `network_withdraw_invites`,
plus the existing `send_connection_request` (no note) and `post_comment`. Results go to
`network-action-completed` instead of `action-completed`.

## Limits (per LinkedIn account, editable in Network → Limits)
- `weekly_invite_limit` (default 100, max 200)
- `daily_comment_limit` (default 20, max 40)
- `monthly_people_search_budget` (default 250 free, 2000 Sales Navigator)
- Everything that touches LinkedIn only runs inside the user's active days/hours (`extension_status.timezone`).

## Known limitations
- Page readers parse LinkedIn's rendered pages by text/link patterns. If LinkedIn changes the layout and a
  search returns nothing, `action_queue.result.debug` holds a text sample to adjust the reader.
- Sales Navigator accounts still use the regular LinkedIn search URLs (only the monthly budget is higher).
- Credits/plan gating is not applied to this module yet.
