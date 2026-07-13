import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";

/**
 * تسجيل الدخول
 */
export function loginUser(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * تسجيل الخروج
 */
export function logoutUser() {
  return signOut(auth);
}

/**
 * مراقبة حالة المستخدم
 */
export function onAuthStateChangedCallback(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * الحصول على المستخدم الحالي
 */
export function getCurrentUser() {
  return auth.currentUser;
}
