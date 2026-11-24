// חשבונות משתמשים (Supabase): כניסה עם אימייל (ואופציונלית Google),
// וסנכרון השמורים/ההעדפות/ההיסטוריה לטבלה user_data.
// נטען רק אם הוגדר window.SUPABASE_CONFIG (ראו js/backend-config.js).
const cfg = window.SUPABASE_CONFIG;
const SB_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

if (cfg && cfg.url && cfg.key) start().catch((e) => console.warn("[account] disabled:", e));

async function start() {
  const { createClient } = await import(SB_URL);
  if (!window.Tovana) await new Promise((r) => addEventListener("tovana:ready", r, { once: true }));
  const T = window.Tovana;
  const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const here = location.origin + location.pathname;

  const btn = document.getElementById("accountBtn");
  const avatar = document.getElementById("accountAvatar");
  btn.hidden = false;

  let user = null, pushT = null, applying = false;
  const LS = (k) => `tovana:sync:${k}`;
  const getLS = (k) => { try { return localStorage.getItem(LS(k)); } catch { return null; } };
  const setLS = (k, v) => { try { localStorage.setItem(LS(k), v); } catch {} };

  /* ── מיזוג: איחוד חכם בין המכשיר לחשבון ── */
  function merge(local, remote) {
    const saved = { ...(remote.saved || {}) };
    for (const [id, c] of Object.entries(local.saved || {})) {
      if (!saved[id] || (c.savedAt || 0) > (saved[id].savedAt || 0)) saved[id] = c;
    }
    const seen = { ...(remote.seen || {}) };
    for (const [k, t] of Object.entries(local.seen || {})) seen[k] = Math.max(t, seen[k] || 0);
    const ls = local.streak || {}, rs = remote.streak || {};
    const streak = (rs.last || "") > (ls.last || "") || ((rs.last === ls.last) && (rs.count || 0) > (ls.count || 0)) ? rs : ls;
    const today = T.today();
    const ld = local.daily?.date === today ? local.daily.ids : [];
    const rd = remote.daily?.date === today ? remote.daily.ids : [];
    return {
      saved, seen, streak,
      liked: [...new Set([...(remote.liked || []), ...(local.liked || [])])],
      favs: [...new Set([...(remote.favs || []), ...(local.favs || [])])],
      goal: remote.goal || local.goal,
      daily: { date: today, ids: [...new Set([...rd, ...ld])] }
    };
  }

  async function push() {
    if (!user) return;
    const now = Date.now();
    const { error } = await sb.from("user_data").upsert({ user_id: user.id, data: T.getData(), updated_at: now });
    if (error) return console.warn("[account] push failed", error);
    setLS(user.id, String(now));
  }
  const schedulePush = () => { if (applying || !user) return; clearTimeout(pushT); pushT = setTimeout(push, 1500); };
  addEventListener("tovana:change", schedulePush);

  // משיכה מהחשבון: בכניסה ראשונה במכשיר – איחוד; אחר כך – גרסה חדשה יותר בחשבון (ממכשיר אחר) קובעת
  async function pull(firstTime) {
    if (!user) return;
    const { data: row, error } = await sb.from("user_data").select("data, updated_at").eq("user_id", user.id).maybeSingle();
    if (error) return console.warn("[account] pull failed", error);
    if (!row) return push();
    const local = T.getData(), remote = row.data || {};
    const lastSync = Number(getLS(user.id) || 0);
    let merged;
    if (firstTime && !lastSync) merged = merge(local, remote);
    else if ((row.updated_at || 0) > lastSync) merged = { ...merge(local, remote), saved: remote.saved || {}, liked: remote.liked || [], favs: remote.favs || [], goal: remote.goal || local.goal };
    else return;
    applying = true; T.setData(merged); applying = false;
    setLS(user.id, String(row.updated_at || Date.now()));
    if (firstTime) push();
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(false); });

  sb.auth.onAuthStateChange((event, session) => {
    const u = session?.user || null;
    const wasIn = !!user;
    user = u;
    renderButton();
    if (event === "PASSWORD_RECOVERY") return openNewPassword();
    if (u && !wasIn) {
      // יוצאים מתוך הקריאה של onAuthStateChange לפני שקוראים שוב ל-Supabase
      setTimeout(async () => { await pull(true); if (event === "SIGNED_IN") T.toast(`שלום ${u.email} – השמורים שלך מסונכרנים ☁️`); }, 0);
    }
  });

  function renderButton() {
    if (user) { avatar.textContent = (user.email || "?")[0].toUpperCase(); avatar.hidden = false; }
    else avatar.hidden = true;
    btn.title = user ? `מחובר: ${user.email || ""}` : "כניסה לחשבון";
  }

  const errText = (e) => {
    const m = (e?.message || "").toLowerCase(), c = e?.code || "";
    if (c === "invalid_credentials" || m.includes("invalid login")) return "האימייל או הסיסמה לא נכונים.";
    if (c === "email_not_confirmed" || m.includes("not confirmed")) return "צריך לאשר את האימייל: פתחו את המייל ששלחנו ולחצו על הקישור.";
    if (c === "user_already_exists" || m.includes("already registered")) return "כבר יש חשבון עם האימייל הזה. נסו 'כניסה'.";
    if (c === "weak_password" || m.includes("password should be")) return "הסיסמה קצרה מדי – לפחות 6 תווים.";
    if (c === "email_address_invalid" || m.includes("invalid format") || m.includes("unable to validate email")) return "כתובת האימייל לא תקינה.";
    if (c === "over_email_send_rate_limit" || m.includes("rate limit")) return "נשלחו יותר מדי מיילים. נסו שוב בעוד כמה דקות.";
    if (m.includes("failed to fetch") || m.includes("network")) return "אין חיבור לאינטרנט.";
    return "משהו השתבש. נסו שוב.";
  };

  function openAccount() {
    if (user) {
      const n = Object.keys(T.getData().saved).length;
      T.openSheet("החשבון שלי", `
        <div class="acct-head">
          <span class="avatar big">${esc((user.email || "?")[0].toUpperCase())}</span>
          <div><div class="acct-name">${esc(user.email || "")}</div><div class="mini-src">מחובר ☁️</div></div>
        </div>
        <p class="deep-text">${n} תובנות שמורות מסונכרנות לחשבון. הן יופיעו בכל מכשיר שבו תתחברו.</p>
        <div class="links"><button class="link-btn" id="acctSync">סנכרון עכשיו</button><button class="link-btn" id="acctOut">התנתקות</button></div>
        <p class="note">אחרי התנתקות, מה שכבר במכשיר נשאר בו, והחשבון שומר את הכול.</p>`, (b) => {
        b.querySelector("#acctOut").onclick = async () => { await sb.auth.signOut(); T.closeSheet(); T.toast("התנתקת"); };
        b.querySelector("#acctSync").onclick = async () => { await push(); await pull(false); T.toast("סונכרן ✓"); };
      });
      return;
    }
    T.openSheet("כניסה לחשבון", `
      <p class="deep-text" style="margin-top:0">התחברו כדי לשמור את התובנות שלכם בחשבון ולראות אותן בכל מכשיר.</p>
      ${cfg.google ? `<button class="google-btn" id="gBtn">המשך עם Google</button><div class="or"><span>או עם אימייל</span></div>` : ""}
      <form id="emailForm" class="acct-form" novalidate>
        <label for="acctEmail">אימייל</label>
        <input id="acctEmail" type="email" autocomplete="email" dir="ltr" required />
        <label for="acctPass">סיסמה</label>
        <input id="acctPass" type="password" autocomplete="current-password" dir="ltr" minlength="6" required />
        <p class="form-err" id="acctErr" role="alert" hidden></p>
        <p class="form-ok" id="acctOk" role="status" hidden></p>
        <div class="links">
          <button class="link-btn primary" type="submit" data-mode="in">כניסה</button>
          <button class="link-btn" type="submit" data-mode="up">הרשמה</button>
          <button class="link-btn ghost" type="button" id="acctReset">שכחתי סיסמה</button>
        </div>
      </form>`, (b) => {
      const gb = b.querySelector("#gBtn");
      if (gb) gb.onclick = () => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: here } });
      const form = b.querySelector("#emailForm"), err = b.querySelector("#acctErr"), ok = b.querySelector("#acctOk");
      const show = (m, good) => { err.hidden = true; ok.hidden = true; const el = good ? ok : err; el.textContent = m || ""; el.hidden = !m; };
      let mode = "in";
      form.querySelectorAll("[data-mode]").forEach((x) => x.addEventListener("click", () => (mode = x.dataset.mode)));
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); show("");
        const email = b.querySelector("#acctEmail").value.trim(), password = b.querySelector("#acctPass").value;
        if (!email || !password) return show("צריך למלא אימייל וסיסמה.");
        if (mode === "up") {
          const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: here } });
          if (error) return show(errText(error));
          if (!data.session) return show("נשלח אליכם מייל אישור 📬 לחצו על הקישור שבו, ואז חזרו לכאן ולחצו 'כניסה'.", true);
          T.closeSheet();
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) return show(errText(error));
          T.closeSheet();
        }
      });
      b.querySelector("#acctReset").onclick = async () => {
        const email = b.querySelector("#acctEmail").value.trim();
        if (!email) return show("הקלידו קודם את האימייל, ואז לחצו 'שכחתי סיסמה'.");
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: here });
        if (error) return show(errText(error));
        show("נשלח מייל לאיפוס סיסמה 📬", true);
      };
    });
  }

  // אחרי לחיצה על קישור איפוס סיסמה מהמייל
  function openNewPassword() {
    T.openSheet("סיסמה חדשה", `
      <form id="npForm" class="acct-form" novalidate>
        <label for="npPass">סיסמה חדשה</label>
        <input id="npPass" type="password" autocomplete="new-password" dir="ltr" minlength="6" required />
        <p class="form-err" id="npErr" role="alert" hidden></p>
        <div class="links"><button class="link-btn primary" type="submit">שמירה</button></div>
      </form>`, (b) => {
      b.querySelector("#npForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const { error } = await sb.auth.updateUser({ password: b.querySelector("#npPass").value });
        const er = b.querySelector("#npErr");
        if (error) { er.textContent = errText(error); er.hidden = false; return; }
        T.closeSheet(); T.toast("הסיסמה עודכנה ✓");
      });
    });
  }

  btn.onclick = openAccount;

  // ממשק לשאר האפליקציה (סקירת AI צריכה טוקן של משתמש מחובר)
  window.TovanaAuth = {
    async getToken() { const { data } = await sb.auth.getSession(); return data.session?.access_token || null; },
    openLogin: openAccount,
    fnUrl: (name) => `${cfg.url}/functions/v1/${name}`,
    key: cfg.key
  };
}

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
