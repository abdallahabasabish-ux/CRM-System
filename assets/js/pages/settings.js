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
  onSnapshot
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';

let usersList = [];
let usersListener = null;
let currentUserRole = null;
let currentUserUid = null;
let addUserModalInstance = null;

// ============================
// دوال مساعدة
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

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(date) {
  if (!date) return '-';
  if (typeof date === 'string') return date;
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  return '-';
}

// ============================
// التحقق من صلاحية المدير
// ============================
async function checkAdminRole(user) {
  if (!user) return false;
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      currentUserRole = data.role;
      currentUserUid = user.uid;
      return data.role === 'مدير';
    } else {
      // إذا لم يكن للمستخدم دور، نعتبره غير مصرح
      return false;
    }
  } catch (error) {
    console.error('Error checking role:', error);
    return false;
  }
}

// ============================
// تحميل المستخدمين (Realtime)
// ============================
function loadUsers() {
  if (usersListener) usersListener();
  usersListener = onSnapshot(collection(db, 'users'), (snapshot) => {
    usersList = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data()
    }));
    renderUsersTable();
  }, (error) => {
    console.error('Error loading users:', error);
    showToast('حدث خطأ في تحميل المستخدمين', 'error');
  });
}

// ============================
// عرض جدول المستخدمين
// ============================
function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  if (usersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">لا يوجد مستخدمين</td></tr>`;
    return;
  }
  let html = '';
  usersList.forEach(u => {
    const statusBadge = u.disabled ? 'badge bg-danger' : 'badge bg-success';
    const statusText = u.disabled ? 'معطل' : 'نشط';
    const isCurrentUser = u.uid === currentUserUid;
    html += `
      <tr>
        <td>${escapeHtml(u.email || '')}</td>
        <td><span class="badge bg-primary">${escapeHtml(u.role || 'موظف')}</span></td>
        <td><span class="${statusBadge}">${statusText}</span></td>
        <td>${u.createdAt ? formatDate(u.createdAt) : '-'}</td>
        <td>
          ${!isCurrentUser ? `
            <button class="btn btn-sm btn-outline-primary edit-user-btn" data-uid="${u.uid}" title="تعديل الدور">
              <i class="fas fa-user-edit"></i>
            </button>
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

  // ربط الأحداث
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
// تعديل دور المستخدم
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
    preConfirm: () => document.getElementById('newRoleSelect').value
  }).then(async (result) => {
    if (result.isConfirmed && result.value) {
      try {
        await updateDoc(doc(db, 'users', uid), { role: result.value, updatedAt: new Date().toISOString() });
        showToast('تم تحديث دور المستخدم', 'success');
      } catch (error) {
        console.error(error);
        showToast('حدث خطأ أثناء التحديث', 'error');
      }
    }
  });
}

// ============================
// تبديل حالة المستخدم
// ============================
async function toggleUserStatus(uid, currentlyDisabled) {
  const newStatus = !currentlyDisabled;
  const action = newStatus ? 'تعطيل' : 'تفعيل';
  const result = await Swal.fire({
    title: `${action} المستخدم؟`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم',
    cancelButtonText: 'إلغاء'
  });
  if (result.isConfirmed) {
    try {
      await updateDoc(doc(db, 'users', uid), { disabled: newStatus, updatedAt: new Date().toISOString() });
      showToast(`تم ${action} المستخدم`, 'success');
    } catch (error) {
      console.error(error);
      showToast('حدث خطأ', 'error');
    }
  }
}

// ============================
// حذف مستخدم (من Firestore فقط)
// ============================
async function confirmDeleteUser(uid) {
  const user = usersList.find(u => u.uid === uid);
  if (!user) return;
  const result = await Swal.fire({
    title: 'حذف المستخدم',
    text: `سيتم حذف المستخدم "${user.email}" من قاعدة البيانات.`,
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'حذف',
    cancelButtonText: 'إلغاء'
  });
  if (result.isConfirmed) {
    try {
      await deleteDoc(doc(db, 'users', uid));
      showToast('تم حذف المستخدم من القاعدة', 'success');
    } catch (error) {
      console.error(error);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }
}

// ============================
// إضافة مستخدم جديد
// ============================
async function addNewUser(email, password, role) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      role: role,
      disabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    showToast('تم إضافة المستخدم', 'success');
    return true;
  } catch (error) {
    console.error(error);
    let msg = 'حدث خطأ أثناء الإضافة';
    if (error.code === 'auth/email-already-in-use') msg = 'البريد مستخدم بالفعل';
    else if (error.code === 'auth/weak-password') msg = 'كلمة المرور ضعيفة';
    showToast(msg, 'error');
    return false;
  }
}

// ============================
// تحميل الإعدادات العامة
// ============================
async function loadSettings() {
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'general'));
    if (docSnap.exists()) {
      const data = docSnap.data();
      document.getElementById('companyName').value = data.companyName || '';
      document.getElementById('companyLogo').value = data.companyLogo || '';
      document.getElementById('companyPhone').value = data.companyPhone || '';
      document.getElementById('companyEmail').value = data.companyEmail || '';
      document.getElementById('companyAddress').value = data.companyAddress || '';
      document.getElementById('currency').value = data.currency || '$';
      document.getElementById('taxRate').value = data.taxRate || 0;
      document.getElementById('timezone').value = data.timezone || 'Asia/Riyadh';
      document.getElementById('enableNotifications').checked = data.enableNotifications || false;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showToast('حدث خطأ في تحميل الإعدادات', 'error');
  }
}

// ============================
// حفظ الإعدادات العامة
// ============================
async function saveSettings(e) {
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
  const btn = document.getElementById('saveSettingsBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';
  try {
    await setDoc(doc(db, 'settings', 'general'), data, { merge: true });
    showToast('تم حفظ الإعدادات', 'success');
  } catch (error) {
    console.error(error);
    showToast('حدث خطأ أثناء الحفظ', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ الإعدادات';
  }
}

// ============================
// تهيئة الصفحة
// ============================
function init() {
  console.log('🚀 Initializing Settings page...');

  onAuthStateChangedCallback(async (user) => {
    if (!user) {
      window.location.href = '../login.html';
      return;
    }

    // تحديث بيانات الـ Sidebar
    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserEmail = document.getElementById('sidebarUserEmail');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarUserName) sidebarUserName.textContent = user.displayName || user.email;
    if (sidebarUserEmail) sidebarUserEmail.textContent = user.email;
    if (sidebarAvatar) {
      sidebarAvatar.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
    }

    // التحقق من صلاحية المدير
    const isAdmin = await checkAdminRole(user);
    if (!isAdmin) {
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

    // تحميل البيانات
    loadUsers();
    loadSettings();

    // تهيئة مودال إضافة مستخدم
    const modalEl = document.getElementById('addUserModal');
    if (modalEl) {
      addUserModalInstance = new bootstrap.Modal(modalEl);
    }

    // أحداث الأزرار
    document.getElementById('addUserBtn')?.addEventListener('click', () => {
      document.getElementById('addUserForm').reset();
      if (addUserModalInstance) addUserModalInstance.show();
    });

    document.getElementById('saveNewUserBtn')?.addEventListener('click', async () => {
      const email = document.getElementById('newUserEmail').value.trim();
      const password = document.getElementById('newUserPassword').value;
      const role = document.getElementById('newUserRole').value;
      if (!email || !password || !role) {
        showToast('جميع الحقول مطلوبة', 'warning');
        return;
      }
      const success = await addNewUser(email, password, role);
      if (success && addUserModalInstance) {
        addUserModalInstance.hide();
      }
    });

    document.getElementById('settingsForm')?.addEventListener('submit', saveSettings);

    console.log('✅ Settings page ready (Admin)');
  });

  // تسجيل الخروج
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await logoutUser();
    window.location.href = '../login.html';
  });

  // الوضع المظلم
  const themeToggle = document.getElementById('themeToggle');
  const htmlElement = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    htmlElement.setAttribute('data-theme', 'dark');
    if (themeToggle) themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
  }
  if (themeToggle) {
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
  }

  // Sidebar
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      const overlay = document.getElementById('sidebar-overlay');
      if (overlay) overlay.classList.toggle('active');
    });
  }
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
