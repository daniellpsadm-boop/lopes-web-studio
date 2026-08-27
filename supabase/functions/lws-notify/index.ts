import { buildPushHTTPRequest } from "npm:@pushforge/builder@2.0.5";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BOT_RE = /(bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slackbot|discordbot)/i;
const DEDUPE_MINUTES = 25;

type VisitPayload = {
  path?: string;
  url?: string;
  referrer?: string;
  locale?: string;
  userAgent?: string;
  sessionId?: string;
};

function visitedUrl(body: VisitPayload) {
  const candidates = [String(body.url || ""), String(body.path || "")];
  for (const raw of candidates) {
    const value = raw.slice(0, 400);
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
      if (/avisos\.html/i.test(parsed.pathname)) return "";
      return parsed.origin + parsed.pathname + parsed.search;
    } catch {
      // relative path — try next or compose below
    }
  }
  const path = String(body.path || "/").slice(0, 300);
  if (/avisos\.html/i.test(path)) return "";
  const origin = "https://dev.lopeswebstudio.com.br";
  const rel = path.startsWith("/") ? path : `/${path}`;
  return origin + rel;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      return parsed.default || Object.values(parsed)[0];
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = serviceKey();
  if (!url || !key) throw new Error("Supabase admin env missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function secret(client: SupabaseClient, key: string) {
  const { data, error } = await client.rpc("lws_get_secret", { p_key: key });
  if (error) throw error;
  return (data as string | null) || "";
}

function timingSafeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

async function assertAdmin(req: Request, client: SupabaseClient, bodyToken?: string) {
  const token = req.headers.get("x-admin-token") || bodyToken || "";
  const expected = await secret(client, "admin_token");
  if (!expected || !token || !timingSafeEqual(token, expected)) {
    throw new Response(JSON.stringify({ error: "Token inválido" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
}

function visitMessage(row: { id?: string | null; path?: string | null; referrer?: string | null; visited_at?: string | null }) {
  const pageUrl = row.path || "https://dev.lopeswebstudio.com.br/";
  const from = row.referrer ? `\nvia ${row.referrer}` : "";
  return {
    id: row.id,
    title: "Visita no site",
    body: pageUrl + from,
    url: pageUrl,
    path: row.path,
    referrer: row.referrer,
    visited_at: row.visited_at || new Date().toISOString(),
  };
}

async function broadcastVisit(payload: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = serviceKey();
  if (!url || !key) return;
  const res = await fetch(`${url}/realtime/v1/api/broadcast/lws-visits/events/visit`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error("broadcast failed", res.status, await res.text());
}

async function sendPushToAll(client: SupabaseClient, payload: Record<string, unknown>) {
  const publicKey = await secret(client, "vapid_public");
  const privateKey = await secret(client, "vapid_private");
  if (!publicKey || !privateKey) throw new Error("VAPID keys missing");

  const { data: subs, error } = await client.from("lws_push_subscriptions").select("id, endpoint, p256dh, auth");
  if (error) throw error;

  for (const sub of subs || []) {
    try {
      const { endpoint, headers, body } = await buildPushHTTPRequest({
        privateJWK: privateKey,
        subscription: {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        message: {
          payload,
          adminContact: "mailto:contato@lopeswebstudio.com.br",
          options: { urgency: "high", ttl: 3600 },
        },
      });
      const response = await fetch(endpoint, { method: "POST", headers, body });
      if (response.status === 404 || response.status === 410) {
        await client.from("lws_push_subscriptions").delete().eq("id", sub.id);
      } else if (!response.ok) {
        console.error("push failed", sub.id, response.status, await response.text());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/\b(404|410)\b/.test(message) || /gone|unsubscribed/i.test(message)) {
        await client.from("lws_push_subscriptions").delete().eq("id", sub.id);
      } else {
        console.error("push failed", sub.id, message);
      }
    }
  }
}

async function handleVisit(client: SupabaseClient, body: VisitPayload) {
  const ua = String(body.userAgent || "");
  if (BOT_RE.test(ua)) return json({ ok: true, skipped: "bot" });

  const pageUrl = visitedUrl(body);
  if (!pageUrl) return json({ ok: true, skipped: "admin" });
  const path = pageUrl;

  const sessionId = String(body.sessionId || "").slice(0, 80);
  if (sessionId) {
    const since = new Date(Date.now() - DEDUPE_MINUTES * 60 * 1000).toISOString();
    const { data: recent } = await client
      .from("lws_site_visits")
      .select("id")
      .eq("session_id", sessionId)
      .gte("visited_at", since)
      .limit(1);
    if (recent && recent.length) return json({ ok: true, duplicate: true });
  }

  const row = {
    path,
    referrer: String(body.referrer || "").slice(0, 200),
    locale: String(body.locale || "").slice(0, 16),
    user_agent: ua.slice(0, 180),
    session_id: sessionId || null,
    source: "web",
  };

  const { data, error } = await client.from("lws_site_visits").insert(row).select("id, path, referrer, locale, visited_at").single();
  if (error) throw error;

  const payload = visitMessage(data);
  await Promise.all([broadcastVisit(payload), sendPushToAll(client, payload)]);
  return json({ ok: true, id: data.id });
}

async function handleSubscribe(client: SupabaseClient, body: Record<string, unknown>) {
  const subscription = body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
  const endpoint = subscription?.endpoint || "";
  const p256dh = subscription?.keys?.p256dh || "";
  const auth = subscription?.keys?.auth || "";
  if (!endpoint || !p256dh || !auth) return json({ error: "Subscription inválida" }, 400);

  const { error } = await client.from("lws_push_subscriptions").upsert(
    {
      endpoint,
      p256dh,
      auth,
      user_agent: String(body.userAgent || "").slice(0, 180),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
  return json({ ok: true });
}

async function handleUnsubscribe(client: SupabaseClient, body: Record<string, unknown>) {
  const endpoint = String(body.endpoint || "");
  if (!endpoint) return json({ error: "endpoint obrigatório" }, 400);
  await client.from("lws_push_subscriptions").delete().eq("endpoint", endpoint);
  return json({ ok: true });
}

async function handleList(client: SupabaseClient) {
  const { data, error } = await client
    .from("lws_site_visits")
    .select("id, path, referrer, locale, visited_at")
    .order("visited_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return json({ visits: data || [] });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown> & VisitPayload;
    const client = adminClient();
    const action = String(body.action || "visit");

    if (action === "visit") return await handleVisit(client, body);

    try {
      await assertAdmin(req, client, typeof body.token === "string" ? body.token : undefined);
    } catch (res) {
      if (res instanceof Response) return res;
      throw res;
    }

    if (action === "subscribe") return await handleSubscribe(client, body);
    if (action === "unsubscribe") return await handleUnsubscribe(client, body);
    if (action === "list") return await handleList(client);
    return json({ error: "action desconhecida" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return json({ error: message }, 500);
  }
});
