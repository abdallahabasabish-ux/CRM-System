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
  getDocs,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';

// ============================
// متغيرات عامة
// ============================
let payments = [];
let customersList = [];
let editingId = null;
let paymentsListener = null;
let paymentModalInstance = null;

// ============================
// 1. دوال مساعدة
// ============================
function showToast(message, type = 'success') {
  const colors = {
    success: 'linear-gradient(to right, #00b09b, #96c93d)',
    error: 'linear-gradient(to right, #ff5f6d, #ffc371)',
    warning: 'linear-gradient(to right, #f7971e, #ffd200)',
    info: 'linear-gradient(to right, #ff6600, #ff8533)'
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
  return '';
}

// ============================
// 2. تحميل العملاء
// ============================
async function loadCustomers() {
  try {
    const customersSnap = await getDocs(collection(db, 'customers'));
    customersList = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    populateCustomerSelect();
  } catch (error) {
    console.error('Error loading customers:', error);
    showToast('حدث خطأ في تحميل العملاء', 'error');
  }
}

function populateCustomerSelect() {
  const select = document.getElementById('customerSelect');
  if (!select) return;
  select.innerHTML = '<option value="">اختر عميل...</option>';
  customersList.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });
}

// ============================
// 3. المصادقة والتهيئة
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

  await loadCustomers();
  listenToPayments();
});

// ============================
// 4. تسجيل الخروج وتبديل الوضع
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
// 5. تهيئة Modal
// ============================
const modalElement = document.getElementById('paymentModal');
if (modalElement) {
  paymentModalInstance = new bootstrap.Modal(modalElement);
}

// ============================
// 6. قراءة المدفوعات (Realtime)
// ============================
function listenToPayments() {
  const paymentsRef = collection(db, 'payments');
  const q = query(paymentsRef, orderBy('paymentDate', 'desc'));

  if (paymentsListener) {
    paymentsListener();
  }

  paymentsListener = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      payments = [];
      renderTable([]);
      document.getElementById('totalPayments').textContent = '$0.00';
      document.getElementById('resultCount').textContent = 'عرض 0 دفعة';
      return;
    }

    payments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      paymentDate: doc.data().paymentDate?.toDate?.() || doc.data().paymentDate || null
    }));

    const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    document.getElementById('totalPayments').textContent = `$${total.toFixed(2)}`;

    const searchTerm = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const filtered = searchTerm ? filterPayments(searchTerm) : payments;
    renderTable(filtered);
    document.getElementById('resultCount').textContent = `عرض ${filtered.length} دفعة`;
  }, (error) => {
    console.error('Error listening to payments:', error);
    showToast('حدث خطأ في تحميل المدفوعات', 'error');
  });
}

// ============================
// 7. عرض الجدول (مع Event Delegation)
// ============================
function renderTable(data) {
  const tbody = document.getElementById('paymentsTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">لا يوجد مدفوعات</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((payment, index) => {
    const customer = customersList.find(c => c.id === payment.customerId);
    const customerName = customer ? customer.name : 'غير معروف';

    html += `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(customerName)}</td>
        <td>$${payment.amount ? payment.amount.toFixed(2) : '0.00'}</td>
        <td>${escapeHtml(payment.method || '')}</td>
        <td>${formatDate(payment.paymentDate)}</td>
        <td>${escapeHtml(payment.notes || '')}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary action-btn" data-action="edit" data-id="${payment.id}" title="تعديل">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger action-btn" data-action="delete" data-id="${payment.id}" title="حذف">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  // ربط الـ Event Delegation
  setupTableActions();
}

// ============================
// 7.1 Event Delegation للأزرار (حل المشكلة)
// ============================
function setupTableActions() {
  const tbody = document.getElementById('paymentsTableBody');
  if (!tbody) return;
  // إزالة المستمع القديم لتجنب التكرار
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

// ============================
// 8. البحث
// ============================
function filterPayments(term) {
  return payments.filter(p => {
    const customer = customersList.find(c => c.id === p.customerId);
    const customerName = customer?.name?.toLowerCase() || '';
    return customerName.includes(term);
  });
}

document.getElementById('searchInput')?.addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? filterPayments(term) : payments;
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} دفعة`;
});

// ============================
// 9. فتح مودال الإضافة
// ============================
document.getElementById('addPaymentBtn')?.addEventListener('click', () => {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'تسجيل دفعة جديدة';
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentId').value = '';
  document.getElementById('oldAmount').value = '';

  if (typeof flatpickr !== 'undefined') {
    flatpickr('#paymentDate', {
      locale: 'ar',
      dateFormat: 'Y-m-d',
      defaultDate: new Date().toISOString().slice(0,10)
    });
  }

  populateCustomerSelect();

  if (paymentModalInstance) paymentModalInstance.show();
});

// ============================
// 10. فتح مودال التعديل
// ============================
function openEditModal(id) {
  const payment = payments.find(p => p.id === id);
  if (!payment) {
    showToast('الدفعة غير موجودة', 'error');
    return;
  }

  editingId = id;
  document.getElementById('modalTitle').textContent = 'تعديل الدفعة';
  document.getElementById('paymentId').value = id;
  document.getElementById('amount').value = payment.amount || '';
  document.getElementById('oldAmount').value = payment.amount || 0;
  document.getElementById('method').value = payment.method || '';
  document.getElementById('paymentDate').value = formatDate(payment.paymentDate);
  document.getElementById('paymentNotes').value = payment.notes || '';

  populateCustomerSelect();
  const customer = customersList.find(c => c.id === payment.customerId);
  if (customer) {
    document.getElementById('customerSelect').value = customer.id;
  }

  if (typeof flatpickr !== 'undefined') {
    flatpickr('#paymentDate', {
      locale: 'ar',
      dateFormat: 'Y-m-d',
      defaultDate: payment.paymentDate || new Date()
    });
  }

  if (paymentModalInstance) paymentModalInstance.show();
}

// ============================
// 11. حفظ البيانات (Transaction) - بدون تغيير
// ============================
document.getElementById('savePaymentBtn')?.addEventListener('click', async () => {
  const customerId = document.getElementById('customerSelect').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const method = document.getElementById('method').value;

  if (!customerId || !amount || amount <= 0 || !method) {
    showToast('الرجاء اختيار العميل والمبلغ وطريقة الدفع', 'warning');
    return;
  }

  const paymentId = document.getElementById('paymentId').value;
  const oldAmount = parseFloat(document.getElementById('oldAmount').value) || 0;
  const paymentDate = document.getElementById('paymentDate').value || new Date().toISOString().slice(0,10);
  const notes = document.getElementById('paymentNotes').value.trim();

  const saveBtn = document.getElementById('savePaymentBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';

  try {
    await runTransaction(db, async (transaction) => {
      const customerRef = doc(db, 'customers', customerId);
      const customerDoc = await transaction.get(customerRef);
      if (!customerDoc.exists()) throw new Error('العميل غير موجود');
      const customerData = customerDoc.data();

      let newTotalPaid = (customerData.totalPaid || 0);
      if (paymentId) {
        newTotalPaid = newTotalPaid - oldAmount + amount;
      } else {
        newTotalPaid = newTotalPaid + amount;
      }

      // المتبقي = إجمالي قيمة الطلبات - إجمالي المدفوع
      // نفترض أن customerData.totalOrdersValue موجود، وإلا نستخدم 0
      const totalOrdersValue = customerData.totalOrdersValue || 0;
      const newBalance = totalOrdersValue - newTotalPaid;

      transaction.update(customerRef, {
        totalPaid: newTotalPaid,
        balance: newBalance,
        updatedAt: new Date().toISOString()
      });

      const paymentData = {
        customerId,
        customerName: customerData.name || null,
        amount,
        method,
        paymentDate: paymentDate ? new Date(paymentDate + 'T00:00:00') : serverTimestamp(),
        notes,
        updatedAt: new Date().toISOString()
      };

      if (paymentId) {
        const paymentRef = doc(db, 'payments', paymentId);
        transaction.update(paymentRef, paymentData);
      } else {
        paymentData.createdAt = new Date().toISOString();
        const paymentRef = doc(collection(db, 'payments'));
        transaction.set(paymentRef, paymentData);
      }
    });

    showToast(paymentId ? 'تم تحديث الدفعة بنجاح' : 'تم تسجيل الدفعة بنجاح', 'success');
    if (paymentModalInstance) paymentModalInstance.hide();
  } catch (error) {
    console.error('Error saving payment:', error);
    showToast(error.message || 'حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ';
  }
});

// ============================
// 12. حذف دفعة (Transaction) - تم إصلاحها
// ============================
async function confirmDelete(id) {
  const payment = payments.find(p => p.id === id);
  if (!payment) {
    showToast('الدفعة غير موجودة', 'error');
    return;
  }

  const result = await Swal.fire({
    title: 'هل أنت متأكد؟',
    text: `سيتم حذف الدفعة بقيمة $${payment.amount?.toFixed(2)} نهائيًا.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  });

  if (!result.isConfirmed) return;

  try {
    await runTransaction(db, async (transaction) => {
      // 1. حذف الدفعة
      const paymentRef = doc(db, 'payments', id);
      transaction.delete(paymentRef);

      // 2. تحديث رصيد العميل
      const customerRef = doc(db, 'customers', payment.customerId);
      const customerDoc = await transaction.get(customerRef);
      if (customerDoc.exists()) {
        const data = customerDoc.data();
        const newTotalPaid = (data.totalPaid || 0) - payment.amount;
        const totalOrdersValue = data.totalOrdersValue || 0;
        const newBalance = totalOrdersValue - newTotalPaid;
        transaction.update(customerRef, {
          totalPaid: newTotalPaid,
          balance: newBalance,
          updatedAt: new Date().toISOString()
        });
      }
    });
    showToast('تم حذف الدفعة بنجاح', 'success');
  } catch (error) {
    console.error('Error deleting payment:', error);
    showToast('حدث خطأ أثناء الحذف', 'error');
  }
}

// ============================
// 13. إعادة تعيين النموذج عند الإغلاق
// ============================
modalElement?.addEventListener('hidden.bs.modal', () => {
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentId').value = '';
  document.getElementById('oldAmount').value = '';
});

console.log('✅ Payments page ready with fixed delete');
