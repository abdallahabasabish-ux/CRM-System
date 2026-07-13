// =============================================================
// payments.js - النسخة الاحترافية النهائية (تم إصلاح الحذف)
// يدعم: إضافة، تعديل، حذف، تحديث رصيد العميل (totalPaid & balance)
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
  getDocs,
  runTransaction,
  serverTimestamp,
  getDoc,
  Timestamp
} from 'firebase/firestore';

// =============================================================
// 1.  المتغيرات العامة
// =============================================================
let payments = [];
let customersList = [];
let editingId = null;
let paymentsListener = null;
let paymentModalInstance = null;

// =============================================================
// 2.  دوال مساعدة (Utilities)
// =============================================================
function formatCurrency(amount, currency = '$') {
  if (amount === undefined || amount === null) return `${currency}0.00`;
  return `${currency}${amount.toFixed(2)}`;
}

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

// =============================================================
// 3.  تحميل العملاء
// =============================================================
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

// =============================================================
// 4.  المصادقة والتهيئة
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
    sidebarAvatar.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
  }

  await loadCustomers();
  listenToPayments();
});

// =============================================================
// 5.  تسجيل الخروج وتبديل الوضع
// =============================================================
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

// تبديل Sidebar للجوال
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

// =============================================================
// 6.  تهيئة Modal
// =============================================================
const modalElement = document.getElementById('paymentModal');
if (modalElement) {
  paymentModalInstance = new bootstrap.Modal(modalElement);
}

// =============================================================
// 7.  قراءة المدفوعات (Realtime)
// =============================================================
function listenToPayments() {
  const q = query(collection(db, 'payments'), orderBy('paymentDate', 'desc'));

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
    document.getElementById('totalPayments').textContent = formatCurrency(total);

    const searchTerm = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const filtered = searchTerm ? filterPayments(searchTerm) : payments;
    renderTable(filtered);
    document.getElementById('resultCount').textContent = `عرض ${filtered.length} دفعة`;
  }, (error) => {
    console.error('Error listening to payments:', error);
    showToast('حدث خطأ في تحميل المدفوعات', 'error');
  });
}

// =============================================================
// 8.  عرض الجدول (مع Event Delegation)
// =============================================================
function renderTable(data) {
  const tbody = document.getElementById('paymentsTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">لا يوجد مدفوعات</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((payment, index) => {
    let customerName = payment.customerName || 'غير معروف';
    if (!payment.customerName) {
      const customer = customersList.find(c => c.id === payment.customerId);
      customerName = customer ? customer.name : 'غير معروف';
    }

    html += `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(customerName)}</strong></td>
        <td class="payment-amount">${formatCurrency(payment.amount)}</td>
        <td><span class="payment-method-badge">${escapeHtml(payment.method || '')}</span></td>
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
  setupTableActions();
}

// =============================================================
// 8.1 Event Delegation للأزرار
// =============================================================
function setupTableActions() {
  const tbody = document.getElementById('paymentsTableBody');
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
function filterPayments(term) {
  return payments.filter(p => {
    let customerName = p.customerName || '';
    if (!p.customerName) {
      const customer = customersList.find(c => c.id === p.customerId);
      customerName = customer ? customer.name : '';
    }
    return customerName.toLowerCase().includes(term);
  });
}

document.getElementById('searchInput')?.addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? filterPayments(term) : payments;
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} دفعة`;
});

// =============================================================
// 10. فتح مودال الإضافة
// =============================================================
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
      defaultDate: new Date().toISOString().slice(0, 10)
    });
  }
  
  populateCustomerSelect();
  if (paymentModalInstance) paymentModalInstance.show();
});

// =============================================================
// 11. فتح مودال التعديل
// =============================================================
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

// =============================================================
// 12. حفظ البيانات (مع Transaction وتحديث العميل)
// =============================================================
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
  const paymentDate = document.getElementById('paymentDate').value || new Date().toISOString().slice(0, 10);
  const notes = document.getElementById('paymentNotes').value.trim();

  const saveBtn = document.getElementById('savePaymentBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';

  try {
    await runTransaction(db, async (transaction) => {
      // 1. جلب بيانات العميل (قراءة أولاً)
      const customerRef = doc(db, 'customers', customerId);
      const customerDoc = await transaction.get(customerRef);
      if (!customerDoc.exists()) throw new Error('العميل غير موجود');
      const customerData = customerDoc.data();

      // 2. حساب الرصيد الجديد
      let currentTotalPaid = customerData.totalPaid || 0;
      let currentBalance = customerData.balance || 0;

      if (paymentId) {
        currentTotalPaid = currentTotalPaid - oldAmount + amount;
        currentBalance = currentBalance + oldAmount - amount;
      } else {
        currentTotalPaid = currentTotalPaid + amount;
        currentBalance = currentBalance - amount;
      }

      // 3. تحديث العميل (كتابة)
      transaction.update(customerRef, {
        totalPaid: currentTotalPaid,
        balance: currentBalance,
        updatedAt: new Date().toISOString()
      });

      // 4. حفظ الدفعة (كتابة)
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
    let msg = 'حدث خطأ أثناء الحفظ';
    if (error.message.includes('غير موجود')) msg = error.message;
    showToast(msg, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ';
  }
});

// =============================================================
// 13. حذف دفعة (مع Transaction وتحديث العميل) - تم الإصلاح الجذري لقاعدة الترتيب
// =============================================================
async function confirmDelete(id) {
  const payment = payments.find(p => p.id === id);
  if (!payment) {
    showToast('الدفعة غير موجودة', 'error');
    return;
  }

  const result = await Swal.fire({
    title: 'هل أنت متأكد؟',
    text: `سيتم حذف الدفعة بقيمة ${formatCurrency(payment.amount)} نهائيًا.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  });

  if (!result.isConfirmed) return;

  // إظهار مؤشر تحميل محدد على الزر المضغوط بدقة
  const deleteBtn = document.querySelector(`.action-btn[data-action="delete"][data-id="${id}"]`);
  if (deleteBtn) {
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }

  try {
    await runTransaction(db, async (transaction) => {
      // الـ Rule الأساسي في الـ Transaction: القراءات (Gets) أولاً دائماً!
      const customerRef = doc(db, 'customers', payment.customerId);
      const customerDoc = await transaction.get(customerRef);
      
      // الآن نقوم بالعمليات الهيكلية (الحذف والتحديث)
      const paymentRef = doc(db, 'payments', id);
      transaction.delete(paymentRef);

      if (customerDoc.exists()) {
        const data = customerDoc.data();
        const newTotalPaid = (data.totalPaid || 0) - payment.amount;
        const newBalance = (data.balance || 0) + payment.amount;
        
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
  } finally {
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    }
  }
}

// =============================================================
// 14. إعادة تعيين النموذج عند الإغلاق
// =============================================================
modalElement?.addEventListener('hidden.bs.modal', () => {
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentId').value = '';
  document.getElementById('oldAmount').value = '';
});

console.log('✅ Payments.js loaded successfully (Fixed Delete Transaction)');
