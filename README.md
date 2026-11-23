# תובנה · כרטיסיות ידע

פיד אינסופי של כרטיסיות ידע בעברית (RTL), בגלילה אנכית מלאה כמו Reels.
קטגוריות: פילוסופיה · מדע - פיזיקה · מדע - ביולוגיה · פסיכולוגיה · טכנולוגיה · יהדות (אמונה).

- 46 כרטיסיות ערוכות + כ-180 כרטיסיות בחבילה שעובדת גם בלי רשת
- תוכן חי מוויקיפדיה, ספריא (כוזרי, מורה נבוכים, ספר העיקרים, תניא ועוד), Hacker News, arXiv ו-Open Library
- כרטיסייה שכבר נראתה לא חוזרת עד שנגמר כל התוכן החדש
- שמירה, "תובנה חזקה", שיתוף, "העמק עוד", הספרייה שלי, תצוגת ספר, יעד יומי ורצף
- חשבון (Google או אימייל) שמסנכרן את השמורים בין מכשירים
- ניתנת להתקנה בטלפון (PWA) ועובדת אופליין

## הפעלה כאתר (GitHub Pages)

1. ב-GitHub: **Settings ← Pages ← Source: Deploy from a branch ← main / (root) ← Save**.
2. אחרי דקה האתר זמין בכתובת `https://USERNAME.github.io/REPO/`.
3. פותחים בטלפון ← כפתור "התקנה" (אנדרואיד) או שיתוף ← "הוסף למסך הבית" (אייפון).
4. ל-APK אמיתי: מכניסים את הכתובת ב-pwabuilder.com ← Android.

## הפעלת חשבונות (אופציונלי)

בלי הגדרה – הכול נשמר במכשיר בלבד, וכפתור החשבון מוסתר.
להפעלה: עקבו אחרי ההוראות שבראש [`js/firebase-config.js`](js/firebase-config.js) (פרויקט Firebase חינמי,
הפעלת Google ו-Email/Password, Firestore עם הכללים מ-[`firestore.rules`](firestore.rules)), והדביקו את ה-config.
חשוב להוסיף את `USERNAME.github.io` ל-Authorized domains.

## שרת עם AI (אופציונלי)

```
npm install
npm start          # http://localhost:5173
```
עם `ANTHROPIC_API_KEY` השרת מעבד טקסט גולמי לכרטיסייה בעברית (Claude), ומאפשר arXiv ו-Open Library.

## מבנה

| קובץ | תפקיד |
|---|---|
| `js/seed.js`, `js/seed-emunah.js` | כרטיסיות ערוכות |
| `data/pack.json` | חבילת תוכן מוכנה (עובדת בלי רשת) |
| `js/sources.js` | מקורות חיים + עיבוד לכרטיסייה |
| `js/app.js` | פיד, מניעת חזרות, מעקב קריאה, יעד ורצף, ספרייה |
| `js/account.js`, `js/firebase-config.js`, `firestore.rules` | חשבונות וסנכרון |
| `sw.js`, `manifest.webmanifest`, `icons/` | התקנה ואופליין |
| `server.js` | שרת Node אופציונלי: עיבוד AI ו-proxy |

## קיצורי מקלדת
`↑/↓` או `J/K` – ניווט · `B` – שמירה · `L` – אהבתי · `D` – העמק עוד · `S` – שיתוף · `Esc` – סגירה.
