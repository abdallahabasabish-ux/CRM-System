// =============================================================
// settings.js - الإصدار الاحترافي النهائي
// يدير: المستخدمين والصلاحيات والإعدادات العامة
// المؤلف: نظام إدارة الأعمال
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
  orderBy,
  where,
  runTransaction,
  Timestamp
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  deleteUser
} from 'firebase/auth';

// =============================================================
// 1.  المتغيرات العامة وإدارة الحالة
// =============================================================
const state = {
  users: [],
  currentUser: null,
  currentUserRole: null,
  isAdmin: false,
  settings: {},
  loading: false,
  usersListener: null,
};

let addUserModalInstance = null;

// =============================================================
// 2.  دوال مساعدة (Utilities)
// =============================================================
function formatDate(date) {
  if (!date) return '-';
  if (date instanceof Timestamp) date = date.toDate();
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  if (typeof date === 'string') return date.slice(0, 10);
  return '-';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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

function showLoading(show) {
  const content = document.getElementById('settingsContent');
  const loader = document.getElementById('settingsLoader');
  if (content && loader) {
    content.style.display = show ? 'none' : 'block';
    loader.style.display = show ? 'flex' : 'none';
  }
}

// =============================================================
// 3.  التحقق من الصلاحيات (مدير فقط)
// =============================================================
async function checkAdminPrivileges(user) {
  try {
    // محاولة جلب دور المستخدم من Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    let role = 'موظف';
    if (userDoc.exists()) {
      role = userDoc.data().role || 'موظف';
    }

    // التحقق من البريد الإلكتروني المخصص للمدير (صلاحية مطلقة)
    const adminEmails = ['abdallahabasabish@gmail.com', 'admin@company.com'];
    const isAdminEmail = adminEmails.includes(user.email);

    // التحقق من الدور أو البريد الإلكتروني
    const isAdmin = role === 'مدير' || role === 'admin' || isAdminEmail;

    // تحديث الحالة
    state.currentUser = user;
    state.currentUserRole = role;
    state.isAdmin = isAdmin;

    // إذا كان المستخدم مديراً، نقوم بتحديث وثيقته للتأكد من وجودها
    if (isAdmin && !userDoc.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        role: 'مدير',
        disabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    return isAdmin;
  } catch (error) {
    console.error('Error checking admin privileges:', error);
    return false;
  }
}

// =============================================================
// 4.  التهيئة العامة للصفحة
// =============================================================
async function initPage() {
  try {
    showLoading(true);

    // إعداد الوضع المظلم
    initDarkMode();

    // إعداد القائمة الجانبية
    initSidebar();

    // إعداد تسجيل الخروج
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await logoutUser();
        window.location.href = '../login.html';
      });
    }

    // إعداد مودال إضافة مستخدم
    const modalEl = document.getElementById('addUserModal');
    if (modalEl) {
      addUserModalInstance = new bootstrap.Modal(modalEl);
    }

    // إعداد نموذج الإعدادات
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', handleSaveSettings);
    }

    // إعداد أزرار إضافة مستخدم
    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
      addUserBtn.addEventListener('click', openAddUserModal);
    }

    // إعداد زر حفظ المستخدم الجديد
    const saveNewUserBtn = document.getElementById('saveNewUserBtn');
    if (saveNewUserBtn) {
      saveNewUserBtn.addEventListener('click', handleAddUser);
    }

    showLoading(false);
  } catch (error) {
    console.error('Error initializing settings page:', error);
    showLoading(false);
    showToast('حدث خطأ في تهيئة الصفحة', 'error');
  }
}

// =============================================================
// 5.  المصادقة والتحقق من الصلاحية
// =============================================================
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
    sidebarAvatar.textContent = user.displayName
      ? user.displayName.charAt(0).toUpperCase()
      : user.email.charAt(0).toUpperCase();
  }

  // التحقق من صلاحيات المدير
  const isAdmin = await checkAdminPrivileges(user);

  if (isAdmin) {
    // إظهار محتوى الإعدادات
    document.getElementById('settingsContent').style.display = 'block';
    document.getElementById('unauthorizedMessage').style.display = 'none';

    // تهيئة الصفحة
    await initPage();

    // تحميل البيانات
    await loadUsers();
    await loadSettings();
  } else {
    // غير مصرح
    document.getElementById('settingsContent').style.display = 'none';
    document.getElementById('unauthorizedMessage').style.display = 'block';
    showLoading(false);
  }
});

// =============================================================
// 6.  الوضع المظلم (Dark Mode)
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
    themeToggle.addEventListener('click', function () {
      const currentTheme = htmlElement.getAttribute('data-theme');
      if (currentTheme === 'dark') {
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
// 7.  القائمة الجانبية (للجوال)
// =============================================================
function initSidebar() {
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
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
// 8.  تحميل قائمة المستخدمين (Realtime)
// =============================================================
async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (state.usersListener) {
    state.usersListener();
    state.usersListener = null;
  }

  try {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));

    state.usersListener = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          state.users = [];
          renderUsersTable([]);
          return;
        }

        state.users = snapshot.docs.map((doc) => ({
          uid: doc.id,
          ...doc.data(),
        }));

        renderUsersTable(state.users);
      },
      (error) => {
        console.error('Error listening to users:', error);
        showToast('حدث خطأ في تحميل المستخدمين', 'error');
      }
    );
  } catch (error) {
    console.error('Error loading users:', error);
    showToast('حدث خطأ في تحميل المستخدمين', 'error');
  }
}

// =============================================================
// 9.  عرض جدول المستخدمين
// =============================================================
function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-4">
          <i class="fas fa-users fa-2x mb-2 d-block"></i>
          لا يوجد مستخدمين
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  users.forEach((u) => {
    const isCurrentUser = u.uid === auth.currentUser?.uid;
    const statusBadge = u.disabled ? 'badge bg-danger' : 'badge bg-success';
    const statusText = u.disabled ? 'معطل' : 'نشط';
    const roleBadge = u.role === 'مدير' ? 'badge bg-warning text-dark' : 'badge bg-primary';

    html += `
      <tr>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="user-avatar-mini" style="width:32px;height:32px;border-radius:50%;background:var(--color-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">
              ${u.email ? u.email.charAt(0).toUpperCase() : 'م'}
            </div>
            <span>${escapeHtml(u.email || '')}</span>
          </div>
        </td>
        <td><span class="${roleBadge}">${escapeHtml(u.role || 'موظف')}</span></td>
        <td><span class="${statusBadge}">${statusText}</span></td>
        <td>${formatDate(u.createdAt)}</td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-primary edit-user-btn" data-uid="${u.uid}" title="تعديل الدور">
              <i class="fas fa-user-edit"></i>
            </button>
            ${!isCurrentUser ? `
              <button class="btn btn-sm btn-outline-${u.disabled ? 'success' : 'warning'} toggle-user-btn" 
                      data-uid="${u.uid}" data-disabled="${u.disabled ? 'true' : 'false'}" 
                      title="${u.disabled ? 'تفعيل' : 'تعطيل'}">
                <i class="fas fa-${u.disabled ? 'check-circle' : 'ban'}"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger delete-user-btn" data-uid="${u.uid}" title="حذف">
                <i class="fas fa-trash"></i>
              </button>
            ` : `
              <span class="text-muted small">(أنت)</span>
            `}
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // ربط الأحداث
  tbody.querySelectorAll('.edit-user-btn').forEach((btn) => {
    btn.addEventListener('click', () => openEditRoleModal(btn.dataset.uid));
  });

  tbody.querySelectorAll('.toggle-user-btn').forEach((btn) => {
    btn.addEventListener('click', () =>
      toggleUserStatus(btn.dataset.uid, btn.dataset.disabled === 'true')
    );
  });

  tbody.querySelectorAll('.delete-user-btn').forEach((btn) => {
    btn.addEventListener('click', () => confirmDeleteUser(btn.dataset.uid));
  });
}

// =============================================================
// 10.  تعديل دور المستخدم
// =============================================================
function openEditRoleModal(uid) {
  const user = state.users.find((u) => u.uid === uid);
  if (!user) {
    showToast('المستخدم غير موجود', 'error');
    return;
  }

  Swal.fire({
    title: 'تعديل دور المستخدم',
    html: `
      <div class="text-start">
        <p><strong>البريد الإلكتروني:</strong> ${escapeHtml(user.email)}</p>
        <p><strong>الدور الحالي:</strong> ${escapeHtml(user.role || 'موظف')}</p>
        <hr>
        <div class="form-group">
          <label for="newRoleSelect" class="form-label">الدور الجديد</label>
          <select id="newRoleSelect" class="form-select">
            <option value="مدير" ${user.role === 'مدير' ? 'selected' : ''}>مدير</option>
            <option value="محاسب" ${user.role === 'محاسب' ? 'selected' : ''}>محاسب</option>
            <option value="موظف" ${user.role === 'موظف' ? 'selected' : ''}>موظف</option>
            <option value="مشرف" ${user.role === 'مشرف' ? 'selected' : ''}>مشرف</option>
          </select>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'حفظ',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: '#ff6600',
    preConfirm: () => {
      return document.getElementById('newRoleSelect').value;
    },
  }).then(async (result) => {
    if (result.isConfirmed && result.value) {
      try {
        await updateDoc(doc(db, 'users', uid), {
          role: result.value,
          updatedAt: new Date().toISOString(),
        });
        showToast('تم تحديث دور المستخدم بنجاح', 'success');
      } catch (error) {
        console.error('Error updating user role:', error);
        showToast('حدث خطأ أثناء التحديث', 'error');
      }
    }
  });
}

// =============================================================
// 11.  تبديل حالة المستخدم (تفعيل/تعطيل)
// =============================================================
async function toggleUserStatus(uid, currentlyDisabled) {
  const user = state.users.find((u) => u.uid === uid);
  if (!user) return;

  const newStatus = !currentlyDisabled;
  const action = newStatus ? 'تعطيل' : 'تفعيل';
  const icon = newStatus ? '🔒' : '🔓';

  const result = await Swal.fire({
    title: `${action} المستخدم؟`,
    html: `
      <p>${icon} هل أنت متأكد من <strong>${action}</strong> المستخدم التالي؟</p>
      <p><strong>${escapeHtml(user.email)}</strong></p>
      ${newStatus ? '<p class="text-danger">سيتم منع المستخدم من تسجيل الدخول</p>' : '<p class="text-success">سيتم السماح للمستخدم بتسجيل الدخول</p>'}
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'نعم',
    cancelButtonText: 'إلغاء',
    confirmButtonColor: newStatus ? '#dc3545' : '#28a745',
  });

  if (result.isConfirmed) {
    try {
      await updateDoc(doc(db, 'users', uid), {
        disabled: newStatus,
        updatedAt: new Date().toISOString(),
      });
      showToast(`تم ${action} المستخدم بنجاح`, 'success');
    } catch (error) {
      console.error('Error toggling user status:', error);
      showToast('حدث خطأ أثناء تغيير الحالة', 'error');
    }
  }
}

// =============================================================
// 12.  حذف مستخدم
// =============================================================
async function confirmDeleteUser(uid) {
  const user = state.users.find((u) => u.uid === uid);
  if (!user) return;

  const result = await Swal.fire({
    title: '⚠️ حذف المستخدم',
    html: `
      <p>سيتم حذف المستخدم التالي نهائياً:</p>
      <p><strong>${escapeHtml(user.email)}</strong></p>
      <p class="text-danger"><small>⚠️ لا يمكن التراجع عن هذا الإجراء</small></p>
      <p class="text-warning"><small>ملاحظة: يجب حذف حساب Firebase يدوياً من وحدة التحكم</small></p>
    `,
    icon: 'error',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء',
  });

  if (result.isConfirmed) {
    try {
      // حذف من Firestore
      await deleteDoc(doc(db, 'users', uid));
      showToast('تم حذف المستخدم من قاعدة البيانات', 'success');
    } catch (error) {
      console.error('Error deleting user:', error);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }
}

// =============================================================
// 13.  فتح مودال إضافة مستخدم
// =============================================================
function openAddUserModal() {
  document.getElementById('addUserForm').reset();
  if (addUserModalInstance) {
    addUserModalInstance.show();
  }
}

// =============================================================
// 14.  إضافة مستخدم جديد
// =============================================================
async function handleAddUser() {
  const email = document.getElementById('newUserEmail').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const role = document.getElementById('newUserRole').value;

  if (!email || !password || !role) {
    showToast('جميع الحقول مطلوبة', 'warning');
    return;
  }

  if (password.length < 6) {
    showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'warning');
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
      updatedAt: new Date().toISOString(),
    });

    showToast('تم إضافة المستخدم بنجاح', 'success');
    if (addUserModalInstance) addUserModalInstance.hide();
  } catch (error) {
    console.error('Error adding user:', error);
    let msg = 'حدث خطأ أثناء الإضافة';
    if (error.code === 'auth/email-already-in-use') {
      msg = 'البريد الإلكتروني مستخدم بالفعل';
    } else if (error.code === 'auth/weak-password') {
      msg = 'كلمة المرور ضعيفة (6 أحرف على الأقل)';
    } else if (error.code === 'auth/invalid-email') {
      msg = 'البريد الإلكتروني غير صحيح';
    }
    showToast(msg, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-user-plus me-2"></i>إضافة';
  }
}

// =============================================================
// 15.  تحميل الإعدادات العامة
// =============================================================
async function loadSettings() {
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'general'));

    if (settingsDoc.exists()) {
      state.settings = settingsDoc.data();
      const data = state.settings;

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

// =============================================================
// 16.  حفظ الإعدادات العامة
// =============================================================
async function handleSaveSettings(e) {
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
    updatedAt: new Date().toISOString(),
  };

  const saveBtn = document.getElementById('saveSettingsBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';

  try {
    await setDoc(doc(db, 'settings', 'general'), data, { merge: true });
    state.settings = { ...state.settings, ...data };
    showToast('تم حفظ الإعدادات بنجاح', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showToast('حدث خطأ أثناء حفظ الإعدادات', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ الإعدادات';
  }
}

// =============================================================
// 17.  إعادة تعيين المودال عند الإغلاق
// =============================================================
const modalElement = document.getElementById('addUserModal');
if (modalElement) {
  modalElement.addEventListener('hidden.bs.modal', () => {
    document.getElementById('addUserForm').reset();
  });
}

// =============================================================
// 18.  تهيئة إضافية - زر إعادة تحميل البيانات
// =============================================================
document.addEventListener('DOMContentLoaded', () => {
  // إضافة زر تحديث البيانات (يمكن إضافته في HTML)
  const refreshBtn = document.getElementById('refreshDataBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      showToast('جاري تحديث البيانات...', 'info');
      await loadUsers();
      await loadSettings();
      showToast('تم تحديث البيانات', 'success');
    });
  }
});

console.log('✅ Settings.js loaded successfully (Professional version)');
