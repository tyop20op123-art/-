/* חיבור לחשבונות ולמאגר המידע (Supabase).
   כל עוד הערך הוא null – כפתור החשבון מוסתר, והכול נשמר במכשיר בלבד.
   הערכים כאן אינם סודיים: המפתח הוא "publishable" (ציבורי), וההגנה על הנתונים
   נעשית בכללי Row Level Security שבקובץ supabase/schema.sql. */
window.SUPABASE_CONFIG = {
  url: "https://rbiuqkxdnrtjbtildvzv.supabase.co",
  key: "sb_publishable_x3qkUrquYfKo2UtAB4xpDQ_aUgq7t0C",
  google: false
};

/* דוגמה:
window.SUPABASE_CONFIG = {
  url: "https://xxxxxxxx.supabase.co",
  key: "sb_publishable_...",
  google: false   // true אחרי שמגדירים כניסה עם Google ב-Supabase
};
*/
