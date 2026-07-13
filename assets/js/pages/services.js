import { onAuthStateChangedCallback, logoutUser } from '../auth.js';
import { db } from '../firebase-config.js';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';

let services = [];
let editingId = null;
let servicesListener = null;

// ============================
// 1. المصادقة
// ============================
onAuthStateChangedCallback((user) => {
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
  
  listenToServices();
});

// ============================
// 2. تسجيل الخروج وتبديل الوضع
// ============================
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await logoutUser();
  window.location.href = '../login.html';
});

// تبديل الوضع المظلم
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

// تبديل Sidebar
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

// ============================
// 3. تهيئة Modal
// ============================
const modalElement = document.getElementById('serviceModal');
let serviceModalInstance = null;
if (modalElement) {
  serviceModalInstance = new bootstrap.Modal(modalElement);
}

// ============================
// 4. دوال مساعدة (Toast)
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
// 5. قراءة الخدمات من Firestore
// ============================
function listenToServices() {
  const servicesRef = collection(db, 'services');
  const q = query(servicesRef, orderBy('createdAt', 'desc'));

  if (servicesListener) {
    servicesListener();
  }

  servicesListener = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      services = [];
      renderTable([]);
      document.getElementById('resultCount').textContent = 'عرض 0 خدمة';
      return;
    }

    services = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const searchTerm = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const filtered = searchTerm ? filterServices(searchTerm) : services;
    renderTable(filtered);
    document.getElementById('resultCount').textContent = `عرض ${filtered.length} خدمة`;
  }, (error) => {
    console.error('Error listening to services:', error);
    showToast('حدث خطأ في تحميل الخدمات', 'error');
  });
}

// ============================
// 6. عرض الجدول
// ============================
function renderTable(data) {
  const tbody = document.getElementById('servicesTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">لا يوجد خدمات</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((service, index) => {
    const statusClass = service.status === 'نشط' ? 'badge bg-success' : 'badge bg-secondary';
    html += `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(service.name || '')}</strong></td>
        <td>$${service.price ? parseFloat(service.price).toFixed(2) : '0.00'}</td>
        <td>${escapeHtml(service.category || '')}</td>
        <td>${service.duration || '-'} يوم</td>
        <td><span class="${statusClass}">${escapeHtml(service.status || 'نشط')}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${service.id}" title="تعديل">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${service.id}" title="حذف">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================
// 7. البحث
// ============================
function filterServices(term) {
  return services.filter(s =>
    (s.name && s.name.toLowerCase().includes(term)) ||
    (s.category && s.category.toLowerCase().includes(term))
  );
}

document.getElementById('searchInput')?.addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? filterServices(term) : services;
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} خدمة`;
});

// ============================
// 8. مودال الإضافة
// ============================
document.getElementById('addServiceBtn')?.addEventListener('click', () => {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'إضافة خدمة جديدة';
  document.getElementById('serviceForm').reset();
  document.getElementById('serviceId').value = '';
  document.getElementById('status').value = 'نشط';
  if (serviceModalInstance) serviceModalInstance.show();
});

// ============================
// 9. مودال التعديل
// ============================
function openEditModal(id) {
  const service = services.find(s => s.id === id);
  if (!service) {
    showToast('الخدمة غير موجودة', 'error');
    return;
  }

  editingId = id;
  document.getElementById('modalTitle').textContent = 'تعديل بيانات الخدمة';
  document.getElementById('serviceId').value = id;
  document.getElementById('name').value = service.name || '';
  document.getElementById('description').value = service.description || '';
  document.getElementById('price').value = service.price || '';
  document.getElementById('category').value = service.category || '';
  document.getElementById('duration').value = service.duration || '';
  document.getElementById('status').value = service.status || 'نشط';
  document.getElementById('icon').value = service.icon || '';
  document.getElementById('notes').value = service.notes || '';
  
  if (serviceModalInstance) serviceModalInstance.show();
}

// ============================
// 10. حفظ البيانات
// ============================
document.getElementById('saveServiceBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('name').value.trim();
  const price = parseFloat(document.getElementById('price').value);
  const category = document.getElementById('category').value;

  if (!name || !price || !category) {
    showToast('الاسم، السعر، والقسم مطلوبون', 'warning');
    return;
  }

  const data = {
    name,
    description: document.getElementById('description').value.trim(),
    price,
    category,
    duration: parseInt(document.getElementById('duration').value) || null,
    status: document.getElementById('status').value,
    icon: document.getElementById('icon').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    updatedAt: new Date().toISOString()
  };

  const id = document.getElementById('serviceId').value;
  const saveBtn = document.getElementById('saveServiceBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';

  try {
    if (id) {
      await updateDoc(doc(db, 'services', id), data);
      showToast('تم تحديث الخدمة بنجاح', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      await addDoc(collection(db, 'services'), data);
      showToast('تم إضافة الخدمة بنجاح', 'success');
    }
    if (serviceModalInstance) serviceModalInstance.hide();
  } catch (error) {
    console.error('Error saving service:', error);
    showToast('حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ';
  }
});

// ============================
// 11. حذف خدمة
// ============================
async function confirmDelete(id) {
  const service = services.find(s => s.id === id);
  if (!service) return;

  const result = await Swal.fire({
    title: 'هل أنت متأكد؟',
    text: `سيتم حذف الخدمة "${service.name}" نهائيًا.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  });

  if (result.isConfirmed) {
    try {
      await deleteDoc(doc(db, 'services', id));
      showToast('تم حذف الخدمة بنجاح', 'success');
    } catch (error) {
      console.error('Error deleting service:', error);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }
}

// ============================
// 12. إعادة تعيين النموذج
// ============================
modalElement?.addEventListener('hidden.bs.modal', () => {
  document.getElementById('serviceForm').reset();
  document.getElementById('serviceId').value = '';
});

console.log('✅ صفحة الخدمات جاهزة');
