import { onAuthStateChangedCallback, logoutUser } from '../auth.js';
import { auth, db } from '../firebase-config.js';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';

// ============================
// متغيرات عامة
// ============================
let usersList = [];
let usersListener = null;
let currentUserRole = null;
let currentUserEmail = null;
let addUserModalInstance = null;

// ============================
// 1. المصادقة والتحقق من الصلاحية (مدير فقط)
// ============================
onAuthStateChangedCallback(async (user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }
  // تحديث بيانات الـ Sidebar
  document.getElementById('sidebarUserName').textContent = user.displayName || user.email;
  document.getElementById('sidebarUserEmail').textContent = user.email;
  document.getElementById('sidebarAvatar').textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();

  currentUserEmail = user.email;

  // التحقق من دور المستخدم من Firestore
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      currentUserRole = data.role;
      if (currentUserRole !== 'مدير') {
        Swal.fire({
          title: 'غير مصرح',
          text: 'أنت لا تملك صلاحية الوصول إلى صفحة الإعدادات.',
          icon: 'error',
          confirmButtonText: 'رجوع'
        }).then(() => {
          window.location.href = 'dashboard.html';
        });
        return;
      }
    } else {
      // إذا لم يكن للمستخدم دور، نعتبره غير مصرح
      Swal.fire({
        title: 'غير مصرح',
        text: 'ليس لديك صلاحيات كافية.',
        icon: 'error',
        confirmButtonText: 'رجوع'
      }).then(() => {
        window.location.href = 'dashboard.html';
      });
      return;
    }
  } catch (error) {
    console.error('Error checking user role:', error);
    showToast('حدث خطأ في التحقق من الصلاحيات', 'error');
    window.location.href = 'dashboard.html';
    return;
  }

  // بعد التأكد من الصلاحية، نبدأ تحميل البيانات
  loadUsers();
  loadSettings();

  // تهيئة مودال إضافة مستخدم
  const modalEl = document.getElementById('addUserModal');
  if (modalEl) {
    addUserModalInstance = new bootstrap.Modal(modalEl);
  }
});

// ============================
// 2. تسجيل الخروج وتبديل الوضع
// ============================
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await logoutUser();
  window.location.href = '../login.html';
});

const themeToggle = document.getElementById('themeToggle');
const htmlElement = document.documentElement;
const savedTheme = localStorage.getItem('theme') || 'light';
if (savedTheme === 'dark') {
  htmlElement.setAttribute('data-theme', 'dark');
  themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
}
themeToggle.addEventListener('click', () => {
  const currentTheme = htmlElement.getAttribute('data-theme');
  if (currentTheme === 'dark') {
    htmlElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
    themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
  } else {
    htmlElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
  }
});

document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ============================
// 3. دوال مساعدة (Toast)
// ============================
function showToast(message, type = 'success') {
  const colors = {
    success: 'linear-gradient(to right, #00b09b, #96c93d)',
    error: 'linear-gradient(to right, #ff5f6d, #ffc371)',
    warning: 'linear-gradient(to right, #f7971e, #ffd200)',
    info: 'linear-gradient(to right, #2193b0, #6dd5ed)'
  };
  Toastify({
    text: message,
    duration: 3000,
    gravity: 'bottom',
    position: 'left',
    style: { background: colors[type] || colors.info },
    className: 'rounded-3 shadow'
  }).showToast();
}

// ============================
// 4. تحميل قائمة المستخدمين (Realtime)
// ============================
function loadUsers() {
  if (usersListener) {
    usersListener();
  }
  usersListener = onSnapshot(collection(db, 'users'), (snapshot) => {
    usersList = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    }));
    renderUsersTable();
  }, (error) => {
    console.error('Error listening to users:', error);
    showToast('حدث خطأ في تحميل المستخدمين', 'error');
  });
}

// ============================
// 5. عرض جدول المستخدمين
// ============================
function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (usersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا يوجد مستخدمين</td></tr>`;
    return;
  }

  let html = '';
  usersList.forEach(u => {
    const statusBadge = u.disabled ? 'badge bg-danger' : 'badge bg-success';
    const statusText = u.disabled ? 'معطل' : 'نشط';
    html += `
      <tr>
        <td>${escapeHtml(u.email || '')}</td>
        <td><span class="badge bg-primary">${escapeHtml(u.role || 'موظف')}</span></td>
        <td><span class="${statusBadge}">${statusText}</span></td>
        <td>${u.createdAt ? formatDate(u.createdAt) : '-'}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-user-btn" data-uid="${u.uid}" title="تعديل الدور">
            <i class="fas fa-user-edit"></i>
          </button>
          ${u.uid !== auth.currentUser?.uid ? `
            <button class="btn btn-sm btn-outline-${u.disabled ? 'success' : 'warning'} toggle-user-btn" data-uid="${u.uid}" data-disabled="${u.disabled ? 'true' : 'false'}" title="${u.disabled ? 'تفعيل' : 'تعطيل'}">
              <i class="fas fa-${u.disabled ? 'check-circle' : 'ban'}"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger delete-user-btn" data-uid="${u.uid}" title="حذف">
              <i class="fas fa-trash"></i>
            </button>
          ` : `
            <span class="text-muted small">(أنت)</span>
          `}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // أحداث الأزرار
  tbody.querySelectorAll('.edit-user-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditRoleModal(btn.dataset.uid));
  });
  tbody.querySelectorAll('.toggle-user-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleUserStatus(btn.dataset.uid, btn.dataset.disabled === 'true'));
  });
  tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteUser(btn.dataset.uid));
  });
}

// ============================
// 6. فتح مودال تعديل الدور
// ============================
function openEditRoleModal(uid) {
  const user = usersList.find(u => u.uid === uid);
  if (!user) {
    showToast('المستخدم غير موجود', 'error');
    return;
  }

  Swal.fire({
    title: 'تعديل دور المستخدم',
    html: `
      <p>المستخدم: <strong>${escapeHtml(user.email)}</strong></p>
      <select id="newRoleSelect" class="form-select mt-2">
        <option value="مدير" ${user.role === 'مدير' ? 'selected' : ''}>مدير</option>
        <option value="محاسب" ${user.role === 'محاسب' ? 'selected' : ''}>محاسب</option>
        <option value="موظف" ${user.role === 'موظف' ? 'selected' : ''}>موظف</option>
        <option value="مشرف" ${user.role === 'مشرف' ? 'selected' : ''}>مشرف</option>
      </select>
    `,
    showCancelButton: true,
    confirmButtonText: 'حفظ',
    cancelButtonText: 'إلغاء',
    preConfirm: () => {
      const newRole = document.getElementById('newRoleSelect').value;
      return newRole;
    }
  }).then(async (result) => {
    if (result.isConfirmed && result.value) {
      try {
        await updateDoc(doc(db, 'users', uid), { role: result.value, updatedAt: new Date().toISOString() });
        showToast('تم تحديث دور المستخدم بنجاح', 'success');
      } catch (error) {
        console.error('Error updating user role:', error);
        showToast('حدث خطأ أثناء التحديث', 'error');
      }
    }
  });
}

// ============================
// 7. تبديل حالة المستخدم (تفعيل/تعطيل)
// ============================
async function toggleUserStatus(uid, currentlyDisabled) {
  const newStatus = !currentlyDisabled;
  const action = newStatus ? 'تعطيل' : 'تفعيل';
  const result = await Swal.fire({
    title: `${action} المستخدم؟`,
    text: `هل أنت متأكد من ${action} هذا المستخدم؟`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم',
    cancelButtonText: 'إلغاء'
  });
  if (result.isConfirmed) {
    try {
      await updateDoc(doc(db, 'users', uid), { disabled: newStatus, updatedAt: new Date().toISOString() });
      showToast(`تم ${action} المستخدم بنجاح`, 'success');
    } catch (error) {
      console.error('Error toggling user status:', error);
      showToast('حدث خطأ أثناء تغيير الحالة', 'error');
    }
  }
}

// ============================
// 8. حذف مستخدم
// ============================
async function confirmDeleteUser(uid) {
  const user = usersList.find(u => u.uid === uid);
  if (!user) return;

  const result = await Swal.fire({
    title: 'حذف المستخدم',
    text: `سيتم حذف المستخدم "${user.email}" نهائيًا، وكذلك حسابه في المصادقة.`,
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  });

  if (result.isConfirmed) {
    try {
      // حذف من Firestore
      await deleteDoc(doc(db, 'users', uid));
      // حذف من Authentication (يحتاج إلى إعادة المصادقة أو استخدام Admin SDK، لكننا سنستخدم الطريقة المبسطة)
      // ملاحظة: لا يمكن حذف مستخدم من الواجهة الأمامية بدون Admin SDK، لذا سنطلب من المدير حذفه يدوياً من Firebase Console أو استخدام Cloud Function.
      // هنا سنكتفي بحذف وثيقة Firestore وإظهار رسالة.
      showToast('تم حذف المستخدم من قاعدة البيانات، لكن يجب حذف حسابه من Firebase Console يدوياً.', 'warning');
    } catch (error) {
      console.error('Error deleting user:', error);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }
}

// ============================
// 9. إضافة مستخدم جديد
// ============================
document.getElementById('addUserBtn').addEventListener('click', () => {
  document.getElementById('addUserForm').reset();
  addUserModalInstance.show();
});

document.getElementById('saveNewUserBtn').addEventListener('click', async () => {
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const role = document.getElementById('newUserRole').value;

  if (!email || !password || !role) {
    showToast('جميع الحقول مطلوبة', 'warning');
    return;
  }

  const saveBtn = document.getElementById('saveNewUserBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الإضافة...';

  try {
    // إنشاء مستخدم في Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // حفظ البيانات في Firestore
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      role: role,
      disabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    showToast('تم إضافة المستخدم بنجاح', 'success');
    addUserModalInstance.hide();
  } catch (error) {
    console.error('Error adding user:', error);
    let msg = 'حدث خطأ أثناء الإضافة';
    if (error.code === 'auth/email-already-in-use') msg = 'البريد الإلكتروني مستخدم بالفعل';
    else if (error.code === 'auth/weak-password') msg = 'كلمة المرور ضعيفة (يجب أن تكون 6 أحرف على الأقل)';
    showToast(msg, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-user-plus me-2"></i>إضافة';
  }
});

// ============================
// 10. تحميل الإعدادات العامة
// ============================
async function loadSettings() {
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      document.getElementById('companyName').value = data.companyName || '';
      document.getElementById('companyLogo').value = data.companyLogo || '';
      document.getElementById('companyPhone').value = data.companyPhone || '';
      document.getElementById('companyEmail').value = data.companyEmail || '';
      document.getElementById('companyAddress').value = data.companyAddress || '';
      document.getElementById('currency').value = data.currency || '$';
      document.getElementById('taxRate').value = data.taxRate || 0;
      document.getElementById('timezone').value = data.timezone || 'Asia/Riyadh';
      document.getElementById('enableNotifications').checked = data.enableNotifications || false;
    } else {
      // إعدادات افتراضية
      document.getElementById('currency').value = '$';
      document.getElementById('taxRate').value = 0;
      document.getElementById('timezone').value = 'Asia/Riyadh';
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showToast('حدث خطأ في تحميل الإعدادات', 'error');
  }
}

// ============================
// 11. حفظ الإعدادات العامة
// ============================
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    companyName: document.getElementById('companyName').value.trim(),
    companyLogo: document.getElementById('companyLogo').value.trim(),
    companyPhone: document.getElementById('companyPhone').value.trim(),
    companyEmail: document.getElementById('companyEmail').value.trim(),
    companyAddress: document.getElementById('companyAddress').value.trim(),
    currency: document.getElementById('currency').value.trim(),
    taxRate: parseFloat(document.getElementById('taxRate').value) || 0,
    timezone: document.getElementById('timezone').value,
    enableNotifications: document.getElementById('enableNotifications').checked,
    updatedAt: new Date().toISOString()
  };

  const saveBtn = document.getElementById('saveSettingsBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';

  try {
    await setDoc(doc(db, 'settings', 'general'), data, { merge: true });
    showToast('تم حفظ الإعدادات بنجاح', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showToast('حدث خطأ أثناء حفظ الإعدادات', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ الإعدادات';
  }
});

// ============================
// 12. دوال مساعدة
// ============================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(date) {
  if (!date) return '-';
  if (typeof date === 'string') return date;
  if (date instanceof Date) return date.toISOString().slice(0,10);
  return '';
}

console.log('✅ صفحة الإعدادات جاهزة');
