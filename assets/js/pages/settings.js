// =============================================================
// settings.js - نسخة مبسطة وآمنة
// =============================================================

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
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword
} from 'firebase/auth';

// =============================================================
// 1.  المتغيرات العامة
// =============================================================
let users = [];
let usersListener = null;
let addUserModalInstance = null;

// =============================================================
// 2.  دوال مساعدة
// =============================================================
function showToast(message, type = 'success') {
  const colors = {
    success: 'linear-gradient(to right, #00b09b, #96c93d)',
    error: 'linear-gradient(to right, #ff5f6d, #ffc371)',
    warning: 'linear-gradient(to right, #f7971e, #ffd200)',
    info: 'linear-gradient(to right, #ff6600, #ff8533)'
  };
  if (typeof Toastify !== 'undefined') {
    Toastify({
      text: message,
      duration: 3000,
      gravity: 'bottom',
      position: 'left',
      style: { background: colors[type] || colors.info },
      className: 'rounded-3 shadow'
    }).showToast();
  } else {
    console.log(message);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(date) {
  if (!date) return '-';
  if (typeof date === 'string') return date.slice(0, 10);
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  return '-';
}

// =============================================================
// 3.  الوضع المظلم (مباشر وآمن)
// =============================================================
function initDarkMode() {
  const themeToggle = document.getElementById('themeToggle');
  const htmlElement = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'light';

  if (savedTheme === 'dark') {
    htmlElement.setAttribute('data-theme', 'dark');
    if (themeToggle) themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
  } else {
    htmlElement.removeAttribute('data-theme');
    if (themeToggle) themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      const current = htmlElement.getAttribute('data-theme');
      if (current === 'dark') {
        htmlElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        this.innerHTML = '<i class="fas fa-moon"></i>';
      } else {
        htmlElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        this.innerHTML = '<i class="fas fa-sun"></i>';
      }
    });
  }
}

// =============================================================
// 4.  القائمة الجانبية
// =============================================================
function initSidebar() {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      if (overlay) overlay.classList.toggle('active');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
    });
  }
}

// =============================================================
// 5.  التحقق من المدير
// =============================================================
async function isAdmin(user) {
  try {
    const docSnap = await getDoc(doc(db, 'users', user.uid));
    if (docSnap.exists()) {
      const role = docSnap.data().role || 'موظف';
      return role === 'مدير' || role === 'admin';
    }
    // إذا لم تكن الوثيقة موجودة، نتحقق من البريد المخصص
    return user.email === 'abdallahabasabish@gmail.com';
  } catch (error) {
    console.error('Error checking admin:', error);
    return false;
  }
}

// =============================================================
// 6.  تحميل المستخدمين (Realtime)
// =============================================================
function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (usersListener) usersListener();

  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  usersListener = onSnapshot(q, (snapshot) => {
    users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    renderUsersTable(users);
  }, (error) => {
    console.error('Error loading users:', error);
    showToast('خطأ في تحميل المستخدمين', 'error');
  });
}

// =============================================================
// 7.  عرض جدول المستخدمين
// =============================================================
function renderUsersTable(usersList) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (!usersList || usersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">لا يوجد مستخدمين</td></tr>`;
    return;
  }

  let html = '';
  usersList.forEach(u => {
    const isCurrent = u.uid === auth.currentUser?.uid;
    const statusBadge = u.disabled ? 'badge bg-danger' : 'badge bg-success';
    const statusText = u.disabled ? 'معطل' : 'نشط';
    const roleBadge = u.role === 'مدير' ? 'badge bg-warning text-dark' : 'badge bg-primary';

    html += `
      <tr>
        <td>${escapeHtml(u.email || '')}</td>
        <td><span class="${roleBadge}">${escapeHtml(u.role || 'موظف')}</span></td>
        <td><span class="${statusBadge}">${statusText}</span></td>
        <td>${formatDate(u.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-btn" data-uid="${u.uid}" title="تعديل الدور">
            <i class="fas fa-edit"></i>
          </button>
          ${!isCurrent ? `
            <button class="btn btn-sm btn-outline-${u.disabled ? 'success' : 'warning'} toggle-btn" data-uid="${u.uid}" data-disabled="${u.disabled}" title="${u.disabled ? 'تفعيل' : 'تعطيل'}">
              <i class="fas fa-${u.disabled ? 'check' : 'ban'}"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger delete-btn" data-uid="${u.uid}" title="حذف">
              <i class="fas fa-trash"></i>
            </button>
          ` : `<span class="text-muted">(أنت)</span>`}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // ربط الأحداث
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => editRole(btn.dataset.uid));
  });
  tbody.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleUser(btn.dataset.uid, btn.dataset.disabled === 'true'));
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteUser(btn.dataset.uid));
  });
}

// =============================================================
// 8.  تعديل الدور
// =============================================================
function editRole(uid) {
  const user = users.find(u => u.uid === uid);
  if (!user) return showToast('المستخدم غير موجود', 'error');

  Swal.fire({
    title: 'تعديل الدور',
    html: `
      <p>المستخدم: <strong>${escapeHtml(user.email)}</strong></p>
      <select id="newRole" class="form-select">
        <option value="مدير" ${user.role === 'مدير' ? 'selected' : ''}>مدير</option>
        <option value="محاسب" ${user.role === 'محاسب' ? 'selected' : ''}>محاسب</option>
        <option value="موظف" ${user.role === 'موظف' ? 'selected' : ''}>موظف</option>
        <option value="مشرف" ${user.role === 'مشرف' ? 'selected' : ''}>مشرف</option>
      </select>
    `,
    confirmButtonText: 'حفظ',
    cancelButtonText: 'إلغاء',
    showCancelButton: true,
    preConfirm: () => document.getElementById('newRole').value
  }).then(async res => {
    if (res.isConfirmed) {
      try {
        await updateDoc(doc(db, 'users', uid), { role: res.value, updatedAt: new Date().toISOString() });
        showToast('تم تحديث الدور', 'success');
      } catch (error) {
        showToast('خطأ في التحديث', 'error');
      }
    }
  });
}

// =============================================================
// 9.  تفعيل/تعطيل
// =============================================================
function toggleUser(uid, currentlyDisabled) {
  const newStatus = !currentlyDisabled;
  const action = newStatus ? 'تعطيل' : 'تفعيل';
  Swal.fire({
    title: `${action} المستخدم؟`,
    text: `هل تريد ${action} هذا المستخدم؟`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'نعم',
    cancelButtonText: 'إلغاء'
  }).then(async res => {
    if (res.isConfirmed) {
      try {
        await updateDoc(doc(db, 'users', uid), { disabled: newStatus, updatedAt: new Date().toISOString() });
        showToast(`تم ${action} المستخدم`, 'success');
      } catch (error) {
        showToast('خطأ في تغيير الحالة', 'error');
      }
    }
  });
}

// =============================================================
// 10. حذف مستخدم
// =============================================================
function deleteUser(uid) {
  const user = users.find(u => u.uid === uid);
  if (!user) return;

  Swal.fire({
    title: 'حذف المستخدم؟',
    text: `سيتم حذف ${user.email} نهائياً`,
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  }).then(async res => {
    if (res.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'users', uid));
        showToast('تم الحذف', 'success');
      } catch (error) {
        showToast('خطأ في الحذف', 'error');
      }
    }
  });
}

// =============================================================
// 11. إضافة مستخدم
// =============================================================
function openAddModal() {
  document.getElementById('addUserForm').reset();
  if (addUserModalInstance) addUserModalInstance.show();
}

async function addNewUser() {
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const role = document.getElementById('newUserRole').value;

  if (!email || !password || !role) {
    showToast('جميع الحقول مطلوبة', 'warning');
    return;
  }
  if (password.length < 6) {
    showToast('كلمة المرور 6 أحرف على الأقل', 'warning');
    return;
  }

  const btn = document.getElementById('saveNewUserBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري...';

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', cred.user.uid), {
      email: cred.user.email,
      role: role,
      disabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    showToast('تمت الإضافة', 'success');
    if (addUserModalInstance) addUserModalInstance.hide();
  } catch (error) {
    let msg = 'حدث خطأ';
    if (error.code === 'auth/email-already-in-use') msg = 'البريد مستخدم بالفعل';
    else if (error.code === 'auth/weak-password') msg = 'كلمة مرور ضعيفة';
    showToast(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus me-2"></i>إضافة';
  }
}

// =============================================================
// 12. الإعدادات العامة
// =============================================================
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
  }
}

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
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري...';

  try {
    await setDoc(doc(db, 'settings', 'general'), data, { merge: true });
    showToast('تم حفظ الإعدادات', 'success');
  } catch (error) {
    showToast('خطأ في الحفظ', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ الإعدادات';
  }
}

// =============================================================
// 13.  التهيئة الرئيسية
// =============================================================
onAuthStateChangedCallback(async (user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }

  // تحديث الـ Sidebar
  const userName = document.getElementById('sidebarUserName');
  const userEmail = document.getElementById('sidebarUserEmail');
  const avatar = document.getElementById('sidebarAvatar');
  if (userName) userName.textContent = user.displayName || user.email;
  if (userEmail) userEmail.textContent = user.email;
  if (avatar) avatar.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();

  // التحقق من الصلاحية
  const admin = await isAdmin(user);
  if (admin) {
    document.getElementById('settingsContent').style.display = 'block';
    document.getElementById('unauthorizedMessage').style.display = 'none';

    // تهيئة المودال
    const modalEl = document.getElementById('addUserModal');
    if (modalEl) addUserModalInstance = new bootstrap.Modal(modalEl);

    // ربط الأحداث
    document.getElementById('addUserBtn')?.addEventListener('click', openAddModal);
    document.getElementById('saveNewUserBtn')?.addEventListener('click', addNewUser);
    document.getElementById('settingsForm')?.addEventListener('submit', saveSettings);

    // تحميل البيانات
    loadUsers();
    await loadSettings();

    // الوضع المظلم والقائمة الجانبية
    initDarkMode();
    initSidebar();

    // تسجيل الخروج
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await logoutUser();
      window.location.href = '../login.html';
    });

  } else {
    document.getElementById('settingsContent').style.display = 'none';
    document.getElementById('unauthorizedMessage').style.display = 'block';
  }
});

console.log('✅ Settings.js loaded (simple & safe)');
