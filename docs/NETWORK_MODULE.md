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
- `monthly_people_search_budget` (default 250 free, 300 Premium, 600 Sales Navigator; moves with the plan unless customized)
- Everything that touches LinkedIn only runs inside the user's active days/hours (`extension_status.timezone`).

## Known limitations
- Page readers parse LinkedIn's rendered pages by text/link patterns. If LinkedIn changes the layout and a
  search returns nothing, `action_queue.result.debug` holds a text sample to adjust the reader.
- Credits/plan gating is not applied to this module yet.

## Sales Navigator mode (2026-10-06)
- The extension detects the plan every 12h (`lcDetectLinkedInTier` in `network.js`): Sales Navigator license API first,
  the "Sales Nav" link in the top bar only when that API is inconclusive, then `premiumSubscriber` from `/voyager/api/me`.
  It writes `extension_status.linkedin_account_tier` and `linkedin_tier_detected_at`. It never downgrades Sales Navigator
  on an inconclusive check.
- With `linkedin_account_tier = 'sales_navigator'`, ICP people searches and Growth "my contacts" searches use
  `/sales/search/people` URLs built by `buildSalesNavSearchUrl` (`_shared/network.ts`) with filters CURRENT_TITLE,
  SENIORITY_LEVEL (`icps.seniorities`), REGION (`location_geo_ids`), COMPANY_HEADCOUNT (`company_size_min/max`),
  RELATIONSHIP (S for prospecting, F for my contacts), POSTED_ON_LINKEDIN (`icps.recently_posted`, or `posted_recently`
  in contacts-search) and RECENTLY_CHANGED_JOBS (`icps.changed_jobs`). `action_data.reader = 'sales_navigator'`.
- `lcReadSalesNavSearch` reads the lead cards and resolves each lead to its public `linkedin.com/in/` URL with the same
  profile call Sales Navigator makes (`flagshipProfileUrl`). Leads that cannot be resolved are dropped.
- Fallback: when a Sales Navigator page cannot be used (`sales_nav_unavailable`, or the action fails), the backend stamps
  `extension_status.sales_nav_failed_at` and uses the regular search for 24h. ICP runs are deleted (not counted); a
  contacts run is re-queued at once with the regular search. Changing the plan clears the stamp.
- Invite limits do not change with Sales Navigator (LinkedIn applies them to every plan).
