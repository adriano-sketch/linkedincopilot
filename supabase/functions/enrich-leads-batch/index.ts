// v4 - fixed ScrapIn API: POST with includes param (was GET without includes, causing all profiles to return minimal data)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_LEADS_PER_CALL = 3;

function normalizeLinkedInUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let url = String(rawUrl).trim();
  if (!url) return null;
  url = url.replace(/^<|>$/g, "");
  const inMatch = url.match(/https?:\/\/[^\s]*linkedin\.com\/in\/[^\s?#]+/i)
    || url.match(/linkedin\.com\/in\/[^\s?#]+/i);
  if (inMatch && inMatch[0]) {
    url = inMatch[0];
  }
  if (url.startsWith("www.")) url = `https://${url}`;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes("linkedin.com")) return null;
    parsed.protocol = "https:";
    if (!parsed.hostname.toLowerCase().startsWith("www.")) {
      parsed.hostname = `www.${parsed.hostname}`;
    }
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SCRAPIN_API_KEY = Deno.env.get("SCRAPIN_API_KEY");
    if (!SCRAPIN_API_KEY) throw new Error("SCRAPIN_API_KEY not configured");

    const { campaign_profile_id, user_id: requestedUserId } = await req.json();
    if (!campaign_profile_id) throw new Error("campaign_profile_id is required");

    const authHeader = req.headers.get("authorization");
    const internalKey = req.headers.get("x-internal-key");

    let effectiveUserId: string | null = null;

    // Internal trusted call (watchdog/scheduler)
    if (internalKey && internalKey === supabaseKey) {
      if (typeof requestedUserId === "string" && requestedUserId.length > 0) {
        effectiveUserId = requestedUserId;
      }
    } else {
      if (!authHeader) throw new Error("Missing authorization header");
      const token = authHeader.replace("Bearer ", "").trim();

      const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);

      if (!userError && user) {
        effectiveUserId = user.id;
      } else {
        const jwtPayload = parseJwtPayload(token);
        const isServiceRole = jwtPayload?.role === "service_role";
        if (isServiceRole && typeof requestedUserId === "string" && requestedUserId.length > 0) {
          effectiveUserId = requestedUserId;
        }
      }
    }

    if (!effectiveUserId) throw new Error("Unauthorized");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    // PROCESSING LIMIT CHECK (Credit Model v2)
    // Processing = every ScrapIn call. Limit = 3x outreach credits.
    // ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
    const { data: settings } = await supabase
      .from("user_settings")
      .select("leads_processed_this_cycle, max_leads_per_cycle")
      .eq("user_id", effectiveUserId)
      .maybeSingle();

    const currentProcessed = settings?.leads_processed_this_cycle || 0;
    const maxOutreach = settings?.max_leads_per_cycle || 0;
    const maxProcessing = maxOutreach * 3;
    let remainingProcessing = maxProcessing > 0 ? Math.max(0, maxProcessing - currentProcessed) : 0;
    let processingCountToAdd = 0;

    // If processing limit already hit, return early
    if (maxProcessing > 0 && remainingProcessing <= 0) {
      return new Response(JSON.stringify({
        success: true,
        enriched: 0,
        remaining: 0,
        done: true,
        processing_limit_reached: true,
        message: "Processing limit reached for this cycle. Upgrade plan or wait for next cycle.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get un-enriched leads for this campaign
    const { data: leads, error: leadsError } = await supabase
      .from("campaign_leads")
      .select("id, linkedin_url, source, profile_enriched_at, full_name, first_name, last_name, title, company, industry, location, profile_quality_status")
      .eq("campaign_profile_id", campaign_profile_id)
      .eq("user_id", effectiveUserId)
      .is("profile_enriched_at", null)
      .in("source", ["csv", "search"])
      .in("status", ["new", "imported", "ready", "icp_rejected", "icp_matched"])
      .or("profile_quality_status.is.null,profile_quality_status.eq.ok")
      .limit(MAX_LEADS_PER_CALL);

    if (leadsError) throw leadsError;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({
        success: true, enriched: 0, remaining: 0, done: true
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check total remaining (beyond this batch)
    const { count: totalRemaining } = await supabase
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_profile_id", campaign_profile_id)
      .eq("user_id", effectiveUserId)
      .is("profile_enriched_at", null)
      .in("source", ["csv", "search"])
      .in("status", ["new", "imported", "ready", "icp_rejected", "icp_matched"])
      .or("profile_quality_status.is.null,profile_quality_status.eq.ok");

    let enrichedCount = 0;
    const errors: string[] = [];
    const linkedinUrlPattern = /linkedin\.com\/in\/.+/i;

    for (const lead of leads) {
      const now = new Date().toISOString();

      // Normalize URL (force https, strip params)
      const linkedinUrl = normalizeLinkedInUrl(lead.linkedin_url);
      if (!linkedinUrl || !linkedinUrlPattern.test(linkedinUrl)) {
        await supabase.from("campaign_leads")
          .update({ profile_enriched_at: now, updated_at: now, error_message: "Invalid LinkedIn URL" } as any)
          .eq("id", lead.id);
        enrichedCount++;
        continue;
      }
      if (linkedinUrl !== lead.linkedin_url) {
        await supabase.from("campaign_leads")
          .update({ linkedin_url: linkedinUrl, updated_at: now } as any)
          .eq("id", lead.id);
      }

      // ââ Ghost blacklist check: skip known ghosts (zero cost, zero processing) ââ
      const { data: ghostEntry } = await supabase
        .from("ghost_profiles")
        .select("id, reason")
        .eq("linkedin_url", linkedinUrl)
        .maybeSingle();

      if (ghostEntry) {
        console.log(`Skipping blacklisted ghost ${linkedinUrl}: ${ghostEntry.reason}`);
        await supabase.from("campaign_leads").update({
          profile_enriched_at: now,
          updated_at: now,
          status: "skipped",
          error_message: `Blacklisted: ${ghostEntry.reason}`,
          profile_quality_status: "ghost",
        } as any).eq("id", lead.id);
        enrichedCount++;
        continue; // NO processing count â no ScrapIn call
      }

      // Check for existing snapshot first (also zero ScrapIn cost)
      const { data: existingSnapshot } = await supabase
        .from("profile_snapshots")
        .select("id, linkedin_url, headline, about, experience, raw_text")
        .eq("linkedin_url", linkedinUrl)
        .limit(1)
        .maybeSingle();

      if (existingSnapshot) {
        await supabase.from("campaign_leads").update({
          snapshot_id: existingSnapshot.id,
          profile_enriched_at: now,
          profile_headline: existingSnapshot.headline || null,
          profile_about: existingSnapshot.about || null,
          updated_at: now,
        } as any).eq("id", lead.id);
        enrichedCount++;

        // Fire-and-forget: generate messages
        fetch(`${supabaseUrl}/functions/v1/generate-dm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ campaign_lead_id: lead.id, user_id: effectiveUserId }),
        }).catch(err => console.error(`generate-dm fire-and-forget error for ${lead.id}:`, err));

        continue; // NO processing count â no ScrapIn call
      }

      // ââ Processing limit check before calling ScrapIn ââ
      if (maxProcessing > 0 && remainingProcessing <= 0) {
        await supabase.from("campaign_leads").update({
          updated_at: now,
          status: "skipped",
          error_message: "Processing limit reached for this cycle",
        } as any).eq("id", lead.id);
        enrichedCount++;
        continue;
      }

      // ââ Call Scrapin.io API (costs 1 processing unit) ââ
      processingCountToAdd += 1;
      remainingProcessing -= 1;

      try {
        const scrapinUrl = `https://api.scrapin.io/v1/enrichment/profile?apikey=${SCRAPIN_API_KEY}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);


HOÛÛÛ\XÜ

KL
NÂÛÛÝ\ÈH]ØZ]]Ú
ØÜ\[\ÂY]ÙÔÕXY\ÎÈÛÛ[U\H\XØ][ÛÚÛÛKÙNÓÓÝ[ÚYJÂ[ÙY[\[ÙY[\[ÛY\ÎÂ[ÛYPÛÛ\[NYK[ÛYTÝ[[X\NYK[ÛYTÚÚ[ÎYK[ÛYQ^\Y[ÙNYK[ÛYQYXØ][ÛYKKJKÚYÛ[ÛÛÛ\ÚYÛ[JNÂÛX\[Y[Ý]
[Y[Ý]
NÂY
\\ËÚÊHÂÛÛÝ\^H]ØZ]\Ë^

NÂÛÛÛÛK\ÜØÜ\[\ÜÉÜ\ËÝ]\ßWHÜ	Û[ÙY[\N\^
NÂY
\ËÝ]\ÈOOH


HÂËÈÙ[HÝÝ[8 %Ø]HÈÚÜÝXÚÛ\Ý]ØZ]Ý\X\ÙKÛJÚÜÝÜÙ[\ÈK\Ù\
Â[ÙY[Ý\[ÙY[\X\ÛÛ
ÛÝÙÝ[ÚYÛ[ØÛÝ[ÛÝ\ÙN[XÚ[XYËX]Ú]XÝYØ]ÝËKÈÛÛÛXÝ[ÙY[Ý\JKÙ[XÝ

KX^XTÚ[ÛJ
NÂ]ØZ]Ý\X\ÙKÛJØ[\ZYÛÛXYÈK\]JÂÙ[WÙ[XÚYØ]ÝË\]YØ]ÝËÝ]\ÎÚÚ\Y\ÜÛY\ÜØYÙNÙ[HÝÝ[Û[ÙY[



HÙ[WÜ]X[]WÜÝ]\ÎÚÜÝH\È[JK\JYXYY
NÂ[XÚYÛÝ[
ÊÎÂH[ÙHÂ\ÜË\Ú
ØÜ\[	Ü\ËÝ]\ßHÜ	ÛXY[ÙY[Ý\X
NÂBÛÛ[YNÂBÛÛÝ]HH]ØZ]\ËÛÛ
NÂY
Y]KÝXØÙ\ÜÈY]K\ÛÛHÂÛÛÛÛK\ÜØÜ\[]\YÈ\ÛÛÜ[ÙY[\
NÂ]ØZ]Ý\X\ÙKÛJÚÜÝÜÙ[\ÈK\Ù\
Â[ÙY[Ý\[ÙY[\X\ÛÛ×Ù]WÜ]\YÚYÛ[ØÛÝ[ÛÝ\ÙN[XÚ[XYËX]Ú]XÝYØ]ÝËKÈÛÛÛXÝ[ÙY[Ý\JKÙ[XÝ

KX^XTÚ[ÛJ
NÂ]ØZ]Ý\X\ÙKÛJØ[\ZYÛÛXYÈK\]JÂÙ[WÙ[XÚYØ]ÝË\]YØ]ÝËÝ]\ÎÚÚ\Y\ÜÛY\ÜØYÙNÈÙ[H]H]\YÙ[WÜ]X[]WÜÝ]\ÎÚÜÝH\È[JK\JYXYY
NÂ[XÚYÛÝ[
ÊÎÂÛÛ[YNÂBÛÛÝH]K\ÛÛÂÛÛÝ\Ý[YHH\Ý[YHÂÛÛÝ\Ý[YHH\Ý[YHÂÛÛÝ[[YHH	Ù\Ý[Y_H	Û\Ý[Y_X[J
NÂÛÛÝXY[HHXY[HÂÛÛÝXÝ]HÝ[[X\HXÝ]ÂËÈÜÚ][Û\ÝÜBÛÛÝÜÚ][ÛÈHÜÚ][ÛÏËÜÚ][Û\ÝÜHÜÚ][Û\ÝÜH×NÂÛÛÝÝ\[ÜÈH\^K\Ð\^JÜÚ][ÛÊH	ÜÚ][ÛË[ÝÈÜÚ][ÛÖÌH[ÂÛÛÝ^\Y[ÙU^H
\^K\Ð\^JÜÚ][ÛÊHÈÜÚ][ÛÈ×JBX\

ÜÎ[JHOÂÛÛÝ]HHÜË]HÂÛÛÝÛÛ\[HHÜËÛÛ\[S[YHÜËÛÛ\[HÂÛÛÝÝ\]HHÜËÝ\[]OËÝ\Ë[ÛÈ	ÜÜËÝ\[]KÝ\[ÛKÉÜÜËÝ\[]KÝ\YX\XÂÛÛÝ[]HHÜËÝ\[]OË[Ë[ÛÈ	ÜÜËÝ\[]K[[ÛKÉÜÜËÝ\[]K[YX\X\Ù[ÂÛÛÝ]TÝHÝ\]HÈ	ÜÝ\]_HH	Ù[]_XÂ]\	Ý]_H]	ØÛÛ\[_IÙ]TÝÈ
	Ù]TÝJXXÂJB[\
ÎÝ[ÊHOË[J
HOOH]BÚ[NÂËÈYXØ][Û\ÝÜBÛÛÝYXØ][ÛÈHØÚÛÛÏËYXØ][Û\ÝÜHYXØ][Û\ÝÜH×NÂÛÛÝYXØ][Û^H
\^K\Ð\^JYXØ][ÛÊHÈYXØ][ÛÈ×JBX\

YN[JHOÂÛÛÝØÚÛÛHYKØÚÛÛ[YHYKØÚÛÛÂÛÛÝYÜYHHYKYÜYS[YHYKYÜYHÂÛÛÝY[HYKY[ÙÝYHÂ]\	ÙYÜY_IÙY[È[	ÙY[XH]	ÜØÚÛÛXÂJB[\
ÎÝ[ÊHOË[J
HOOH]BÚ[NÂËÈÚÚ[ÂÛÛÝÚÚ[ÈHÚÚ[È×NÂÛÛÝÚÚ[Õ^H
\^K\Ð\^JÚÚ[ÊHÈÚÚ[È×JBX\

Î[JHO\[ÙÈOOHÝ[ÈÈÈ
Ë[YHJB[\ÛÛX[BÚ[NÂÛÛÝ]Õ^HÂXY[HÈXY[N	ÚXY[_XXÝ]ÈXÝ]	ØXÝ]X^\Y[ÙU^È^\Y[ÙNÙ^\Y[ÙU^XYXØ][Û^ÈYXØ][ÛÙYXØ][Û^XÚÚ[Õ^ÈÚÚ[Î	ÜÚÚ[Õ^XØØ][ÛÈØØ][Û	ÖÜØØ][ÛÚ]KØØ][ÛÝ]KØØ][ÛÛÝ[WK[\ÛÛX[KÚ[_XK[\ÛÛX[KÚ[NÂËÈÚÜÝÙ[H]XÝ[ÛÛÛÝ\ÐXÝ]HXÝ][J
K[ÝÂÛÛÝ\ÔÚÚ[ÈH\^K\Ð\^JÚÚ[ÊH	ÚÚ[Ë[ÝHÂÛÛÝ\ÑYXØ][ÛH\^K\Ð\^JYXØ][ÛÊH	YXØ][ÛË[ÝÂÛÛÝ\ÔÜÚ][ÛH\^K\Ð\^JÜÚ][ÛÊH	ÜÚ][ÛË[ÝHNÂÛÛÝÛÝÙ\ÛÝ[HÛÝÙ\ÐÛÝ[ÛÝÙ\ÛÝ[ÂÛÛÝÛÛXÝ[ÛÛÝ[HÛÛXÝ[ÛÐÛÝ[ÛÛXÝ[ÛÛÝ[ÂÛÛÝÚYÛ[ÛÝ[HÚ\ÐXÝ]\ÔÚÚ[Ë\ÑYXØ][Û\ÔÜÚ][ÛÛÝÙ\ÛÝ[LÛÛXÝ[ÛÛÝ[
LK[\ÛÛX[K[ÝÂY
ÚYÛ[ÛÝ[HJHÂÛÛÝX\ÛÛHÚÜÝÙ[H
Z[[X[]N	ÈZ\ÐXÝ]È	ÛÈXÝ]	È	ÉßIÈZ\ÔÚÚ[ÈÈ	ËÈÚÚ[ÉÈ	ÉßIÈZ\ÑYXØ][ÛÈ	ËÈYXØ][ÛÈ	ÉßIÈZ\ÔÜÚ][ÛÈ	ËÈÜÚ][ÛÈ	ÉßIÙÛÝÙ\ÛÝ[HLÈ	Ë]ÈÛÝÙ\ÉÈ	ÉßJX\XÙJ	ÊZ[[X[]N	Ë	ÊZ[[X[]N	ÊNÂÛÛÛÛKÙÊÚÚ\[ÈÚÜÝÙ[H	Û[ÙY[\N	ÜX\ÛÛX
NÂ]ØZ]Ý\X\ÙKÛJÚÜÝÜÙ[\ÈK\Ù\
Â[ÙY[Ý\[ÙY[\X\ÛÛÚÜÝÛZ[[X[Ù]HÚYÛ[ØÛÝ[ÚYÛ[ÛÝ[ÛÝ\ÙN[XÚ[XYËX]Ú]XÝYØ]ÝË]×Ù]NÂ\ÐXÝ]\ÔÚÚ[Ë\ÑYXØ][Û\ÔÜÚ][ÛÛÝÙ\ÛÝ[ÛÛXÝ[ÛÛÝ[XY[NXY[OËÝXÝ[ÊL
K[YN[[YKKKÈÛÛÛXÝ[ÙY[Ý\JKÙ[XÝ

KX^XTÚ[ÛJ
NÂ]ØZ]Ý\X\ÙKÛJØ[\ZYÛÛXYÈK\]JÂÙ[WÙ[XÚYØ]ÝË\]YØ]ÝËÝ]\ÎÚÚ\Y\ÜÛY\ÜØYÙNX\ÛÛÙ[WÚXY[NXY[H[Ù[WØXÝ]XÝ][\ÝÛ[YN\Ý[YH[\ÝÛ[YN\Ý[YH[[Û[YN[[YH[Ù[WÜ]X[]WÜÝ]\ÎÚÜÝH\È[JK\JYXYY
NÂ[XÚYÛÝ[
ÊÎÂÛÛ[YNÂBËÈØ]HÛ\ÚÝÛÛÝÈ]NÛ\ÚÝHH]ØZ]Ý\X\ÙBÛJÙ[WÜÛ\ÚÝÈB[Ù\
Â\Ù\ÚYYXÝ]U\Ù\Y[ÙY[Ý\[ÙY[\XY[KXÝ]^\Y[ÙN^\Y[ÙU^[]×Ý^]Õ^ÛÝ\ÙNØÜ\[H\È[JBÙ[XÝ
YBÚ[ÛJ
NÂÛÛÝ\]Q]N[HHÂÙ[WÙ[XÚYØ]ÝËÙ[WÚXY[NXY[H[Ù[WØXÝ]XÝ][Ù[WØÝ\[Ý]NÝ\[ÜÏË]H[Ù[WØÝ\[ØÛÛ\[NÝ\[ÜÏËÛÛ\[S[YHÝ\[ÜÏËÛÛ\[H[\]YØ]ÝË\ÜÛY\ÜØYÙN[NÂY
Û\ÚÝ
H\]Q]KÛ\ÚÝÚYHÛ\ÚÝYÂY
[[YJHÂ\]Q]K[Û[YHH[[YNÂ\]Q]K\ÝÛ[YHH\Ý[YNÂ\]Q]K\ÝÛ[YHH\Ý[YNÂB]ØZ]Ý\X\ÙKÛJØ[\ZYÛÛXYÈK\]J\]Q]JK\JYXYY
NÂ[XÚYÛÝ[
ÊÎÂËÈ\KX[YÜÙ]Ù[\]HY\ÜØYÙ\Â]Ú
	ÜÝ\X\ÙU\KÙ[Ý[ÛËÝKÙÙ[\]KYXÂY]ÙÔÕXY\ÎÈÛÛ[U\H\XØ][ÛÚÛÛ]]Ü^][ÛX\\	ÜÝ\X\ÙRÙ^_XKÙNÓÓÝ[ÚYJÈØ[\ZYÛÛXYÚYXYY\Ù\ÚYYXÝ]U\Ù\YJKJKØ]Ú
\OÛÛÛÛK\ÜÙ[\]KYH\KX[YÜÙ]\ÜÜ	ÛXYYN\JNÂHØ]Ú
N[JHÂY
K[YHOOHXÜ\ÜHÂÛÛÛÛK\ÜØÜ\[[Y[Ý]ÜXY[ÙY[Ý\
NÂ\ÜË\Ú
[Y[Ý]Ü	ÛXY[ÙY[Ý\X
NÂH[ÙHÂÛÛÛÛK\ÜØÜ\[\ÜÜXYXY[ÙY[Ý\JNÂ\ÜË\Ú
KY\ÜØYÙH[ÛÝÛ\ÜNÂBBBËÈ8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥dËÈTUHÐÑTÔÒSÈÓÕST
ÜY][Ù[BËÈÛHØÙ\ÜÚ[ÈÛÝ[8 %[XÚ[XYËX]ÚÙ\ÛÝ[HÝ]XXÚÜY]ÂËÈ8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥d8¥dY
ØÙ\ÜÚ[ÐÛÝ[ÐY
HÂ]ØZ]Ý\X\ÙBÛJ\Ù\ÜÙ][ÜÈB\]JÈXY×ÜØÙ\ÜÙYÝ\×ØÞXÛNÝ\[ØÙ\ÜÙY
ÈØÙ\ÜÚ[ÐÛÝ[ÐYJB\J\Ù\ÚYYXÝ]U\Ù\Y
NÂBÛÛÝ[XZ[[ÈHX]X^

Ý[[XZ[[È
HH[XÚYÛÝ[
NÂ]\]È\ÜÛÙJÓÓÝ[ÚYJÂÝXØÙ\ÜÎYK[XÚY[XÚYÛÝ[[XZ[[ËÛN[XZ[[ÈOOHØÜ\[ØØ[ÎØÙ\ÜÚ[ÐÛÝ[ÐY\ÜÎ\ÜË[ÝÈ\ÜÈ[Y[YJKÂXY\ÎÈÛÜÒXY\ËÛÛ[U\H\XØ][ÛÚÛÛKJNÂHØ]Ú
JHÂÛÛÛÛK\Ü[XÚ[XYËX]Ú\ÜJNÂ]\]È\ÜÛÙJÓÓÝ[ÚYJÈ\ÜH[Ý[Ù[Ù\ÜÈKY\ÜØYÙH[ÛÝÛ\ÜJKÂÝ]\Î
LXY\ÎÈÛÜÒXY\ËÛÛ[U\H\XØ][ÛÚÛÛKJNÂBJNÂ
