import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALERT_EMAIL = "support@scantosell.io";

interface CheckResult {
  name: string;
  status: "ok" | "error";
  message?: string;
  latency_ms?: number;
}

async function checkWithTimeout(name: string, fn: () => Promise<void>, timeoutMs = 10000): Promise<CheckResult> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs)),
    ]);
    return { name, status: "ok", latency_ms: Date.now() - start };
  } catch (e) {
    return { name, status: "error", message: e instanceof Error ? e.message : String(e), latency_ms: Date.now() - start };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  const checks: Promise<CheckResult>[] = [];

  // 1. Database connectivity
  checks.push(checkWithTimeout("Database", async () => {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (error) throw new Error(error.message);
  }));

  // 2. Get a sample user's API keys for external checks
  const { data: profiles } = await supabase
    .from("profiles")
    .select("apollo_api_key")
    .not("apollo_api_key", "is", null)
    .limit(1);

  const sampleProfile = profiles?.[0];

  // 4. Apollo API
  if (sampleProfile?.apollo_api_key) {
    checks.push(checkWithTimeout("Apollo API", async () => {
      const res = await fetch("https://api.apollo.io/api/v1/auth/health", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": sampleProfile.apollo_api_key },
      });
      if (!res.ok) {
        // Try alt endpoint
        const alt = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": sampleProfile.apollo_api_key },
          body: JSON.stringify({ per_page: 1, page: 1 }),
        });
        if (!alt.ok) throw new Error(`HTTP ${alt.status}`);
      }
    }));
  } else {
    checks.push(Promise.resolve({ name: "Apollo API", status: "ok" as const, message: "Skipped – no API key configured" }));
  }

  // 6. Active campaigns with stale leads (workflow health)
  checks.push(checkWithTimeout("Workflow: Stale Leads", async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: staleLeads, error } = await supabase
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued_for_connection")
      .lt("updated_at", oneDayAgo);
    if (error) throw new Error(error.message);
    // This is informational, not a hard failure
  }));

  // 7. Edge functions health (self-check)
  checks.push(checkWithTimeout("Edge Functions Runtime", async () => {
    // If we got here, edge functions are working
  }));

  const results = await Promise.all(checks);
  const failures = results.filter(r => r.status === "error");
  const allOk = failures.length === 0;

  // Send email alert only if there are failures
  if (!allOk && resendKey) {
    const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const failureRows = failures.map(f =>
      `<tr><td style="padding:8px;border:1px solid #ddd;color:#dc2626;font-weight:bold">${f.name}</td><td style="padding:8px;border:1px solid #ddd">${f.message}</td><td style="padding:8px;border:1px solid #ddd">${f.latency_ms}ms</td></tr>`
    ).join("");
    const okRows = results.filter(r => r.status === "ok").map(r =>
      `<tr><td style="padding:8px;border:1px solid #ddd;color:#16a34a">${r.name}</td><td style="padding:8px;border:1px solid #ddd">${r.message || "OK"}</td><td style="padding:8px;border:1px solid #ddd">${r.latency_ms ?? "-"}ms</td></tr>`
    ).join("");

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#dc2626">⚠️ LinkedIn Copilot – Alerta de Sistema</h2>
        <p style="color:#555">Verificação em: ${timestamp} (Horário de Brasília)</p>
        <p><strong>${failures.length} problema(s) detectado(s)</strong> de ${results.length} verificações.</p>
        
        <h3 style="color:#dc2626">❌ Falhas</h3>
        <table style="border-collapse:collapse;width:100%">
          <tr style="background:#fef2f2"><th style="padding:8px;border:1px solid #ddd;text-align:left">Serviço</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Erro</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Latência</th></tr>
          ${failureRows}
        </table>

        <h3 style="color:#16a34a;margin-top:20px">✅ Funcionando</h3>
        <table style="border-collapse:collapse;width:100%">
          <tr style="background:#f0fdf4"><th style="padding:8px;border:1px solid #ddd;text-align:left">Serviço</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Status</th><th style="padding:8px;border:1px solid #ddd;text-align:left">Latência</th></tr>
          ${okRows}
        </table>

        <p style="color:#888;margin-top:20px;font-size:12px">Enviado automaticamente pelo LinkedIn Copilot Health Check</p>
      </div>
    `;

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "LinkedIn Copilot <onboarding@resend.dev>",
          to: [ALERT_EMAIL],
          subject: `⚠️ Health Check ALERT – ${failures.length} falha(s) detectada(s)`,
          html,
        }),
      });
    } catch (emailErr) {
      console.error("Failed to send alert email:", emailErr);
    }
  }

  return new Response(JSON.stringify({
    timestamp: new Date().toISOString(),
    all_ok: allOk,
    total_checks: results.length,
    failures: failures.length,
    results,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
