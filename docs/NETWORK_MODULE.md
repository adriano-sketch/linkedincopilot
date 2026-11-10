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
- Sales Navigator paints lead cards lazily and only while the tab is visible; the automation tab runs in the
  background, so the cards are often never painted ("29 results" and the checkboxes are there, names and links are
  not). Since v0.4.2 the reader, when it finds fewer cards than "N results" implies, re-reads the page through the
  page's own lead-search call (`/sales-api/salesApiLeadSearch`, URL taken from the page's resource timing or built
  from `location.search` with the query passed through untouched) and then resolves public URLs as usual.
  `result.source` says which path was used (`cards`, `cards+search_call`, `search_call`); `result.results_total` is
  the total of the search; `has_next` comes from that total. `sales_nav_unavailable` is now only returned for a
  redirect away from the search, a 401/403 on the search call (no seat) or when both paths find nothing on a page
  that is not an empty state.
- Changing an ICP's search filters (titles, keywords, location, industries, seniority, company size, posted/changed
  jobs) resets `people_search_page` to 0 (trigger `icp_reset_people_search_on_change`,
  migration `20261107210000`), so the new result set is read from page 1.

## Growth campaigns: which post gets engaged (extension 0.4.3)
- Since 0.4.4 the background script does the navigation for `find_latest_post` (straight to the activity page; the page
  script never navigates, a page load would kill it before it answers), passes the lead's stored name to tell own
  posts from reposts, and keeps the `#lcpost=` fingerprint on `like_post` / `post_comment` URLs (it was being
  stripped by `normalizeLinkedInUrl`, which made both act on the first card).
- `find_latest_post` opens `/in/<slug>/recent-activity/all/` directly (the profile's generic activity link can
  point at the Comments or Reactions tab) and reads the cards with `lcCollectActivityCards()`. The 2026 layout has no
  stable class names and no `data-urn`; a card is found from its relative-time label ("19h", "5d • Edited", "2 sem")
  and parsed from its text (header "Feed post", actor line, age, body up to the Like/Comment row). Old layouts still
  use the previous selectors.
- Only the person's OWN posts from the last 30 days count (`GROWTH_MAX_POST_AGE_DAYS`). Reposts (cards with another
  actor, or no text of their own), posts older than 30 days and cards without text are skipped; when nothing
  qualifies the lead goes to `engagement_done` for 7 days with `error_message` saying why (`no_recent_posts`,
  `no_own_posts`, `no_posts_found`, `cards_not_recognized`).
- The 2026 layout does not expose the post's own URN (the only `/feed/update/urn:li:ugcPost:` links inside a card
  belong to embedded media). When no own permalink exists, `post_url` is the activity page plus
  `#lcpost=<fingerprint>` (first 80 normalised characters of the text). `like_post` and `post_comment` then locate
  that card again with `lcFindTargetCard()` and act inside it, never on "the first card".
- 2026 controls: the reaction button is `button[aria-label^="Reaction button state"]` ("no reaction" = not liked
  yet); the comment editor is ProseMirror (`[contenteditable][role=textbox]`), typed with `execCommand('insertText')`
  word by word (textContent writes are ignored by it); the submit button appears after typing, has the visible text
  "Comment"/"Post" and no aria-label (the card's action button has aria-label "Comment" and no text).
- Fallback: when a Sales Navigator page cannot be used (`sales_nav_unavailable`, or the action fails), the backend stamps
  `extension_status.sales_nav_failed_at` and uses the regular search for 24h. ICP runs are deleted (not counted); a
  contacts run is re-queued at once with the regular search. Changing the plan clears the stamp.
- Invite limits do not change with Sales Navigator (LinkedIn applies them to every plan).
