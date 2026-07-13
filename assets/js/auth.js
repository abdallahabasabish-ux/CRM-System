/**
 * تسجيل الدخول
 * @param {string} email
 * @param {string} password
 * @returns {Promise}
 */
function loginUser(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

/**
 * تسجيل الخروج
 * @returns {Promise}
 */
function logoutUser() {
  return auth.signOut();
}

/**
 * مراقبة حالة المستخدم
 * @param {Function} callback - دالة تستقبل المستخدم أو null
 */
function onAuthStateChanged(callback) {
  auth.onAuthStateChanged(user => {
    callback(user);
  });
}

/**
 * الحصول على المستخدم الحالي (مزامن)
 */
function getCurrentUser() {
  return auth.currentUser;
}
