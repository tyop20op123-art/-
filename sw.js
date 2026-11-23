// Service worker: האפליקציה עובדת גם בלי רשת.
// קבצי האפליקציה – מהמטמון (ומתעדכנים ברקע). בקשות למקורות חיים – ישר לרשת.
const VERSION = "tovana-v4"; // להעלות בכל עדכון תוכן, כדי שמכשירים מותקנים יתעדכנו
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/styles.css", "./js/seed.js", "./js/seed-emunah.js","./js/sources.js", "./js/app.js", "./js/firebase-config.js", "./js/account.js", "./data/pack.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return; // ויקיפדיה, ספריא וכו' – רשת בלבד
  if (sameOrigin && url.pathname.includes("/api/")) return;

  // stale-while-revalidate
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
