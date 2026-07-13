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

let employees = [];
let editingId = null;
let employeesListener = null;

// ============================
// 1. المصادقة
// ============================
onAuthStateChangedCallback((user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserEmail = document.getElementById('sidebarUserEmail');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  if (sidebarUserName) sidebarUserName.textContent = user.displayName || user.email;
  if (sidebarUserEmail) sidebarUserEmail.textContent = user.email;
  if (sidebarAvatar) {
    sidebarAvatar.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
  }
  
  listenToEmployees();
});

// ============================
// 2. تسجيل الخروج وتبديل الوضع
// ============================
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await logoutUser();
  window.location.href = '../login.html';
});

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
const modalElement = document.getElementById('employeeModal');
let employeeModalInstance = null;
if (modalElement) {
  employeeModalInstance = new bootstrap.Modal(modalElement);
}

// ============================
// 4. دوال مساعدة
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
// 5. قراءة الموظفين
// ============================
function listenToEmployees() {
  const employeesRef = collection(db, 'employees');
  const q = query(employeesRef, orderBy('createdAt', 'desc'));

  if (employeesListener) {
    employeesListener();
  }

  employeesListener = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      employees = [];
      renderTable([]);
      document.getElementById('resultCount').textContent = 'عرض 0 موظف';
      return;
    }

    employees = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const searchTerm = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const filtered = searchTerm ? filterEmployees(searchTerm) : employees;
    renderTable(filtered);
    document.getElementById('resultCount').textContent = `عرض ${filtered.length} موظف`;
  }, (error) => {
    console.error('Error listening to employees:', error);
    showToast('حدث خطأ في تحميل الموظفين', 'error');
  });
}

// ============================
// 6. عرض الجدول
// ============================
function renderTable(data) {
  const tbody = document.getElementById('employeesTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-4">لا يوجد موظفين</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((employee, index) => {
    const statusClass = {
      'نشط': 'badge bg-success',
      'غير نشط': 'badge bg-secondary',
      'في إجازة': 'badge bg-warning text-dark'
    }[employee.status] || 'badge bg-secondary';

    const completionRate = employee.completionRate || 0;
    const orderCount = employee.orderCount || 0;

    html += `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(employee.name || '')}</strong></td>
        <td>${escapeHtml(employee.position || '')}</td>
        <td>${escapeHtml(employee.phone || '')}</td>
        <td>${escapeHtml(employee.email || '')}</td>
        <td>$${employee.salary ? parseFloat(employee.salary).toFixed(2) : '0.00'}</td>
        <td>${employee.commission ? parseFloat(employee.commission).toFixed(2) + '%' : '0%'}</td>
        <td><span class="${statusClass}">${escapeHtml(employee.status || 'نشط')}</span></td>
        <td>${orderCount}</td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="progress flex-grow-1" style="height: 6px; min-width: 50px;">
              <div class="progress-bar bg-primary" style="width: ${completionRate}%"></div>
            </div>
            <span class="small">${completionRate}%</span>
          </div>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${employee.id}" title="تعديل">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${employee.id}" title="حذف">
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
function filterEmployees(term) {
  return employees.filter(e =>
    (e.name && e.name.toLowerCase().includes(term)) ||
    (e.position && e.position.toLowerCase().includes(term))
  );
}

document.getElementById('searchInput')?.addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? filterEmployees(term) : employees;
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} موظف`;
});

// ============================
// 8. مودال الإضافة
// ============================
document.getElementById('addEmployeeBtn')?.addEventListener('click', () => {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'إضافة موظف جديد';
  document.getElementById('employeeForm').reset();
  document.getElementById('employeeId').value = '';
  document.getElementById('status').value = 'نشط';
  document.getElementById('commission').value = 0;
  if (employeeModalInstance) employeeModalInstance.show();
});

// ============================
// 9. مودال التعديل
// ============================
function openEditModal(id) {
  const employee = employees.find(e => e.id === id);
  if (!employee) {
    showToast('الموظف غير موجود', 'error');
    return;
  }

  editingId = id;
  document.getElementById('modalTitle').textContent = 'تعديل بيانات الموظف';
  document.getElementById('employeeId').value = id;
  document.getElementById('name').value = employee.name || '';
  document.getElementById('position').value = employee.position || '';
  document.getElementById('phone').value = employee.phone || '';
  document.getElementById('email').value = employee.email || '';
  document.getElementById('salary').value = employee.salary || '';
  document.getElementById('commission').value = employee.commission || 0;
  document.getElementById('status').value = employee.status || 'نشط';
  document.getElementById('hireDate').value = employee.hireDate || '';
  document.getElementById('notes').value = employee.notes || '';
  
  if (employeeModalInstance) employeeModalInstance.show();
}

// ============================
// 10. حفظ البيانات
// ============================
document.getElementById('saveEmployeeBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('name').value.trim();
  const position = document.getElementById('position').value;
  const phone = document.getElementById('phone').value.trim();
  const salary = parseFloat(document.getElementById('salary').value);

  if (!name || !position || !phone || !salary) {
    showToast('الاسم، الوظيفة، الهاتف، والراتب مطلوبون', 'warning');
    return;
  }

  const data = {
    name,
    position,
    phone,
    email: document.getElementById('email').value.trim(),
    salary,
    commission: parseFloat(document.getElementById('commission').value) || 0,
    status: document.getElementById('status').value,
    hireDate: document.getElementById('hireDate').value || null,
    notes: document.getElementById('notes').value.trim(),
    updatedAt: new Date().toISOString()
  };

  const id = document.getElementById('employeeId').value;
  const saveBtn = document.getElementById('saveEmployeeBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';

  try {
    if (id) {
      await updateDoc(doc(db, 'employees', id), data);
      showToast('تم تحديث بيانات الموظف بنجاح', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      data.orderCount = 0;
      data.completionRate = 0;
      await addDoc(collection(db, 'employees'), data);
      showToast('تم إضافة الموظف بنجاح', 'success');
    }
    if (employeeModalInstance) employeeModalInstance.hide();
  } catch (error) {
    console.error('Error saving employee:', error);
    showToast('حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ';
  }
});

// ============================
// 11. حذف موظف
// ============================
async function confirmDelete(id) {
  const employee = employees.find(e => e.id === id);
  if (!employee) return;

  const result = await Swal.fire({
    title: 'هل أنت متأكد؟',
    text: `سيتم حذف الموظف "${employee.name}" نهائيًا.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  });

  if (result.isConfirmed) {
    try {
      await deleteDoc(doc(db, 'employees', id));
      showToast('تم حذف الموظف بنجاح', 'success');
    } catch (error) {
      console.error('Error deleting employee:', error);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }
}

modalElement?.addEventListener('hidden.bs.modal', () => {
  document.getElementById('employeeForm').reset();
  document.getElementById('employeeId').value = '';
});

console.log('✅ صفحة الموظفين جاهزة');
