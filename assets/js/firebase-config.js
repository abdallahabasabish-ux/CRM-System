// استبدل هذه القيم بالبيانات من Firebase Console
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);

// جاهزية المصادقة و Firestore
const auth = firebase.auth();
const db = firebase.firestore();

// تفعيل استخدام المصادقة المستمرة
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
