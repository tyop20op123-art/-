/* מקורות תוכן חיים + שכבת עיבוד (Formatter).
   כל מקור מחזיר "פריט גולמי": { category, title, text, extra, sourceTitle, sourceAuthor, url, lang, kind }
   אחר כך formatCard() הופך אותו לכרטיסייה אחידה.
   אם השרת (server.js) רץ – העיבוד עובר דרך /api/format (LLM). אחרת – עיבוד מקומי. */
(function () {
  const TIMEOUT = 9000;

  function withTimeout(p, ms = TIMEOUT) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  }
  async function getJSON(url) {
    const r = await withTimeout(fetch(url));
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // גיבוב קצר ויציב (cyrb53) למזהי תוכן
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  /* זוכר אילו נושאים חיים כבר הוצגו (גם בין כניסות), כדי לא לחזור עליהם */
  const USED_KEY = "tovana:usedTopics";
  let used;
  try { used = new Set(JSON.parse(localStorage.getItem(USED_KEY) || "[]")); } catch { used = new Set(); }
  const inFlight = new Set();
  function pickFresh(prefix, list) {
    let free = list.filter((x) => !used.has(prefix + x) && !inFlight.has(prefix + x));
    if (!free.length) { // כולם נראו – מתחילים סבב חדש לקבוצה הזו
      list.forEach((x) => used.delete(prefix + x));
      free = list.filter((x) => !inFlight.has(prefix + x));
    }
    const v = pick(free.length ? free : list);
    inFlight.add(prefix + v);
    return v;
  }
  function markUsed(key) {
    inFlight.delete(key); used.add(key);
    try { localStorage.setItem(USED_KEY, JSON.stringify([...used].slice(-300))); } catch {}
  }
  const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

  /* ── שרת אופציונלי ── */
  let serverState = null; // null=לא נבדק, true/false
  async function hasServer() {
    if (serverState !== null) return serverState;
    if (location.protocol === "file:") return (serverState = false);
    try {
      const r = await withTimeout(fetch("/api/health"), 2500);
      const j = await r.json();
      serverState = !!j.ok;
      window.__LLM_ON__ = !!j.llm;
    } catch { serverState = false; }
    return serverState;
  }

  /* ── 1. ויקיפדיה (עברית, נפילה לאנגלית) ── */
  const WIKI_TOPICS = {
    philosophy: ["סטואה", "אקזיסטנציאליזם", "ברוך שפינוזה", "פרידריך ניטשה", "רנה דקארט", "אריסטו", "דייוויד יום", "ז'אן-פול סארטר", "סוקרטס", "תער אוקהאם", "הימור פסקל", "תועלתנות", "הספינה של תזאוס", "בעיית הקרונית"],
    physics: ["חומר אפל", "שזירה קוונטית", "עקרון האי-ודאות", "חור שחור", "המפץ הגדול", "בוזון היגס", "גל כבידה", "אנרגיה אפלה", "החתול של שרדינגר", "ניסוי שני הסדקים", "כוכב נייטרונים", "אנטי-חומר"],
    biology: ["CRISPR", "נוירופלסטיות", "מיטוכונדריה", "דובוני מים", "אפיגנטיקה", "תא גזע", "דופמין", "נוירוני מראה", "אדם ניאנדרטלי", "פוטוסינתזה", "אנדוסימביוזה", "שעון ביולוגי"],
    psychology: ["דיסוננס קוגניטיבי", "אפקט דאנינג-קרוגר", "ניסוי מילגרם", "ניסוי הכלא של סטנפורד", "היררכיית הצרכים של מאסלו", "התניה קלאסית", "פסיכולוגיה חיובית", "אינטליגנציה רגשית", "תאוריית ההתקשרות", "אפקט הפלצבו", "זיכרון כוזב", "אפקט העיגון", "ז'אן פיאז'ה", "זיגמונד פרויד"],
    tech: ["מחשב קוונטי", "חוק מור", "עדה לאבלייס", "רשת עצבית מלאכותית", "ENIAC", "מכונת טיורינג", "קוד פתוח", "לינוקס", "הצפנת מפתח ציבורי", "אינטרנט"],
    judaism: ["ספר הכוזרי", "מסילת ישרים", "ישראל בעל שם טוב", "נחמן מברסלב", "ספר התניא", "יהודה הלוי", "המהר\"ל מפראג", "בחיי אבן פקודה",
      "מורה נבוכים", "ספר העיקרים", "אור ה'", "האמונות והדעות", "חובות הלבבות", "דרך ה'", "שלושה עשר עיקרי האמונה", "חסדאי קרשקש", "יוסף אלבו",
      "סעדיה גאון", "יצחק אברבנאל", "נצח ישראל (ספר)", "נפש החיים", "שמונה פרקים", "פולמוס הרמב\"ם", "אורות הקודש", "השגחה", "בחירה חופשית ביהדות"]
  };
  const WIKI_SEARCH = {
    philosophy: ["פילוסוף", "אתיקה פילוסופית", "תורת ההכרה", "פילוסופיה של התודעה", "פילוסופיה יוונית", "פילוסופיה מודרנית", "פרדוקס"],
    physics: ["מכניקת הקוונטים", "אסטרופיזיקה", "תורת היחסות", "חלקיק יסודי", "קוסמולוגיה", "תרמודינמיקה", "פיזיקאי פרס נובל"],
    biology: ["אבולוציה", "מדעי המוח", "גנטיקה", "מיקרוביולוגיה", "תא ביולוגי", "מערכת החיסון", "ביולוג"],
    psychology: ["פסיכולוגיה קוגניטיבית", "הטיה קוגניטיבית", "פסיכולוגיה חברתית", "פסיכולוג", "פסיכותרפיה", "פסיכולוגיה התפתחותית", "ניסוי בפסיכולוגיה", "רגש"],
    tech: ["בינה מלאכותית", "מדעי המחשב", "היסטוריה של המחשוב", "אלגוריתם", "הנדסת תוכנה", "קריפטוגרפיה", "חלוץ המחשוב"],
    judaism: ["מחשבת ישראל", "פילוסופיה יהודית", "חסידות", "קבלה", "מוסר יהודי", "ספר מוסר", "עיקרי האמונה", "פילוסוף יהודי ימי הביניים", "ספר הגות יהודי", "תנועת המוסר"]
  };
  async function fromWikipedia(category) {
    let title = null;
    // חצי מהפעמים: נושא אקראי מתוך חיפוש רחב בוויקיפדיה – כך התוכן מתחדש כמעט בלי סוף
    if (Math.random() < 0.6) {
      try {
        const q = pick(WIKI_SEARCH[category]);
        const s = await getJSON(`https://he.wikipedia.org/w/api.php?action=query&list=search&srnamespace=0&srlimit=50&srsearch=${encodeURIComponent(q)}&format=json&origin=*`);
        const titles = (s.query?.search || []).map((r) => r.title).filter((t) => !/^\d|רשימת|\(פירושונים\)/.test(t));
        if (titles.length) title = pickFresh("w:", titles);
      } catch {}
    }
    if (!title) title = pickFresh("w:", WIKI_TOPICS[category] || WIKI_TOPICS.philosophy);
    markUsed("w:" + title);
    const url = `https://he.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&exintro=1&explaintext=1&redirects=1&pithumbsize=600&format=json&origin=*&titles=${encodeURIComponent(title)}`;
    const j = await getJSON(url);
    const page = Object.values(j.query?.pages || {})[0];
    if (!page || page.missing !== undefined || !page.extract || page.extract.length < 200) throw new Error("no wiki");
    return {
      kind: "wiki", category, lang: "he",
      title: page.title,
      text: page.extract,
      sourceTitle: `ויקיפדיה: ${page.title}`,
      sourceAuthor: "ויקיפדיה העברית",
      url: `https://he.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      image: page.thumbnail?.source || null,
      wiki: page.title
    };
  }

  /* ── 2. ספריא – פרקי אבות + פירוש ברטנורא ── */
  const AVOT = [18, 16, 18, 22, 23, 11]; // מספר משניות בכל פרק
  const HEB_NUM = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב", "יג", "יד", "טו", "טז", "יז", "יח", "יט", "כ", "כא", "כב", "כג"];
  async function fromSefaria() {
    const ALL_AVOT = AVOT.flatMap((n, ci) => Array.from({ length: n }, (_, mi) => `${ci + 1}.${mi + 1}`));
    const cm = pickFresh("a:", ALL_AVOT);
    markUsed("a:" + cm);
    const [c, m] = cm.split(".").map(Number);
    const ref = `Pirkei_Avot.${c}.${m}`;
    const j = await getJSON(`https://www.sefaria.org/api/texts/${ref}?context=0&commentary=0`);
    const he = stripHtml(Array.isArray(j.he) ? j.he.join(" ") : j.he);
    if (!he) throw new Error("no sefaria");
    let comm = "";
    try {
      const b = await getJSON(`https://www.sefaria.org/api/texts/Bartenura_on_${ref}?context=0&commentary=0`);
      comm = stripHtml([].concat(b.he || []).flat(3).join(" "));
    } catch {}
    return {
      kind: "sefaria", category: "judaism", lang: "he",
      title: `פרקי אבות ${HEB_NUM[c]}, ${HEB_NUM[m]}`,
      text: he,
      extra: comm,
      sourceTitle: `פרקי אבות, ${HEB_NUM[c]}', ${HEB_NUM[m]}`,
      sourceAuthor: "משנה · ספריא",
      url: `https://www.sefaria.org/${ref}?lang=he`,
      sefaria: ref
    };
  }

  /* ── 2ב. ספריא – ספרי אמונה ומחשבת ישראל (קטע אקראי מפרק אקראי) ── */
  const FAITH_BOOKS = [
    { label: "ספר הכוזרי", author: "ר' יהודה הלוי", wiki: "ספר הכוזרי", refs: () => `Sefer_Kuzari.${1 + Math.floor(Math.random() * 5)}` }, // מאמר שלם – נחתך ממנו קטע אקראי
    { label: "מורה נבוכים", author: "הרמב\"ם", wiki: "מורה נבוכים", refs: () => { const p = pick([[1, 76], [2, 48], [3, 54]]); return `Guide_for_the_Perplexed,_Part_${p[0]}.${1 + Math.floor(Math.random() * p[1])}`; } },
    { label: "משנה תורה, הלכות יסודי התורה", author: "הרמב\"ם", wiki: "משנה תורה", refs: () => `Mishneh_Torah,_Foundations_of_the_Torah.${1 + Math.floor(Math.random() * 10)}` },
    { label: "ספר העיקרים", author: "ר' יוסף אלבו", wiki: "ספר העיקרים", refs: () => `Sefer_HaIkkarim,_Maamar_1.${1 + Math.floor(Math.random() * 26)}` },
    { label: "חובות הלבבות, שער הבטחון", author: "רבנו בחיי", wiki: "חובות הלבבות", refs: () => `Duties_of_the_Heart,_Fourth_Treatise_on_Trust.${1 + Math.floor(Math.random() * 7)}` },
    { label: "מסילת ישרים", author: "הרמח\"ל", wiki: "מסילת ישרים", refs: () => `Mesilat_Yesharim.${1 + Math.floor(Math.random() * 26)}` },
    { label: "ספר התניא", author: "רבי שניאור זלמן מלאדי", wiki: "ספר התניא", refs: () => `Tanya,_Part_I;_Likkutei_Amarim.${1 + Math.floor(Math.random() * 53)}` }
  ];
  const wcount = (s) => s.split(/\s+/).filter(Boolean).length;
  async function fromFaithBook() {
    const book = pick(FAITH_BOOKS);
    let ref = book.refs();
    for (let i = 0; i < 3 && used.has("f:" + ref); i++) ref = book.refs();
    markUsed("f:" + ref);
    const j = await getJSON(`https://www.sefaria.org/api/texts/${encodeURIComponent(ref)}?context=0&commentary=0`);
    const segs = [].concat(j.he || []).flat(3).map(stripHtml).filter((s) => wcount(s) >= 4);
    if (!segs.length) throw new Error("empty");
    // בוחרים נקודת פתיחה אקראית ואוספים 70-140 מילים
    let start = Math.floor(Math.random() * Math.max(1, segs.length - 2)), text = "", extra = "";
    for (let i = start; i < segs.length && wcount(text) < 70; i++) text += (text ? " " : "") + segs[i], start = i;
    for (let i = start + 1; i < segs.length && wcount(extra) < 160; i++) extra += (extra ? " " : "") + segs[i];
    if (wcount(text) < 35) throw new Error("short");
    const heRef = j.heRef || book.label;
    return {
      kind: "faith", category: "judaism", lang: "he",
      title: book.label, text, extra,
      sourceTitle: heRef, sourceAuthor: `${book.author} · ספריא`,
      url: `https://www.sefaria.org/${encodeURIComponent(ref)}?lang=he`,
      sefaria: ref, wiki: book.wiki
    };
  }

  /* ── 3. Open Library – ספרי עיון לפי נושא ── */
  const OL_SUBJECT = { philosophy: "philosophy", physics: "astrophysics", biology: "evolution", psychology: "psychology", tech: "computer_science", judaism: "jewish_philosophy" };
  async function fromOpenLibrary(category) {
    const j = await getJSON(`https://openlibrary.org/subjects/${OL_SUBJECT[category]}.json?limit=40`);
    const FICTION = /fiction|novel|juvenile|stories|comic/i;
    const works = (j.works || []).filter((w) => w.cover_id && !(w.subject || []).some((s) => FICTION.test(s)));
    const w = pick(works);
    if (!w) throw new Error("no ol");
    const d = await getJSON(`https://openlibrary.org${w.key}.json`);
    const desc = typeof d.description === "string" ? d.description : d.description?.value;
    if (!desc || desc.length < 120) throw new Error("no desc");
    const author = (w.authors || []).map((a) => a.name).join(", ");
    return {
      kind: "book", category, lang: "en",
      title: w.title,
      text: desc.replace(/\(\[source\][^)]*\)/g, "").replace(/-{3,}[\s\S]*/, "").trim(),
      sourceTitle: w.title,
      sourceAuthor: author,
      url: `https://openlibrary.org${w.key}`,
      image: `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg`
    };
  }

  /* ── 4א. arXiv – תקצירי מחקר (דרך proxy בשרת, או ישירות אם יש CORS) ── */
  const ARXIV_CAT = { physics: ["astro-ph.CO", "quant-ph", "gr-qc", "hep-th"], tech: ["cs.AI", "cs.LG", "cs.CL", "cs.SE"] };
  async function fromArxiv(category) {
    const cat = pick(ARXIV_CAT[category]);
    const api = `https://export.arxiv.org/api/query?search_query=cat:${cat}&sortBy=submittedDate&sortOrder=descending&max_results=25`;
    let xml;
    if (await hasServer()) {
      const r = await withTimeout(fetch(`/api/proxy?url=${encodeURIComponent(api)}`));
      xml = await r.text();
    } else {
      const r = await withTimeout(fetch(api));
      xml = await r.text();
    }
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const entries = [...doc.querySelectorAll("entry")];
    const e = pick(entries);
    if (!e) throw new Error("no arxiv");
    const get = (t) => e.querySelector(t)?.textContent.replace(/\s+/g, " ").trim() || "";
    const authors = [...e.querySelectorAll("author name")].map((n) => n.textContent);
    return {
      kind: "arxiv", category, lang: "en",
      title: get("title"),
      text: get("summary"),
      sourceTitle: `arXiv: ${get("title")}`,
      sourceAuthor: authors.slice(0, 3).join(", ") + (authors.length > 3 ? " ועוד" : ""),
      url: get("id")
    };
  }

  /* ── 4ב. Hacker News – מאמרי עומק בטכנולוגיה ── */
  async function fromHN() {
    const ids = await getJSON("https://hacker-news.firebaseio.com/v0/beststories.json");
    for (let i = 0; i < 5; i++) {
      const it = await getJSON(`https://hacker-news.firebaseio.com/v0/item/${pick(ids.slice(0, 60))}.json`);
      if (!it || !it.title) continue;
      const host = it.url ? new URL(it.url).hostname.replace(/^www\./, "") : "news.ycombinator.com";
      const text = it.text
        ? stripHtml(it.text)
        : `${it.title}. A highly-ranked discussion on Hacker News (${it.score} points, ${it.descendants || 0} comments), linking to ${host}. Open the original article for the full story.`;
      return {
        kind: "hn", category: "tech", lang: "en",
        title: it.title, text,
        sourceTitle: `${it.title} (${host})`,
        sourceAuthor: `Hacker News · ${it.by}`,
        url: it.url || `https://news.ycombinator.com/item?id=${it.id}`
      };
    }
    throw new Error("no hn");
  }

  /* בחירת מקור לפי קטגוריה */
  const ROUTES = {
    philosophy: [fromWikipedia, fromWikipedia, fromOpenLibrary],
    physics: [fromWikipedia, fromArxiv, fromOpenLibrary],
    biology: [fromWikipedia, fromWikipedia, fromOpenLibrary],
    psychology: [fromWikipedia, fromWikipedia, fromOpenLibrary],
    tech: [fromArxiv, fromHN, fromWikipedia, fromOpenLibrary],
    judaism: [fromFaithBook, fromFaithBook, fromSefaria, fromWikipedia]
  };
  async function fetchRaw(category) {
    const llm = (await hasServer()) && window.__LLM_ON__;
    // בלי LLM: תקצירי Open Library באנגלית/בשפות שונות פחות קריאים – נשתמש בהם רק עם עיבוד AI
    const fns = ROUTES[category].filter((fn) => llm || fn !== fromOpenLibrary).sort(() => Math.random() - 0.5);
    for (const fn of fns) {
      try { return await fn(category); } catch (e) { /* נסה מקור אחר */ }
    }
    throw new Error("all sources failed");
  }

  /* ── 5. Formatter: LLM בשרת, או עיבוד מקומי ── */
  const words = (s) => s.split(/\s+/).filter(Boolean);
  // פיצול רק כשאחרי סימן הפיסוק יש רווח (כך "6.2" או "U.S" לא נחתכים)
  const splitSentences = (s) => String(s || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?:;]["”׳']?)\s+(?=\S)/).map((x) => x.trim()).filter((x) => x.length > 2);
  const clip = (s, n) => { const w = words(s); return w.length <= n ? s : w.slice(0, n).join(" ") + "…"; };

  const HOOKS_HE = {
    wiki: ["{t}: הרעיון הגדול בדקה אחת", "מה באמת צריך לדעת על {t}?", "{t} – הסיפור שמאחורי המושג", "למה כולם מדברים על {t}?"],
    sefaria: ["משפט אחד מהמשנה שכדאי לשאת היום", "חוכמת אבות: {t}", "דקה עם פרקי אבות – {t}"],
    faith: ["קטע ליום מתוך {t}", "דקה עם {t}", "רעיון עומק מתוך {t}", "מה אומר {t}?", "פנינה מתוך {t}"],
    book: ["ספר שכדאי להכיר: {t}", "מה מלמד הספר \"{t}\"?"],
    arxiv: ["מחקר טרי: {t}", "מהמעבדה: {t}"],
    hn: ["מדברים על זה עכשיו: {t}"]
  };

  function localFormat(raw) {
    // ערכי ויקיפדיה: מסירים סוגריים (תעתיקים, תאריכים) לטובת קריאות
    const clean = raw.kind === "wiki" ? raw.text.replace(/\s*\([^()]{0,220}\)/g, "").replace(/\s+([,.])/g, "$1") : raw.text;
    const sents = splitSentences(clean);
    let body = "", i = 0;
    while (i < sents.length && words(body).length < 85) { body += (body ? " " : "") + sents[i]; i++; }
    body = clip(body || raw.text, 130);
    let rest = sents.slice(i);
    // נקודות מפתח: משפטים קצרים מהמשך הטקסט, או ממשפטי הגוף
    let pool = rest.length >= 2 ? rest : sents.slice(1);
    let takeaways = pool.slice(0, 3).map((s) => clip(s.replace(/[.!?]+$/, ""), 12));
    if (raw.kind === "sefaria") {
      // נקודות מפתח מתוך משפטי המשנה עצמה (לפי פסוקיות), ההרחבה – מפירוש ברטנורא
      const parts = raw.text.split(/[,.:;]\s+/).map((s) => s.trim()).filter((s) => words(s).length >= 2);
      takeaways = parts.slice(0, 3).map((s) => clip(s, 10));
      rest = [];
    }
    if (!takeaways.length) takeaways = [clip(sents[0] || raw.title, 12)];
    const tpl = pick(HOOKS_HE[raw.kind] || HOOKS_HE.wiki);
    if (raw.kind === "faith") { // ההמשך בספר הוא ההרחבה
      rest = splitSentences(raw.extra || "");
    }
    const deep = raw.kind === "sefaria"
      ? (raw.extra ? "פירוש רבי עובדיה מברטנורא: " + clip(raw.extra, 260) : "")
      : clip(rest.join(" "), 260);
    return {
      hook: tpl.replace("{t}", raw.title.length > 60 ? clip(raw.title, 9) : raw.title),
      body, takeaways, deep, formattedBy: "local"
    };
  }

  async function formatCard(raw) {
    let f = null;
    if ((await hasServer()) && window.__LLM_ON__) {
      try {
        const r = await withTimeout(fetch("/api/format", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw })
        }), 45000);
        if (r.ok) { f = await r.json(); f.formattedBy = "llm"; }
      } catch {}
    }
    if (!f || !f.body) f = localFormat(raw);
    return {
      // מזהה יציב לפי התוכן – אותו קטע תמיד מקבל אותו מזהה, כך שאפשר לזהות שכבר נראה
      id: `live-${raw.kind}-${hash(raw.url + "|" + String(f.body).slice(0, 40))}`,
      category: raw.category,
      hook: f.hook,
      body: f.body,
      takeaways: (f.takeaways || []).slice(0, 3),
      deep: f.deep || "",
      source: { title: raw.sourceTitle, author: raw.sourceAuthor },
      url: raw.url,
      image: raw.image || null,
      wiki: raw.wiki,
      sefaria: raw.sefaria,
      lang: f.formattedBy === "llm" ? "he" : raw.lang,
      live: raw.kind,
      formattedBy: f.formattedBy
    };
  }

  async function fetchLiveCard(category) {
    const raw = await fetchRaw(category);
    return formatCard(raw);
  }

  /* תמונת כריכה/איור להרחבה: Open Library לפי שם, נפילה לוויקיפדיה */
  async function fetchWikiImage(title) {
    try {
      const j = await getJSON(`https://he.wikipedia.org/w/api.php?action=query&prop=pageimages&pithumbsize=500&redirects=1&format=json&origin=*&titles=${encodeURIComponent(title)}`);
      const p = Object.values(j.query?.pages || {})[0];
      return p?.thumbnail?.source || null;
    } catch { return null; }
  }

  window.Sources = { fetchLiveCard, fetchWikiImage, hasServer, localFormat, hash };
})();
