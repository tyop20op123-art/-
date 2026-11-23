// חשבונות משתמשים: כניסה עם Google או אימייל, וסנכרון השמורים/ההעדפות/ההיסטוריה ל-Firestore.
// נטען רק אם הוגדר window.FIREBASE_CONFIG (ראו js/firebase-config.js).
const cfg = window.FIREBASE_CONFIG;
const FB = "https://www.gstatic.com/firebasejs/10.12.2";

if (cfg) start().catch((e) => console.warn("[account] disabled:", e));

async function start() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${FB}/firebase-app.js`), import(`${FB}/firebase-auth.js`), import(`${FB}/firebase-firestore.js`)
  ]);
  if (!window.Tovana) await new Promise((r) => addEventListener("tovana:ready", r, { once: true }));
  const T = window.Tovana;
  const app = initializeApp(cfg);
  const auth = A.getAuth(app);
  auth.languageCode = "he";
  const db = F.getFirestore(app);

  const btn = document.getElementById("accountBtn");
  const avatar = document.getElementById("accountAvatar");
  btn.hidden = false;

  let user = null, pushT = null, applying = false;
  const LS = (k) => `tovana:sync:${k}`;
  const getLS = (k) => { try { return localStorage.getItem(LS(k)); } catch { return null; } };
  const setLS = (k, v) => { try { localStorage.setItem(LS(k), v); } catch {} };
  const ref = () => F.doc(db, "users", user.uid);

  /* ── מיזוג: איחוד חכם בין המכשיר לחשבון ── */
  function merge(local, remote) {
    const saved = { ...remote.saved };
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
    try {
      await F.setDoc(ref(), { ...T.getData(), updatedAt: now });
      setLS(user.uid, String(now));
    } catch (e) { console.warn("[account] push failed", e); }
  }
  const schedulePush = () => { if (applying || !user) return; clearTimeout(pushT); pushT = setTimeout(push, 1500); };
  addEventListener("tovana:change", schedulePush);

  // משיכה מהחשבון: בכניסה ראשונה – איחוד; אחר כך – אם בחשבון יש גרסה חדשה יותר (ממכשיר אחר), היא קובעת
  async function pull(firstTime) {
    if (!user) return;
    let snap;
    try { snap = await F.getDoc(ref()); } catch (e) { console.warn("[account] pull failed", e); return; }
    const local = T.getData();
    applying = true;
    if (!snap.exists()) { applying = false; return push(); }
    const remote = snap.data();
    const lastSync = Number(getLS(user.uid) || 0);
    let data;
    if (firstTime && !lastSync) data = merge(local, remote);
    else if ((remote.updatedAt || 0) > lastSync) data = { ...merge(local, remote), saved: remote.saved || {}, liked: remote.liked || [], favs: remote.favs || [], goal: remote.goal || local.goal };
    else { applying = false; return; }
    T.setData(data);
    applying = false;
    setLS(user.uid, String(remote.updatedAt || Date.now()));
    if (firstTime) push();
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(false); });

  A.getRedirectResult(auth).catch((e) => e && T.toast(errText(e)));
  A.onAuthStateChanged(auth, async (u) => {
    const wasIn = !!user;
    user = u;
    renderButton();
    if (u) { await pull(true); if (!wasIn) T.toast(`שלום ${u.displayName || u.email} – השמורים שלך מסונכרנים ☁️`); }
  });

  function renderButton() {
    if (user) {
      const ch = (user.displayName || user.email || "?").trim()[0].toUpperCase();
      avatar.textContent = ch; avatar.hidden = false;
      if (user.photoURL) { avatar.style.backgroundImage = `url("${user.photoURL}")`; avatar.textContent = ""; }
    } else { avatar.hidden = true; avatar.style.backgroundImage = ""; }
    btn.title = user ? `מחובר: ${user.email || ""}` : "כניסה לחשבון";
  }

  const HE_ERR = {
    "auth/invalid-email": "כתובת האימייל לא תקינה.",
    "auth/missing-password": "צריך להקליד סיסמה.",
    "auth/weak-password": "הסיסמה קצרה מדי – לפחות 6 תווים.",
    "auth/email-already-in-use": "כבר יש חשבון עם האימייל הזה. נסו 'כניסה'.",
    "auth/invalid-credential": "האימייל או הסיסמה לא נכונים.",
    "auth/wrong-password": "הסיסמה לא נכונה.",
    "auth/user-not-found": "אין חשבון עם האימייל הזה. נסו 'הרשמה'.",
    "auth/too-many-requests": "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.",
    "auth/network-request-failed": "אין חיבור לאינטרנט.",
    "auth/unauthorized-domain": "האתר הזה עוד לא אושר ב-Firebase (Authorized domains).",
    "auth/popup-closed-by-user": "חלון הכניסה נסגר."
  };
  const errText = (e) => HE_ERR[e?.code]
    || (/api-key|configuration-not-found|operation-not-allowed/.test(e?.code || "") ? "החשבונות עוד לא הוגדרו נכון ב-Firebase (ראו js/firebase-config.js)." : "משהו השתבש. נסו שוב.");

  async function googleSignIn() {
    const provider = new A.GoogleAuthProvider();
    const standalone = matchMedia("(display-mode: standalone)").matches;
    try {
      if (standalone) return await A.signInWithRedirect(auth, provider);
      await A.signInWithPopup(auth, provider);
      T.closeSheet();
    } catch (e) {
      if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return A.signInWithRedirect(auth, provider);
      T.toast(errText(e));
    }
  }

  function openAccount() {
    if (user) {
      const n = Object.keys(T.getData().saved).length;
      T.openSheet("החשבון שלי", `
        <div class="acct-head">
          <span class="avatar big" ${user.photoURL ? `style="background-image:url('${user.photoURL}')"` : ""}>${user.photoURL ? "" : (user.displayName || user.email || "?")[0].toUpperCase()}</span>
          <div><div class="acct-name">${esc(user.displayName || "")}</div><div class="mini-src">${esc(user.email || "")}</div></div>
        </div>
        <p class="deep-text">☁️ ${n} תובנות שמורות מסונכרנות לחשבון. הן יופיעו בכל מכשיר שבו תתחברו.</p>
        <div class="links"><button class="link-btn" id="acctSync">סנכרון עכשיו</button><button class="link-btn" id="acctOut">התנתקות</button></div>
        <p class="note">אחרי התנתקות, מה שכבר במכשיר נשאר בו, והחשבון שומר את הכול.</p>`, (b) => {
        b.querySelector("#acctOut").onclick = async () => { await A.signOut(auth); T.closeSheet(); T.toast("התנתקת"); };
        b.querySelector("#acctSync").onclick = async () => { await push(); await pull(false); T.toast("סונכרן ✓"); };
      });
      return;
    }
    T.openSheet("כניסה לחשבון", `
      <p class="deep-text" style="margin-top:0">התחברו כדי לשמור את התובנות שלכם בחשבון ולראות אותן בכל מכשיר.</p>
      <button class="google-btn" id="gBtn">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        המשך עם Google
      </button>
      <div class="or"><span>או עם אימייל</span></div>
      <form id="emailForm" class="acct-form" novalidate>
        <label for="acctEmail">אימייל</label>
        <input id="acctEmail" type="email" autocomplete="email" dir="ltr" required />
        <label for="acctPass">סיסמה</label>
        <input id="acctPass" type="password" autocomplete="current-password" dir="ltr" minlength="6" required />
        <p class="form-err" id="acctErr" role="alert" hidden></p>
        <div class="links">
          <button class="link-btn primary" type="submit" data-mode="in">כניסה</button>
          <button class="link-btn" type="submit" data-mode="up">הרשמה</button>
          <button class="link-btn ghost" type="button" id="acctReset">שכחתי סיסמה</button>
        </div>
      </form>`, (b) => {
      b.querySelector("#gBtn").onclick = googleSignIn;
      const form = b.querySelector("#emailForm"), err = b.querySelector("#acctErr");
      const show = (m) => { err.textContent = m; err.hidden = !m; };
      let mode = "in";
      form.querySelectorAll("[data-mode]").forEach((x) => x.addEventListener("click", () => (mode = x.dataset.mode)));
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); show("");
        const email = b.querySelector("#acctEmail").value.trim(), pass = b.querySelector("#acctPass").value;
        try {
          if (mode === "up") await A.createUserWithEmailAndPassword(auth, email, pass);
          else await A.signInWithEmailAndPassword(auth, email, pass);
          T.closeSheet();
        } catch (ex) { show(errText(ex)); }
      });
      b.querySelector("#acctReset").onclick = async () => {
        const email = b.querySelector("#acctEmail").value.trim();
        if (!email) return show("הקלידו קודם את האימייל, ואז לחצו 'שכחתי סיסמה'.");
        try { await A.sendPasswordResetEmail(auth, email); show(""); T.toast("נשלח אימייל לאיפוס סיסמה 📬"); }
        catch (ex) { show(errText(ex)); }
      };
    });
  }
  btn.onclick = openAccount;
}

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
