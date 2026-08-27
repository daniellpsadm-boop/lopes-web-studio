(function () {
  var cfg = window.LWS_NOTIFY;
  if (!cfg || !cfg.functionUrl || !cfg.supabaseAnonKey) return;
  if (/avisos\.html/i.test(location.pathname)) return;
  if (navigator.webdriver) return;

  var ua = String(navigator.userAgent || "");
  if (/(bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slackbot|discordbot)/i.test(ua)) {
    return;
  }

  var sessionKey = "lws_visit_session";
  var sessionId = sessionStorage.getItem(sessionKey);
  if (!sessionId) {
    sessionId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
    sessionStorage.setItem(sessionKey, sessionId);
  }

  var referrerHost = "";
  try {
    if (document.referrer) referrerHost = new URL(document.referrer).hostname || "";
  } catch (e) {}

  fetch(cfg.functionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.supabaseAnonKey,
      Authorization: "Bearer " + cfg.supabaseAnonKey,
    },
    body: JSON.stringify({
      action: "visit",
      path: location.pathname + location.search,
      url: location.origin + location.pathname + location.search,
      referrer: referrerHost,
      locale: document.documentElement.getAttribute("data-locale") || document.documentElement.lang || "",
      userAgent: ua.slice(0, 180),
      sessionId: sessionId,
    }),
    keepalive: true,
  }).catch(function () {});
})();
