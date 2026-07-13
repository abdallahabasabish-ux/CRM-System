// ============================
// 1. التحقق من الصلاحية (مدير فقط)
// ============================
onAuthStateChangedCallback(async (user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }


  // تحديث بيانات المستخدم في الـ Sidebar
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserEmail = document.getElementById('sidebarUserEmail');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  if (sidebarUserName) sidebarUserName.textContent = user.displayName || user.email;
  if (sidebarUserEmail) sidebarUserEmail.textContent = user.email;
  if (sidebarAvatar) {
    sidebarAvatar.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
  }

  // التحقق من دور المستخدم
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    let role = 'موظف'; // افتراضي
    if (userDoc.exists()) {
      role = userDoc.data().role || 'موظف';
    }

    // ✅ تم إصلاح الخطأ الإملائي هنا لدعم "مدير" بالعربية أو "admin" بالإنجليزية
    if (role === 'مدير' || role === 'admin') {
      // إظهار محتوى الإعدادات
      document.getElementById('settingsContent').style.display = 'block';
      document.getElementById('unauthorizedMessage').style.display = 'none';
      // تحميل البيانات
      loadUsers();
      loadSettings();
      // تهيئة المودال
      const modalEl = document.getElementById('addUserModal');
      if (modalEl) {
        addUserModalInstance = new bootstrap.Modal(modalEl);
      }
    } else {
      // غير مصرح
      document.getElementById('settingsContent').style.display = 'none';
      document.getElementById('unauthorizedMessage').style.display = 'block';
    }
  } catch (error) {
    console.error('Error checking user role:', error);
    // في حالة خطأ، نعتبره غير مصرح
    document.getElementById('settingsContent').style.display = 'none';
    document.getElementById('unauthorizedMessage').style.display = 'block';
  }
});
