/* הגדרות Firebase לחשבונות משתמשים (כניסה עם Google או אימייל + שמירה בענן).
   כל עוד הערך הוא null – כפתור החשבון מוסתר והאפליקציה עובדת כרגיל, עם שמירה במכשיר בלבד.

   איך מפעילים (פעם אחת, בחינם):
   1. https://console.firebase.google.com  ←  Add project
   2. Build ← Authentication ← Get started ← הפעילו "Google" ו-"Email/Password"
   3. Authentication ← Settings ← Authorized domains ← הוסיפו את הדומיין של האתר (למשל USERNAME.github.io)
   4. Build ← Firestore Database ← Create database ← Rules ← הדביקו את התוכן של firestore.rules ← Publish
   5. Project settings ← Your apps ← Web (</>) ← העתיקו את firebaseConfig לכאן במקום null

   הערכים האלה אינם סודיים: הם מזהים את הפרויקט, וההגנה על המידע נעשית בכללי firestore.rules. */
window.FIREBASE_CONFIG = null;

/* דוגמה:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "tovana-app.firebaseapp.com",
  projectId: "tovana-app",
  storageBucket: "tovana-app.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
*/
