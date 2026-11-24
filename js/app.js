(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const CATS = window.CATEGORIES;
  const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
  let SEED = window.SEED_CARDS; // יורחב בחבילת התוכן (data/pack.json) כשהיא נטענת

  /* ───────── אחסון (עטוף ב-try/catch) ───────── */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("tovana:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v, silent) {
      try { localStorage.setItem("tovana:" + k, JSON.stringify(v)); } catch {}
      // מודיע למודול החשבון שיש שינוי לסנכרן
      if (!silent && SYNC_KEYS.has(k)) dispatchEvent(new CustomEvent("tovana:change", { detail: k }));
    }
  };
  const SYNC_KEYS = new Set(["saved", "liked", "favs", "goal", "streak", "seen", "daily"]);
  const today = () => new Date().toLocaleDateString("en-CA");
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString("en-CA"); };

  const state = {
    filter: "all",
    theme: store.get("theme", "dark"),
    saved: store.get("saved", {}),      // id -> card
    liked: new Set(store.get("liked", [])),
    favs: new Set(store.get("favs", [])),
    goal: store.get("goal", 5),
    daily: store.get("daily", { date: today(), ids: [] }),
    streak: store.get("streak", { count: 0, last: null }),
    seen: store.get("seen", {}),        // id -> מתי נצפה לאחרונה
    epoch: 0,
    known: new Map(SEED.map((c) => [c.id, c])), // כל הכרטיסיות המוכרות (כולל חיות)
    queue: [], feedKeys: new Set(), rendered: 0, loading: false, activeEl: null, seq: 0
  };
  if (state.daily.date !== today()) state.daily = { date: today(), ids: [] };
  Object.values(state.saved).forEach((c) => state.known.set(c.id, c));

  /* ───────── עזרים ───────── */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const wordCount = (c) => (c.hook + " " + c.body + " " + c.takeaways.join(" ")).split(/\s+/).length;
  const readSeconds = (c) => Math.max(20, Math.min(60, Math.round(wordCount(c) / 3.6))); // ~215 מילים לדקה
  const isLTR = (s) => /^[\s\W\d]*[A-Za-z]/.test(s || "");
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200);
  }

  const ICON = {
    bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-9.3-9.2C1.4 7.4 3.6 4 7 4c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 15.4 12 20 12 20z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    deep: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h7M17 15l3 3-3 3"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h13"/></svg>'
  };

  /* ───────── עיצוב + כותרת ───────── */
  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    document.querySelector('meta[name="theme-color"]').content = state.theme === "dark" ? "#0d0e11" : "#f7f6f3";
  }
  function renderTabs() {
    const tabs = [{ id: "all", label: "הכל" }, ...CATS];
    $("#tabs").innerHTML = tabs.map((t) => `
      <button class="tab" role="tab" data-f="${t.id}" aria-selected="${state.filter === t.id}" style="--tab-c: var(--c-${t.id})">
        ${t.id !== "all" ? '<span class="dot"></span>' : ""}${esc(t.label)}${state.favs.has(t.id) ? '<span class="fav">★</span>' : ""}
      </button>`).join("");
  }
  function renderGoal(bump) {
    const n = state.daily.ids.length, g = state.goal;
    const s = currentStreak();
    $("#goalText").innerHTML = n >= g
      ? `<span class="g-long">כל הכבוד! ${n} רעיונות היום</span><span class="g-short">✓ ${n}/${g}</span>`
      : `<span class="g-long">קראת ${n} מתוך ${g} רעיונות להיום</span><span class="g-short">${n}/${g} היום</span>`;
    $("#goalRing").style.strokeDashoffset = 94.25 * (1 - Math.min(1, n / g));
    $("#goalBtn").classList.toggle("done", n >= g);
    const st = $("#streak"); st.textContent = `🔥 ${s}`;
    st.title = `רצף של ${s} ימים שבהם השלמת את היעד`;
    if (bump) { st.classList.remove("bump"); void st.offsetWidth; st.classList.add("bump"); }
    const sc = Object.keys(state.saved).length;
    $("#savedCount").hidden = !sc; $("#savedCount").textContent = sc;
  }
  function currentStreak() {
    const { count, last } = state.streak;
    return last === today() || last === yesterday() ? count : 0;
  }

  /* ───────── בניית התור ───────── */
  // כרטיסיות שלא נצפו קודם; את הנצפות – מהישנה לחדשה, כך שכל כניסה נפתחת בתוכן אחר
  // מפתח תוכן: אותו קטע = אותו מפתח, גם אם הגיע ממקור חי וגם מהחבילה
  const keyOf = (c) => (c.url ? "u" + window.Sources.hash(c.url + "|" + String(c.body).slice(0, 40)) : c.id);
  const isSeen = (c) => !!state.seen[keyOf(c)];
  function buildQueue() {
    const q = buildQueueRaw();
    const fresh = q.filter((c) => !isSeen(c));
    if (fresh.length >= 12) return fresh; // רק תוכן שלא ראית
    // כמעט הכול נראה: משלימים בכרטיסיות שנראו הכי מזמן, בסדר אקראי
    const old = q.filter(isSeen).sort((a, b) => state.seen[keyOf(a)] - state.seen[keyOf(b)]);
    return fresh.concat(shuffle(old.slice(0, Math.max(12, Math.ceil(old.length / 2)))));
  }
  function markSeen(c) {
    state.seen[keyOf(c)] = Date.now();
    const ids = Object.keys(state.seen);
    if (ids.length > 5000) ids.sort((a, b) => state.seen[a] - state.seen[b]).slice(0, ids.length - 5000).forEach((k) => delete state.seen[k]);
    store.set("seen", state.seen);
  }
  // מוסיף כרטיסיות לפיד רק אם לא נראו ולא נמצאות כבר בפיד
  function admit(cards) {
    return cards.filter((c) => {
      const k = keyOf(c);
      if (state.feedKeys.has(k) || state.seen[k]) return false;
      state.feedKeys.add(k); return true;
    });
  }
  // השלמה כשאין רשת: קודם מה שלא נראה, ואם אין – מה שנראה הכי מזמן
  function fallbackCards(n) {
    const pool = (state.filter === "all" ? SEED : SEED.filter((c) => c.category === state.filter)).filter((c) => !state.feedKeys.has(keyOf(c)));
    const fresh = shuffle(pool.filter((c) => !isSeen(c)));
    const pickd = fresh.length ? fresh.slice(0, n)
      : shuffle(pool.sort((a, b) => state.seen[keyOf(a)] - state.seen[keyOf(b)]).slice(0, n * 3)).slice(0, n);
    pickd.forEach((c) => state.feedKeys.add(keyOf(c)));
    return pickd;
  }
  function buildQueueRaw() {
    let pool = state.filter === "all" ? SEED : SEED.filter((c) => c.category === state.filter);
    if (state.filter === "all" && state.favs.size) {
      // מועדפים קודם, אחר כך השאר
      const fav = shuffle(pool.filter((c) => state.favs.has(c.category)));
      const rest = shuffle(pool.filter((c) => !state.favs.has(c.category)));
      return interleave(fav).concat(interleave(rest));
    }
    return state.filter === "all" ? interleave(shuffle(pool)) : shuffle(pool);
  }
  // מערבב כך ששתי כרטיסיות רצופות לא יהיו מאותה קטגוריה (ככל האפשר)
  function interleave(cards) {
    const by = {}; cards.forEach((c) => (by[c.category] ||= []).push(c));
    const out = []; let last = null;
    while (out.length < cards.length) {
      const keys = Object.keys(by).filter((k) => by[k].length).sort((a, b) => by[b].length - by[a].length);
      const k = keys.find((x) => x !== last) || keys[0];
      out.push(by[k].shift()); last = k;
    }
    return out;
  }

  /* ───────── רינדור כרטיסייה ───────── */
  function cardHTML(c, opts = {}) {
    const cat = CAT[c.category];
    const ltr = c.lang === "en";
    const dir = ltr ? ' dir="ltr"' : "";
    const liveLabel = { wiki: "ויקיפדיה", sefaria: "ספריא", faith: "ספריא", book: "Open Library", arxiv: "arXiv", hn: "Hacker News" }[c.live];
    return `
      <div class="card-wrap">
        <div class="card-inner">
          <div class="meta">
            <span class="tag">${cat.icon} ${esc(cat.label)}</span>
            <span class="pill">${readSeconds(c)} שנ׳ קריאה</span>
            ${liveLabel ? (c.id.startsWith("pk-") ? `<span class="pill">${liveLabel}</span>` : `<span class="pill live">חי · ${liveLabel}</span>`) : ""}
          </div>
          <h2 class="hook"${isLTR(c.hook) ? ' dir="ltr"' : ""}>${esc(c.hook)}</h2>
          <p class="body"${dir}>${esc(c.body)}</p>
          ${c.takeaways?.length ? `<ul class="takeaways"${dir}><div class="takeaways-title">${ltr ? "KEY TAKEAWAYS" : "נקודות מפתח"}</div>${c.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
          <button class="source" data-act="book" title="כל הכרטיסיות מהמקור הזה">${ICON.book}<span>מתוך: <b>${esc(c.source.title)}</b> / ${esc(c.source.author)}</span></button>
        </div>
        <aside class="rail" aria-label="פעולות">
          <button class="act save ${state.saved[c.id] ? "on" : ""}" data-act="save" aria-pressed="${!!state.saved[c.id]}" aria-label="שמירה"><span class="circle">${ICON.bookmark}</span><span class="lbl">שמירה</span></button>
          <button class="act like ${state.liked.has(c.id) ? "on" : ""}" data-act="like" aria-pressed="${state.liked.has(c.id)}" aria-label="תובנה חזקה"><span class="circle">${ICON.heart}</span><span class="lbl">חזק!</span></button>
          <button class="act" data-act="share" aria-label="שיתוף"><span class="circle">${ICON.share}</span><span class="lbl">שיתוף</span></button>
          <button class="act deep" data-act="deep" aria-label="העמק עוד"><span class="circle">${ICON.deep}</span><span class="lbl">העמק</span></button>
          ${window.SUPABASE_CONFIG ? `<button class="act ai" data-act="ai" aria-label="סקירת AI: הסבר פשוט"><span class="circle">✦</span><span class="lbl">הסבר AI</span></button>` : ""}
        </aside>
      </div>
      <span class="read-check">✓ נקרא</span>
      ${opts.first ? '<div class="swipe-hint"><span>⌃</span>החלק למעלה לרעיון הבא</div>' : ""}
      <div class="progress"><i></i></div>`;
  }
  function makeCardEl(c, opts) {
    const el = document.createElement("article");
    el.className = "card" + (state.daily.ids.includes(c.id) ? " read" : "");
    el.dataset.id = c.id; el.dataset.cat = c.category; el.dataset.key = `${c.id}#${state.seq++}`;
    el.style.setProperty("--read-s", readSeconds(c) + "s");
    el.innerHTML = cardHTML(c, opts);
    return el;
  }

  const feed = $("#feed");
  let io;
  function resetFeed(firstCard) {
    feed.innerHTML = ""; state.rendered = 0;
    state.queue = buildQueue();
    if (firstCard) state.queue = [firstCard, ...state.queue.filter((c) => c.id !== firstCard.id)];
    state.feedKeys = new Set(state.queue.map(keyOf));
    state.queue.forEach((c, i) => feed.appendChild(makeCardEl(c, { first: i === 0 })));
    observe();
    feed.scrollTop = 0;
    ensureLoader();
    state.epoch++;
    injectFresh();
  }
  function ensureLoader() {
    if ($(".loader-card", feed)) return;
    const l = document.createElement("article");
    l.className = "card loader-card";
    l.innerHTML = `<div class="skeleton"><div class="h"></div><div></div><div></div><div style="width:70%"></div><div style="width:40%;margin-top:26px"></div></div>`;
    feed.appendChild(l); io && io.observe(l);
  }

  /* ───────── מעקב קריאה ───────── */
  let dwellT;
  function observe() {
    io && io.disconnect();
    io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.intersectionRatio > 0.6) setActive(e.target);
      });
    }, { root: feed, threshold: [0.6] });
    feed.querySelectorAll(".card").forEach((c) => io.observe(c));
  }
  function setActive(el) {
    if (state.activeEl === el) return;
    state.activeEl && state.activeEl.classList.remove("active");
    state.activeEl = el; el.classList.add("active");
    clearTimeout(dwellT);
    const all = [...feed.querySelectorAll(".card")];
    const idx = all.indexOf(el);
    if (el.classList.contains("loader-card") || idx >= all.length - 4) loadMore();
    if (el.classList.contains("loader-card")) return;
    const c = state.known.get(el.dataset.id);
    markSeen(c);
    // נחשב "נקרא" אחרי ~60% מזמן הקריאה המשוער
    dwellT = setTimeout(() => markRead(el, c), readSeconds(c) * 600);
  }
  function markRead(el, c) {
    el.classList.add("read");
    if (state.daily.ids.includes(c.id)) return;
    state.daily.ids.push(c.id); store.set("daily", state.daily);
    let bump = false;
    if (state.daily.ids.length === state.goal) {
      const s = state.streak;
      if (s.last !== today()) {
        s.count = s.last === yesterday() ? s.count + 1 : 1; s.last = today();
        store.set("streak", s); bump = true;
        toast(`🎯 השלמת את היעד היומי! רצף: ${s.count} ימים`);
      }
    }
    renderGoal(bump);
  }

  /* ───────── טעינה אינסופית (מקורות חיים + מיחזור) ───────── */
  const pickCats = (n) => state.filter !== "all" ? Array(n).fill(state.filter)
    : shuffle(state.favs.size ? [...state.favs, ...state.favs, ...CATS.map((c) => c.id)] : CATS.map((c) => c.id)).slice(0, n);

  // בכל כניסה (ובכל החלפת טאב): מביאים תוכן חי חדש ומשלבים אותו בין הכרטיסיות הקרובות
  async function injectFresh() {
    const ep = state.epoch;
    const results = await Promise.allSettled(pickCats(4).map((cat) => window.Sources.fetchLiveCard(cat)));
    if (ep !== state.epoch) return; // הטאב הוחלף בינתיים
    const added = admit(results.filter((r) => r.status === "fulfilled").map((r) => r.value));
    added.forEach((c, i) => {
      state.known.set(c.id, c);
      const all = [...feed.querySelectorAll(".card")];
      const cur = Math.max(0, all.indexOf(state.activeEl));
      const ref = all[cur + 2 + i * 2] || $(".loader-card", feed);
      const el = makeCardEl(c);
      feed.insertBefore(el, ref); io.observe(el);
    });
  }

  async function loadMore() {
    if (state.loading) return;
    state.loading = true;
    const cats = pickCats(3);
    const results = await Promise.allSettled(cats.map((cat) => window.Sources.fetchLiveCard(cat)));
    let added = admit(results.filter((r) => r.status === "fulfilled").map((r) => r.value));
    // אין רשת או שהכול כבר נראה – משלימים מהמאגר (קודם מה שלא נראה)
    if (added.length < 2) added = added.concat(fallbackCards(5 - added.length));
    const loader = $(".loader-card", feed);
    added.forEach((c) => {
      state.known.set(c.id, c);
      const el = makeCardEl(c);
      feed.insertBefore(el, loader); io.observe(el);
    });
    state.loading = false;
    // אם המשתמש כבר עומד על הטוען – נטען שוב
    if (state.activeEl === loader) { state.activeEl = null; requestAnimationFrame(() => {
      const r = loader.getBoundingClientRect(); if (r.top < innerHeight * 0.4) loadMore();
    }); }
  }

  /* ───────── ניווט ───────── */
  function go(delta) {
    const all = [...feed.querySelectorAll(".card")];
    const i = Math.max(0, all.indexOf(state.activeEl));
    const t = all[Math.min(all.length - 1, Math.max(0, i + delta))];
    t && feed.scrollTo({ top: t.offsetTop, behavior: "smooth" });
  }
  let wheelLock = 0;
  feed.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return;
    // מאפשר גלילה פנימית בכרטיסייה ארוכה
    const inner = e.target.closest(".card-inner");
    if (inner && inner.scrollHeight > inner.clientHeight + 4) {
      const atEnd = e.deltaY > 0 ? inner.scrollTop + inner.clientHeight >= inner.scrollHeight - 2 : inner.scrollTop <= 0;
      if (!atEnd) return;
    }
    e.preventDefault();
    if (Math.abs(e.deltaY) < 8 || Date.now() < wheelLock) return;
    wheelLock = Date.now() + 700;
    go(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "Escape") return closeSheet();
    if (!$("#sheet").hidden) return;
    const k = e.key.toLowerCase();
    const map = { arrowdown: 1, pagedown: 1, j: 1, " ": 1, arrowup: -1, pageup: -1, k: -1 };
    if (k in map) { e.preventDefault(); return go(e.shiftKey && k === " " ? -1 : map[k]); }
    const c = state.activeEl && state.known.get(state.activeEl.dataset.id);
    if (!c) return;
    if (k === "b") act("save", c, state.activeEl);
    else if (k === "l") act("like", c, state.activeEl);
    else if (k === "d" || k === "enter") act("deep", c, state.activeEl);
    else if (k === "s") act("share", c, state.activeEl);
  });

  /* ───────── פעולות ───────── */
  feed.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const el = b.closest(".card"); const c = state.known.get(el.dataset.id);
    act(b.dataset.act, c, el, b);
  });
  // הקשה כפולה = אהבתי
  let lastTap = 0;
  feed.addEventListener("pointerup", (e) => {
    if (e.target.closest("button, a")) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      const el = e.target.closest(".card"); const c = el && state.known.get(el.dataset.id);
      if (c) {
        if (!state.liked.has(c.id)) act("like", c, el);
        const h = document.createElement("div"); h.className = "heart-burst"; h.textContent = "❤️";
        const r = el.getBoundingClientRect();
        h.style.left = e.clientX - r.left - 45 + "px"; h.style.top = e.clientY - r.top - 60 + "px";
        el.appendChild(h); setTimeout(() => h.remove(), 900);
      }
      lastTap = 0;
    } else lastTap = now;
  });

  function syncButtons(id) {
    feed.querySelectorAll(`.card[data-id="${CSS.escape(id)}"]`).forEach((el) => {
      const s = $(".act.save", el), l = $(".act.like", el);
      s.classList.toggle("on", !!state.saved[id]); s.setAttribute("aria-pressed", !!state.saved[id]);
      l.classList.toggle("on", state.liked.has(id)); l.setAttribute("aria-pressed", state.liked.has(id));
    });
  }
  function pop(el, sel) { const b = $(sel, el); if (!b) return; b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }

  async function act(kind, c, el) {
    if (kind === "save") {
      if (state.saved[c.id]) { delete state.saved[c.id]; toast("הוסר מהספרייה"); }
      else { state.saved[c.id] = { ...c, savedAt: Date.now() }; toast("נשמר בספרייה שלך 🔖"); }
      store.set("saved", state.saved); syncButtons(c.id); pop(el, ".act.save"); renderGoal();
    } else if (kind === "like") {
      state.liked.has(c.id) ? state.liked.delete(c.id) : state.liked.add(c.id);
      store.set("liked", [...state.liked]); syncButtons(c.id); pop(el, ".act.like");
    } else if (kind === "share") {
      const url = c.live ? c.url : `${location.href.split("#")[0]}#c=${c.id}`;
      const text = `${c.hook}\n\n${c.takeaways.map((t) => "• " + t).join("\n")}\n\nמתוך: ${c.source.title} / ${c.source.author}`;
      try {
        if (navigator.share) await navigator.share({ title: c.hook, text, url });
        else { await navigator.clipboard.writeText(`${text}\n${url}`); toast("הקישור הועתק 📋"); }
      } catch (e) { if (e.name !== "AbortError") toast("לא ניתן לשתף כרגע"); }
    } else if (kind === "deep") openDeep(c);
    else if (kind === "book") openBook(c);
    else if (kind === "ai") {
      if (!window.TovanaAuth) return toast("סקירת AI זמינה באפליקציה המותקנת ובאתר");
      openDeep(c, { ai: true });
    }
  }

  /* ───────── חלוניות ───────── */
  const sheet = $("#sheet"), backdrop = $("#backdrop");
  let lastFocus;
  function openSheet(title, html, onMount) {
    lastFocus = document.activeElement;
    $("#sheetTitle").textContent = title;
    $("#sheetBody").innerHTML = html; $("#sheetBody").scrollTop = 0;
    sheet.hidden = false; backdrop.hidden = false;
    requestAnimationFrame(() => { sheet.classList.add("show"); backdrop.classList.add("show"); });
    onMount && onMount($("#sheetBody"));
    setTimeout(() => $("#sheetClose").focus(), 50);
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove("show"); backdrop.classList.remove("show");
    setTimeout(() => { sheet.hidden = true; backdrop.hidden = true; }, 320);
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
  }
  $("#sheetClose").onclick = closeSheet; backdrop.onclick = closeSheet;
  // החלקה מטה לסגירה (מובייל)
  let sy = null;
  sheet.addEventListener("touchstart", (e) => { if ($("#sheetBody").scrollTop <= 0) sy = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener("touchmove", (e) => { if (sy !== null && e.touches[0].clientY - sy > 90) { sy = null; closeSheet(); } }, { passive: true });
  sheet.addEventListener("touchend", () => (sy = null));

  /* ───────── סקירת AI: הסבר פשוט מ-Claude (דרך פונקציית השרת explain) ───────── */
  const AI_ERR = {
    login_required: "סקירת AI זמינה למשתמשים מחוברים. התחברו (חינם) ונסו שוב.",
    not_configured: "סקירת AI עוד לא הופעלה בשרת. נסו שוב בקרוב.",
    daily_limit: "הגעתם למכסה היומית של סקירות AI. מחר יש עוד 🙂",
    refused: "לא הצלחנו להסביר את הכרטיסייה הזו. נסו כרטיסייה אחרת.",
    network: "אין חיבור לאינטרנט. נסו שוב."
  };
  function renderAI(box, d) {
    box.innerHTML = `
      <div class="ai-head"><span class="ai-spark" aria-hidden="true">✦</span> סקירת AI · בפשטות</div>
      <p class="ai-one">${esc(d.oneLine)}</p>
      ${String(d.simple || "").split(/\n+/).filter(Boolean).map((p) => `<p class="ai-p">${esc(p)}</p>`).join("")}
      <div class="ai-sub">💡 דוגמה מהחיים</div><p class="ai-p">${esc(d.example)}</p>
      <div class="ai-sub">🎯 למה זה חשוב לך</div><p class="ai-p">${esc(d.whyMatters)}</p>
      ${(d.terms || []).length ? `<div class="ai-sub">📖 מילון קטן</div><dl class="ai-terms">${d.terms.map((t) => `<dt>${esc(t.term)}</dt><dd>${esc(t.meaning)}</dd>`).join("")}</dl>` : ""}
      <p class="ai-note">נכתב בעזרת בינה מלאכותית (Claude) ועלול לטעות – המקור הוא הקובע.</p>`;
  }
  async function runAI(c, box) {
    const key = "ai:" + keyOf(c);
    const cached = store.get(key, null);
    if (cached) return renderAI(box, cached);
    const A = window.TovanaAuth;
    const token = await A.getToken();
    if (!token) {
      box.querySelector(".ai-hint").textContent = AI_ERR.login_required;
      return A.openLogin();
    }
    box.innerHTML = `<div class="ai-head"><span class="ai-spark spin" aria-hidden="true">✦</span> Claude כותב הסבר פשוט…</div>
      <div class="skeleton"><div></div><div></div><div style="width:80%"></div><div style="width:55%"></div></div>`;
    let res, data;
    try {
      res = await fetch(A.fnUrl("explain"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: A.key },
        body: JSON.stringify({ card: { category: CAT[c.category].label, hook: c.hook, body: c.body, takeaways: c.takeaways,
          source: `${c.source.title} / ${c.source.author}`, deep: c.deep || "" } })
      });
      data = await res.json();
    } catch { data = { error: "network" }; }
    if (!res || !res.ok || data.error) {
      box.innerHTML = `<p class="ai-hint">${AI_ERR[data?.error] || "משהו השתבש. נסו שוב."}</p>
        <button class="ai-btn" id="aiRetry"><span class="ai-spark" aria-hidden="true">✦</span> לנסות שוב</button>`;
      box.querySelector("#aiRetry").onclick = () => runAI(c, box);
      return;
    }
    store.set(key, data);
    renderAI(box, data);
  }

  function openDeep(c, opts = {}) {
    const cat = CAT[c.category];
    const dir = c.lang === "en" ? ' dir="ltr"' : "";
    const links = [
      c.wiki ? `<a class="link-btn" target="_blank" rel="noopener" href="https://he.wikipedia.org/wiki/${encodeURIComponent(c.wiki)}">ויקיפדיה ↗</a>` : "",
      c.sefaria ? `<a class="link-btn" target="_blank" rel="noopener" href="https://www.sefaria.org/${c.sefaria}?lang=he">המקור בספריא ↗</a>` : "",
      c.url ? `<a class="link-btn" target="_blank" rel="noopener" href="${esc(c.url)}">למקור המלא ↗</a>` : ""
    ].join("");
    const deep = c.deep || "";
    openSheet("העמק עוד", `
      <div class="mini-src" style="color:var(--c-${c.category})">${cat.icon} ${esc(cat.label)}</div>
      <img class="deep-hero" id="deepImg" alt="" hidden />
      <h2 class="deep-hook"${isLTR(c.hook) ? ' dir="ltr"' : ""}>${esc(c.hook)}</h2>
      ${window.TovanaAuth ? `<section class="ai-box" id="aiBox">
        <button class="ai-btn" id="aiBtn"><span class="ai-spark" aria-hidden="true">✦</span> סקירת AI · הסבר פשוט</button>
        <p class="ai-hint">Claude יסביר את הרעיון במילים הכי פשוטות, עם דוגמה מהחיים.</p>
      </section>` : ""}
      <div class="deep-sec">התובנה</div>
      <p class="deep-text"${dir}>${esc(c.body)}</p>
      ${deep ? `<div class="deep-sec">הרחבה והקשר</div><p class="deep-text"${isLTR(deep) ? ' dir="ltr"' : ""}>${esc(deep)}</p>` : ""}
      <div class="deep-sec">השורה התחתונה</div>
      <ul class="takeaways"${dir}>${c.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      <button class="source" data-sheet-book>${ICON.book}<span>מתוך: <b>${esc(c.source.title)}</b> / ${esc(c.source.author)}</span></button>
      <div class="links">
        <button class="link-btn primary" data-sheet-save>${state.saved[c.id] ? "✓ שמור בספרייה" : "🔖 שמירה לספרייה"}</button>
        ${links}
      </div>`, async (body) => {
      body.querySelector("[data-sheet-book]").onclick = () => openBook(c);
      const aiBtn = body.querySelector("#aiBtn");
      if (aiBtn) {
        aiBtn.onclick = () => runAI(c, body.querySelector("#aiBox"));
        if (opts.ai) aiBtn.click(); // נפתח מכפתור ה-AI שבכרטיסייה
      }
      const sb = body.querySelector("[data-sheet-save]");
      sb.onclick = () => { const el = state.activeEl || document.createElement("div"); act("save", c, el); sb.textContent = state.saved[c.id] ? "✓ שמור בספרייה" : "🔖 שמירה לספרייה"; };
      const src = c.image || (c.wiki && (await window.Sources.fetchWikiImage(c.wiki)));
      const img = body.querySelector("#deepImg");
      if (src && img) { img.src = src; img.onload = () => (img.hidden = false); }
    });
  }

  function openBook(c) {
    const title = c.source.title;
    const items = [...state.known.values()].filter((x) => x.source.title === title);
    const sameAuthor = [...state.known.values()].filter((x) => x.source.title !== title && x.source.author === c.source.author);
    const html = `
      <p class="mini-src" style="margin-top:0">${esc(c.source.author)} · ${items.length} ${items.length === 1 ? "רעיון" : "רעיונות"} ברצף</p>
      ${items.map((x, i) => `
        <div class="book-step" data-n="${i + 1}">
          <h4${isLTR(x.hook) ? ' dir="ltr"' : ""}>${esc(x.hook)}</h4>
          <p${x.lang === "en" ? ' dir="ltr"' : ""}>${esc(x.body)}</p>
          <ul class="takeaways">${x.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          <button class="link-btn" data-open="${esc(x.id)}">העמק ברעיון הזה ←</button>
        </div>`).join("")}
      ${sameAuthor.length ? `<div class="group-title">עוד מאת ${esc(c.source.author)}</div>${sameAuthor.map(miniHTML).join("")}` : ""}`;
    openSheet(title, html, (body) => {
      body.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openDeep(state.known.get(b.dataset.open))));
      bindMinis(body);
    });
  }

  function miniHTML(c) {
    return `<button class="mini" data-cat="${c.category}" data-mini="${esc(c.id)}">
      <div class="mini-hook"${isLTR(c.hook) ? ' dir="ltr"' : ""}>${esc(c.hook)}</div>
      <div class="mini-src">${CAT[c.category].icon} ${esc(c.source.title)} · ${esc(c.source.author)}</div></button>`;
  }
  function bindMinis(body) { body.querySelectorAll("[data-mini]").forEach((b) => (b.onclick = () => openDeep(state.known.get(b.dataset.mini)))); }

  let libMode = store.get("libMode", "cat");
  function openLibrary() {
    const cards = Object.values(state.saved).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    const groups = {};
    cards.forEach((c) => { const k = libMode === "cat" ? c.category : c.source.title; (groups[k] ||= []).push(c); });
    const keys = libMode === "cat" ? CATS.map((c) => c.id).filter((k) => groups[k]) : Object.keys(groups);
    const html = cards.length ? `
      <div class="seg" role="group" aria-label="סידור">
        <button data-mode="cat" aria-pressed="${libMode === "cat"}">לפי קטגוריה</button>
        <button data-mode="book" aria-pressed="${libMode === "book"}">לפי ספר</button>
      </div>
      ${keys.map((k) => `
        <div class="group-title">${libMode === "cat" ? `${CAT[k].icon} ${esc(CAT[k].label)}` : `📖 ${esc(k)}`} · ${groups[k].length}</div>
        ${groups[k].map(miniHTML).join("")}`).join("")}`
      : `<div class="empty"><span class="big">🔖</span>הספרייה שלך עדיין ריקה.<br>לחץ על סמל השמירה בכרטיסייה (או <b>B</b> במקלדת) כדי לאסוף רעיונות.</div>`;
    openSheet(`הספרייה שלי · ${cards.length}`, html, (body) => {
      body.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => { libMode = b.dataset.mode; store.set("libMode", libMode); openLibrary(); }));
      bindMinis(body);
    });
  }

  function openPrefs() {
    const html = `
      <div class="deep-sec" style="margin-top:0">תחומי עניין מועדפים</div>
      ${CATS.map((c) => `<div class="pref-row"><label for="fav-${c.id}">${c.icon} ${esc(c.label)}</label>
        <input type="checkbox" class="switch" id="fav-${c.id}" data-fav="${c.id}" ${state.favs.has(c.id) ? "checked" : ""}></div>`).join("")}
      <p class="note">בפיד "הכל" יוצגו קודם רעיונות מהתחומים המועדפים, והטעינה החיה תתמקד בהם.</p>
      <div class="deep-sec">יעד קריאה יומי</div>
      <div class="goal-opts">${[3, 5, 10, 15].map((n) => `<button data-goal="${n}" aria-pressed="${state.goal === n}">${n} רעיונות</button>`).join("")}</div>
      <div class="deep-sec">היום</div>
      <p class="deep-text">קראת ${state.daily.ids.length} רעיונות · רצף נוכחי: ${currentStreak()} ימים · ${state.liked.size} תובנות חזקות</p>
      <p class="note">התוכן משלב מאגר ערוך של 25 כרטיסיות עם מקורות פתוחים: ויקיפדיה, ספריא, Open Library, arXiv ו-Hacker News.
      ${window.__LLM_ON__ ? "עיבוד AI פעיל בשרת." : "עיבוד התוכן החי נעשה מקומית (להפעלת עיבוד AI – הריצו את server.js)."}</p>`;
    openSheet("תחומי עניין והגדרות", html, (body) => {
      body.querySelectorAll("[data-fav]").forEach((i) => (i.onchange = () => {
        i.checked ? state.favs.add(i.dataset.fav) : state.favs.delete(i.dataset.fav);
        store.set("favs", [...state.favs]); renderTabs(); favDirty = true;
      }));
      body.querySelectorAll("[data-goal]").forEach((b) => (b.onclick = () => {
        state.goal = +b.dataset.goal; store.set("goal", state.goal); renderGoal();
        body.querySelectorAll("[data-goal]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      }));
    });
  }
  let favDirty = false;
  const _close = closeSheet;
  $("#sheetClose").onclick = backdrop.onclick = () => { _close(); if (favDirty && state.filter === "all") { favDirty = false; resetFeed(); } };

  /* ───────── חיבור כפתורים ───────── */
  $("#tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab"); if (!t || t.dataset.f === state.filter) return;
    state.filter = t.dataset.f; renderTabs(); resetFeed();
    t.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  });
  $("#themeBtn").onclick = () => { state.theme = state.theme === "dark" ? "light" : "dark"; store.set("theme", state.theme); applyTheme(); };
  $("#libraryBtn").onclick = openLibrary;
  $("#prefsBtn").onclick = openPrefs;
  $("#goalBtn").onclick = openPrefs;

  /* ───────── ממשק למודול החשבון (js/account.js) ───────── */
  window.Tovana = {
    getData() {
      return { saved: state.saved, liked: [...state.liked], favs: [...state.favs], goal: state.goal,
        streak: state.streak, seen: state.seen, daily: state.daily };
    },
    // מחליף את הנתונים המקומיים בנתונים מהחשבון ומרענן את המסך
    setData(d) {
      if (d.saved) { state.saved = d.saved; Object.values(d.saved).forEach((c) => state.known.set(c.id, c)); store.set("saved", d.saved, true); }
      if (d.liked) { state.liked = new Set(d.liked); store.set("liked", d.liked, true); }
      if (d.favs) { state.favs = new Set(d.favs); store.set("favs", d.favs, true); }
      if (d.goal) { state.goal = d.goal; store.set("goal", d.goal, true); }
      if (d.streak) { state.streak = d.streak; store.set("streak", d.streak, true); }
      if (d.seen) { state.seen = d.seen; store.set("seen", d.seen, true); }
      if (d.daily && d.daily.date === today()) { state.daily = d.daily; store.set("daily", d.daily, true); }
      renderTabs(); renderGoal();
      feed.querySelectorAll(".card[data-id]").forEach((el) => syncButtons(el.dataset.id));
    },
    openSheet, closeSheet, toast, today
  };
  dispatchEvent(new Event("tovana:ready"));

  /* ───────── התקנה כאפליקציה ───────── */
  let installEvt = null;
  const installBtn = $("#installBtn");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; if (installBtn) installBtn.hidden = false; });
  addEventListener("appinstalled", () => { if (installBtn) installBtn.hidden = true; toast("האפליקציה הותקנה 🎉"); });
  // באייפון אין חלון התקנה – מציגים הסבר
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (installBtn && isIOS && !standalone && "serviceWorker" in navigator) installBtn.hidden = false;
  if (installBtn) installBtn.onclick = async () => {
    if (installEvt) { installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; installBtn.hidden = true; }
    else openSheet("התקנה באייפון", `<p class="deep-text">1. לחצו על כפתור השיתוף <b>⎋</b> בתחתית Safari.<br>2. בחרו <b>"הוסף למסך הבית"</b>.<br>3. לחצו <b>"הוסף"</b> – והאייקון של תובנה יופיע במסך הבית.</p>`);
  };

  /* ───────── הפעלה ───────── */
  applyTheme(); renderTabs(); renderGoal();
  // חבילת תוכן מוכנה מראש (עובדת גם בלי גישה לרשת החיצונית)
  async function loadPack() {
    try {
      const r = await Promise.race([fetch("data/pack.json"), new Promise((_, j) => setTimeout(() => j(new Error("t")), 2500))]);
      if (!r.ok) return;
      const pack = await r.json();
      if (!Array.isArray(pack)) return;
      SEED = SEED.concat(pack.filter((c) => c && c.id && c.hook && c.body && CAT[c.category]));
      SEED.forEach((c) => state.known.set(c.id, c));
    } catch {}
  }
  loadPack().then(() => {
    const deepId = (location.hash.match(/c=([\w-]+)/) || [])[1];
    resetFeed(deepId && state.known.get(deepId));
    window.Sources.hasServer();
  });
})();
