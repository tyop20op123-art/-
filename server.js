// שרת אופציונלי: מגיש את האפליקציה, proxy ל-arXiv, ושכבת LLM שמעבדת טקסט גולמי לכרטיסייה בעברית.
// הפעלה: npm install && npm start   (ל-LLM: הגדר ANTHROPIC_API_KEY או התחבר עם `ant auth login`)
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const MODEL = "claude-opus-5-5";

// Anthropic SDK נטען רק אם מותקן ויש הרשאות; אחרת השרת עובד בלי LLM.
let client = null;
try {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  client = new Anthropic();
} catch {
  console.warn("[llm] @anthropic-ai/sdk לא זמין – עיבוד מקומי בלבד");
}

const CARD_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string", description: "כותרת מסקרנת קצרה בעברית, עד 14 מילים" },
    body: { type: "string", description: "גוף התובנה בעברית, 90-120 מילים" },
    takeaways: { type: "array", items: { type: "string" }, description: "3 נקודות מפתח קצרות" },
    deep: { type: "string", description: "הרחבה בעברית, 120-180 מילים" }
  },
  required: ["hook", "body", "takeaways", "deep"],
  additionalProperties: false
};

const SYSTEM = `אתה עורך תוכן לאפליקציית למידה בסגנון Deepstash.
תקבל טקסט גולמי (עברית או אנגלית) ממקור פתוח. החזר כרטיסיית ידע בעברית תקנית וקולחת:
- hook: משפט פתיחה מסקרן ומדויק (לא קליקבייט שקרי).
- body: 90-120 מילים שמסבירות את הרעיון המרכזי בבהירות, לקורא משכיל שאינו מומחה.
- takeaways: בדיוק 3 נקודות, כל אחת עד 9 מילים.
- deep: 120-180 מילים של הקשר, רקע והשלכות.
הישען רק על המידע שבטקסט ועל ידע כללי מבוסס. אל תמציא ציטוטים, מספרים או מקורות.
אם המקור הוא טקסט תורני, צטט אותו במדויק ופרש בזהירות.`;

async function formatWithLLM(raw) {
  const userText = `קטגוריה: ${raw.category}\nמקור: ${raw.sourceTitle} / ${raw.sourceAuthor}\nכותרת: ${raw.title}\n\nטקסט גולמי:\n${raw.text}\n${raw.extra ? `\nפירוש נלווה:\n${raw.extra}` : ""}`;
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: CARD_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: userText }]
  });
  if (response.stop_reason === "refusal") throw new Error("refusal");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const card = JSON.parse(text);
  card.takeaways = card.takeaways.slice(0, 3);
  return card;
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const PROXY_HOSTS = new Set(["export.arxiv.org"]);
const cache = new Map(); // מטמון פשוט לעיבוד LLM

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req) {
  let data = "";
  for await (const chunk of req) { data += chunk; if (data.length > 200_000) throw new Error("too large"); }
  return JSON.parse(data || "{}");
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/health") return send(res, 200, { ok: true, llm: !!client });

    if (url.pathname === "/api/proxy") {
      const target = new URL(url.searchParams.get("url") || "");
      if (!PROXY_HOSTS.has(target.hostname)) return send(res, 403, { error: "host not allowed" });
      const r = await fetch(target, { headers: { "User-Agent": "insight-feed/1.0" } });
      return send(res, r.status, await r.text(), r.headers.get("content-type") || "text/plain");
    }

    if (url.pathname === "/api/format" && req.method === "POST") {
      if (!client) return send(res, 503, { error: "llm unavailable" });
      const { raw } = await readBody(req);
      if (!raw?.text) return send(res, 400, { error: "missing raw.text" });
      const key = raw.url || raw.title;
      if (!cache.has(key)) cache.set(key, await formatWithLLM(raw));
      return send(res, 200, cache.get(key));
    }

    // קבצים סטטיים
    let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    if (!p) p = "index.html";
    const file = path.join(here, p);
    if (!file.startsWith(here) || p.startsWith("node_modules")) return send(res, 403, "forbidden", "text/plain");
    const buf = await fs.readFile(file);
    return send(res, 200, buf, MIME[path.extname(file)] || "application/octet-stream");
  } catch (e) {
    if (e.code === "ENOENT") return send(res, 404, "not found", "text/plain");
    console.error(e);
    return send(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, () => console.log(`Insight feed → http://localhost:${PORT}`));
