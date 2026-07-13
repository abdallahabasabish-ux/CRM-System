import { onAuthStateChangedCallback, logoutUser } from '../auth.js';
import { db } from '../firebase-config.js';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from 'firebase/firestore';

// ============================
// متغيرات عامة
// ============================
let customers = [];
let editingId = null;
let customersListener = null;

// Bootstrap Modal (سيتم تهيئته لاحقًا)
let customerModalInstance = null;

// ============================
// 1. المصادقة
// ============================
onAuthStateChangedCallback((user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }
  // تحديث بيانات المستخدم في الـ Sidebar
  document.getElementById('sidebarUserName').textContent = user.displayName || user.email;
  document.getElementById('sidebarUserEmail').textContent = user.email;
  document.getElementById('sidebarAvatar').textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
  
  // بدء الاستماع للعملاء بعد تسجيل الدخول
  listenToCustomers();
});

// ============================
// 2. تسجيل الخروج وتبديل الوضع
// ============================
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await logoutUser();
  window.location.href = '../login.html';
});

// تبديل الوضع المظلم (نفس الكود من dashboard)
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

// تبديل Sidebar للشاشات الصغيرة
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ============================
// 3. تهيئة Modal
// ============================
const modalElement = document.getElementById('customerModal');
if (modalElement) {
  customerModalInstance = new bootstrap.Modal(modalElement);
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
// 5. قراءة العملاء من Firestore (Realtime)
// ============================
function listenToCustomers() {
  const customersRef = collection(db, 'customers');
  const q = query(customersRef, orderBy('createdAt', 'desc'));

  if (customersListener) {
    customersListener();
  }

  customersListener = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      customers = [];
      renderTable([]);
      document.getElementById('resultCount').textContent = 'عرض 0 عميل';
      return;
    }

    customers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // تطبيق البحث الحالي (إن وجد)
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const filtered = searchTerm ? filterCustomers(searchTerm) : customers;
    renderTable(filtered);
    document.getElementById('resultCount').textContent = `عرض ${filtered.length} عميل`;
  }, (error) => {
    console.error('Error listening to customers:', error);
    showToast('حدث خطأ في تحميل العملاء', 'error');
  });
}

// ============================
// 6. عرض الجدول
// ============================
function renderTable(data) {
  const tbody = document.getElementById('customersTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">لا يوجد عملاء</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((customer, index) => {
    const totalPaid = customer.totalPaid || 0;
    const balance = customer.balance || 0;
    html += `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(customer.name || '')}</strong></td>
        <td>${escapeHtml(customer.phone || '')}</td>
        <td>${escapeHtml(customer.email || '')}</td>
        <td>${escapeHtml(customer.company || '')}</td>
        <td>$${totalPaid.toFixed(2)}</td>
        <td>$${balance.toFixed(2)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${customer.id}" title="تعديل">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${customer.id}" title="حذف">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // ربط أحداث الأزرار
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
  });
}

// دالة لحماية من هجمات XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================
// 7. البحث والفلترة
// ============================
function filterCustomers(term) {
  return customers.filter(c =>
    (c.name && c.name.toLowerCase().includes(term)) ||
    (c.phone && c.phone.includes(term))
  );
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? filterCustomers(term) : customers;
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} عميل`;
});

// ============================
// 8. فتح مودال الإضافة
// ============================
document.getElementById('addCustomerBtn').addEventListener('click', () => {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'إضافة عميل جديد';
  document.getElementById('customerForm').reset();
  document.getElementById('customerId').value = '';
  customerModalInstance.show();
});

// ============================
// 9. فتح مودال التعديل
// ============================
function openEditModal(id) {
  const customer = customers.find(c => c.id === id);
  if (!customer) {
    showToast('العميل غير موجود', 'error');
    return;
  }

  editingId = id;
  document.getElementById('modalTitle').textContent = 'تعديل بيانات العميل';
  document.getElementById('customerId').value = id;
  document.getElementById('name').value = customer.name || '';
  document.getElementById('phone').value = customer.phone || '';
  document.getElementById('email').value = customer.email || '';
  document.getElementById('company').value = customer.company || '';
  document.getElementById('country').value = customer.country || '';
  document.getElementById('city').value = customer.city || '';
  document.getElementById('address').value = customer.address || '';
  document.getElementById('notes').value = customer.notes || '';
  
  customerModalInstance.show();
}

// ============================
// 10. حفظ البيانات (إضافة / تعديل)
// ============================
document.getElementById('saveCustomerBtn').addEventListener('click', async () => {
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  
  if (!name || !phone) {
    showToast('الاسم والهاتف مطلوبان', 'warning');
    return;
  }

  const data = {
    name,
    phone,
    email: document.getElementById('email').value.trim(),
    company: document.getElementById('company').value.trim(),
    country: document.getElementById('country').value.trim(),
    city: document.getElementById('city').value.trim(),
    address: document.getElementById('address').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    updatedAt: new Date().toISOString()
  };

  const id = document.getElementById('customerId').value;
  const saveBtn = document.getElementById('saveCustomerBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';

  try {
    if (id) {
      // تعديل
      await updateDoc(doc(db, 'customers', id), data);
      showToast('تم تحديث العميل بنجاح', 'success');
    } else {
      // إضافة
      data.createdAt = new Date().toISOString();
      data.totalPaid = 0;
      data.balance = 0;
      await addDoc(collection(db, 'customers'), data);
      showToast('تم إضافة العميل بنجاح', 'success');
    }
    customerModalInstance.hide();
  } catch (error) {
    console.error('Error saving customer:', error);
    showToast('حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ';
  }
});

// ============================
// 11. حذف عميل مع تأكيد
// ============================
async function confirmDelete(id) {
  const customer = customers.find(c => c.id === id);
  if (!customer) return;

  const result = await Swal.fire({
    title: 'هل أنت متأكد؟',
    text: `سيتم حذف العميل "${customer.name}" نهائيًا.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  });

  if (result.isConfirmed) {
    try {
      await deleteDoc(doc(db, 'customers', id));
      showToast('تم حذف العميل بنجاح', 'success');
    } catch (error) {
      console.error('Error deleting customer:', error);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }
}

// ============================
// 12. إغلاق المودال عند الضغط على Esc أو خارجه
// ============================
modalElement?.addEventListener('hidden.bs.modal', () => {
  // إعادة تعيين النموذج عند الإغلاق
  document.getElementById('customerForm').reset();
  document.getElementById('customerId').value = '';
});

console.log('✅ صفحة العملاء جاهزة');
