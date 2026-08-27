(function () {
  var cfg = window.LWS_NOTIFY;
  var statusEl = document.getElementById("avisos-status");
  var feedEl = document.getElementById("avisos-feed");
  var enableBtn = document.getElementById("avisos-enable");
  var disableBtn = document.getElementById("avisos-disable");
  var tokenHint = document.getElementById("avisos-token-hint");

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.kind = kind || "info";
  }

  function getToken() {
    var hash = (location.hash || "").replace(/^#/, "").trim();
    if (hash) {
      localStorage.setItem("lws_admin_token", hash);
      history.replaceState(null, "", location.pathname + location.search);
      return hash;
    }
    return localStorage.getItem("lws_admin_token") || "";
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  function callNotify(payload) {
    return fetch(cfg.functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.supabaseAnonKey,
        Authorization: "Bearer " + cfg.supabaseAnonKey,
        "x-admin-token": getToken(),
      },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.error || "Falha na API");
        return body;
      });
    });
  }

  function visitLabel(item) {
    var when = item.visited_at ? new Date(item.visited_at) : new Date();
    var time = when.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    var path = item.path || "/";
    var from = item.referrer ? " via " + item.referrer : "";
    return time + " · " + path + from;
  }

  var seen = {};

  function prependVisit(item) {
    if (!feedEl) return;
    var id = item.id || String(item.visited_at || "") + String(item.path || "");
    if (id && seen[id]) return;
    if (id) seen[id] = true;
    var empty = feedEl.querySelector("[data-empty]");
    if (empty) empty.remove();
    var li = document.createElement("li");
    li.textContent = visitLabel(item);
    feedEl.prepend(li);
    while (feedEl.children.length > 40) feedEl.removeChild(feedEl.lastChild);
  }

  async function enablePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("Este navegador não suporta Web Push.", "error");
      return;
    }
    if (!getToken()) {
      setStatus("Abra o link secreto com o token no final da URL.", "error");
      return;
    }
    try {
      var permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("Permissão negada. Ative as notificações do site nas configurações do navegador.", "error");
        return;
      }
      var swUrl = new URL("sw.js", document.baseURI).href;
      var registration = await navigator.serviceWorker.register(swUrl, {
        scope: new URL("./", document.baseURI).pathname,
      });
      await navigator.serviceWorker.ready;
      var existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      var subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey),
      });
      await callNotify({ action: "subscribe", subscription: subscription.toJSON() });
      setStatus("Alertas ativos neste aparelho. Você recebe um aviso a cada visita nova.", "ok");
      enableBtn.hidden = true;
      disableBtn.hidden = false;
    } catch (err) {
      setStatus(err.message || "Não foi possível ativar os alertas.", "error");
    }
  }

  async function disablePush() {
    try {
      var registration = await navigator.serviceWorker.getRegistration();
      var subscription = registration && (await registration.pushManager.getSubscription());
      if (subscription) {
        await callNotify({ action: "unsubscribe", endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setStatus("Alertas desativados neste aparelho.", "info");
      enableBtn.hidden = false;
      disableBtn.hidden = true;
    } catch (err) {
      setStatus(err.message || "Não foi possível desativar.", "error");
    }
  }

  function listenRealtime() {
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
    var client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    client
      .channel("lws-visits")
      .on("broadcast", { event: "visit" }, function (msg) {
        prependVisit(msg.payload || {});
      })
      .subscribe();
  }

  async function loadRecent() {
    if (!getToken()) return;
    try {
      var data = await callNotify({ action: "list" });
      (data.visits || []).slice().reverse().forEach(prependVisit);
    } catch (err) {
      setStatus(err.message, "error");
    }
  }

  navigator.serviceWorker &&
    navigator.serviceWorker.addEventListener("message", function (event) {
      if (event.data && event.data.type === "visit") prependVisit(event.data.payload || {});
    });

  enableBtn && enableBtn.addEventListener("click", enablePush);
  disableBtn && disableBtn.addEventListener("click", disablePush);

  if (!getToken()) {
    setStatus("Abra esta página pelo link secreto (com o token) para ativar os alertas.", "error");
    if (tokenHint) tokenHint.hidden = false;
    enableBtn.disabled = true;
    return;
  }

  setStatus("Token ok. Ative as notificações neste Chrome/Edge (ou no app da tela inicial no iPhone).", "info");
  listenRealtime();
  loadRecent();

  navigator.serviceWorker &&
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      if (sub) {
        enableBtn.hidden = true;
        disableBtn.hidden = false;
        setStatus("Alertas ativos neste aparelho.", "ok");
      }
    }).catch(function () {});
})();
