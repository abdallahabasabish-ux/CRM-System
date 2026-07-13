// =============================================================
// customers.js - إدارة العملاء مع حساب ديناميكي للرصيد
// يعرض totalPaid و balance محسوبين من الطلبات والمدفوعات
// =============================================================
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
  orderBy,
  Timestamp
} from 'firebase/firestore';

// =============================================================
// 1.  المتغيرات العامة
// =============================================================
let customers = [];
let allOrders = [];      // 🔥 مصفوفة جميع الطلبات
let allPayments = [];    // 🔥 مصفوفة جميع المدفوعات
let editingId = null;
let customersListener = null;
let ordersListener = null;
let paymentsListener = null;
let customerModalInstance = null;

// =============================================================
// 2.  دوال مساعدة (Utilities)
// =============================================================
function formatCurrency(amount, currency = '$') {
  if (amount === undefined || amount === null) return `${currency}0.00`;
  return `${currency}${amount.toFixed(2)}`;
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

// =============================================================
// 3.  المصادقة والتهيئة
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

  // تهيئة الوضع المظلم والقائمة الجانبية
  initDarkMode();
  initSidebar();

  // تسجيل الخروج
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await logoutUser();
    window.location.href = '../login.html';
  });

  // تهيئة Modal
  const modalElement = document.getElementById('customerModal');
  if (modalElement) {
    customerModalInstance = new bootstrap.Modal(modalElement);
  }

  // 🔥 تحميل البيانات الأساسية (الاستماع للعملاء، الطلبات، المدفوعات)
  listenToOrdersAndPayments();
  listenToCustomers();

  // ربط الأحداث
  document.getElementById('addCustomerBtn')?.addEventListener('click', openAddModal);
  document.getElementById('saveCustomerBtn')?.addEventListener('click', saveCustomer);
  document.getElementById('searchInput')?.addEventListener('input', handleSearch);
});

// =============================================================
// 4.  الوضع المظلم والقائمة الجانبية
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
// 5.  الاستماع للطلبات والمدفوعات (لتحديث الرصيد ديناميكياً)
// =============================================================
function listenToOrdersAndPayments() {
  // 5.1 الاستماع للطلبات
  if (ordersListener) ordersListener();
  ordersListener = onSnapshot(
    query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // تحديث الجدول إذا كانت العملاء موجودة
      if (customers.length > 0) applyFiltersAndRender();
    },
    (error) => console.error('Error listening to orders:', error)
  );

  // 5.2 الاستماع للمدفوعات
  if (paymentsListener) paymentsListener();
  paymentsListener = onSnapshot(
    query(collection(db, 'payments'), orderBy('paymentDate', 'desc')),
    (snapshot) => {
      allPayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (customers.length > 0) applyFiltersAndRender();
    },
    (error) => console.error('Error listening to payments:', error)
  );
}

// =============================================================
// 6.  الاستماع للعملاء
// =============================================================
function listenToCustomers() {
  if (customersListener) customersListener();

  customersListener = onSnapshot(
    query(collection(db, 'customers'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      customers = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      applyFiltersAndRender();
    },
    (error) => {
      console.error('Error listening to customers:', error);
      showToast('حدث خطأ في تحميل العملاء', 'error');
    }
  );
}

// =============================================================
// 7.  تطبيق الفلاتر وعرض الجدول (مع حساب ديناميكي)
// =============================================================
function applyFiltersAndRender() {
  const searchTerm = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
  let filtered = customers;

  if (searchTerm) {
    filtered = customers.filter((c) =>
      (c.name && c.name.toLowerCase().includes(searchTerm)) ||
      (c.phone && c.phone.includes(searchTerm))
    );
  }

  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} عميل`;
  document.getElementById('totalCustomersBadge').textContent = customers.length;
}

// =============================================================
// 8.  عرض الجدول (مع حساب ديناميكي من الطلبات والمدفوعات)
// =============================================================
function renderTable(data) {
  const tbody = document.getElementById('customersTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">لا يوجد عملاء</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((customer, index) => {
    // 🔥🔥🔥 حساب ديناميكي للرصيد والمبلغ المدفوع من البيانات الفعلية
    // 1. إجمالي قيمة الطلبات
    const customerOrders = allOrders.filter(o => o.customerId === customer.id);
    const totalOrdersValue = customerOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // 2. إجمالي المدفوعات
    const customerPayments = allPayments.filter(p => p.customerId === customer.id);
    const totalPaid = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // 3. المتبقي
    const balance = totalOrdersValue - totalPaid;

    // تحديد لون المتبقي
    let balanceClass = 'balance-zero';
    let balanceText = formatCurrency(balance);
    if (balance > 0) {
      balanceClass = 'balance-positive';
      balanceText = '+' + formatCurrency(balance);
    } else if (balance < 0) {
      balanceClass = 'balance-negative';
      balanceText = '-' + formatCurrency(Math.abs(balance));
    }

    html += `
      <tr class="customer-row">
        <td>${index + 1}</td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="customer-avatar">${customer.name ? customer.name.charAt(0).toUpperCase() : 'م'}</div>
            <strong>${escapeHtml(customer.name || '')}</strong>
          </div>
        </td>
        <td>${escapeHtml(customer.phone || '')}</td>
        <td>${escapeHtml(customer.email || '')}</td>
        <td>${escapeHtml(customer.company || '')}</td>
        <td class="total-paid">${formatCurrency(totalPaid)}</td>
        <td class="${balanceClass}">${balanceText}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary action-btn" data-action="edit" data-id="${customer.id}" title="تعديل">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger action-btn" data-action="delete" data-id="${customer.id}" title="حذف">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  setupTableActions();
}

// =============================================================
// 8.1 Event Delegation للأزرار
// =============================================================
function setupTableActions() {
  const tbody = document.getElementById('customersTableBody');
  if (!tbody) return;
  tbody.removeEventListener('click', handleTableClick);
  tbody.addEventListener('click', handleTableClick);
}

function handleTableClick(e) {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!action || !id) return;
  e.preventDefault();
  if (action === 'edit') openEditModal(id);
  else if (action === 'delete') confirmDelete(id);
}

// =============================================================
// 9.  البحث
// =============================================================
function handleSearch(e) {
  const term = e.target.value.trim().toLowerCase();
  let filtered = customers;
  if (term) {
    filtered = customers.filter((c) =>
      (c.name && c.name.toLowerCase().includes(term)) ||
      (c.phone && c.phone.includes(term))
    );
  }
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} عميل`;
}

// =============================================================
// 10.  فتح مودال الإضافة
// =============================================================
function openAddModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'إضافة عميل جديد';
  document.getElementById('customerForm').reset();
  document.getElementById('customerId').value = '';
  if (customerModalInstance) customerModalInstance.show();
}

// =============================================================
// 11.  فتح مودال التعديل
// =============================================================
function openEditModal(id) {
  const customer = customers.find((c) => c.id === id);
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

  if (customerModalInstance) customerModalInstance.show();
}

// =============================================================
// 12.  حفظ البيانات (إضافة / تعديل)
// =============================================================
async function saveCustomer() {
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
      await updateDoc(doc(db, 'customers', id), data);
      showToast('تم تحديث العميل بنجاح', 'success');
    } else {
      data.createdAt = new Date().toISOString();
      data.totalPaid = 0;
      data.balance = 0;
      await addDoc(collection(db, 'customers'), data);
      showToast('تم إضافة العميل بنجاح', 'success');
    }
    if (customerModalInstance) customerModalInstance.hide();
  } catch (error) {
    console.error('Error saving customer:', error);
    showToast('حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ';
  }
}

// =============================================================
// 13.  حذف عميل مع تأكيد
// =============================================================
async function confirmDelete(id) {
  const customer = customers.find((c) => c.id === id);
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

// =============================================================
// 14.  إعادة تعيين النموذج عند الإغلاق
// =============================================================
const modalElement = document.getElementById('customerModal');
if (modalElement) {
  modalElement.addEventListener('hidden.bs.modal', () => {
    document.getElementById('customerForm').reset();
    document.getElementById('customerId').value = '';
  });
}

console.log('✅ Customers.js loaded with dynamic balance calculation');
