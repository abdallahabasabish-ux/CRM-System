import { onAuthStateChangedCallback, logoutUser } from '../auth.js';
import { db } from '../firebase-config.js';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, getDocs, where, runTransaction, serverTimestamp
} from 'firebase/firestore';

// ============================
// متغيرات عامة
// ============================
let payments = [];
let ordersList = [];
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
  // للتعامل مع طوابع Firebase الزمنية
  if (date.toDate) return date.toDate().toISOString().slice(0, 10);
  return '';
}

// ============================
// 2. تحميل البيانات
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

async function loadOrdersForCustomer(customerId) {
  const orderSelect = document.getElementById('orderSelect');
  if (!customerId) {
    if (orderSelect) {
      orderSelect.innerHTML = '<option value="">اختر طلب...</option>';
      orderSelect.disabled = true;
    }
    return;
  }
  
  orderSelect.innerHTML = '<option value="">جاري التحميل...</option>';
  try {
    const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
    const ordersSnap = await getDocs(q);
    ordersList = ordersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      remaining: (doc.data().total || 0) - (doc.data().paid || 0)
    }));
    populateOrderSelect();
    if (orderSelect) orderSelect.disabled = false;
  } catch (error) {
    console.error('Error loading orders:', error);
    showToast('حدث خطأ في تحميل الطلبات', 'error');
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

function populateOrderSelect() {
  const select = document.getElementById('orderSelect');
  if (!select) return;
  select.innerHTML = '<option value="">اختر طلب...</option>';
  ordersList.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    const remaining = o.remaining || 0;
    opt.textContent = `#${o.orderNumber || 'N/A'} - المتبقي: $${remaining.toFixed(2)}`;
    if (remaining <= 0 && !editingId) { // تعطيل فقط إذا لم نكن في وضع التعديل لنفس الطلب
      opt.disabled = true;
      opt.textContent += ' (مدفوع بالكامل)';
    }
    select.appendChild(opt);
  });
}

// ============================
// 3. التهيئة عند تسجيل الدخول
// ============================
onAuthStateChangedCallback(async (user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }
  
  await loadCustomers();
  listenToPayments();
  
  // تهيئة Modal
  const modalElement = document.getElementById('paymentModal');
  if (modalElement) {
    paymentModalInstance = new bootstrap.Modal(modalElement);
  }
});

// ============================
// 4. قراءة المدفوعات (Realtime)
// ============================
function listenToPayments() {
  const paymentsRef = collection(db, 'payments');
  const q = query(paymentsRef, orderBy('paymentDate', 'desc'));

  if (paymentsListener) paymentsListener();

  paymentsListener = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      payments = [];
      renderTable([]);
      updateStats(0, 0);
      return;
    }

    payments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const searchTerm = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const filtered = searchTerm ? filterPayments(searchTerm) : payments;
    
    renderTable(filtered);
    updateStats(total, filtered.length);
  }, (error) => {
    console.error('Error listening to payments:', error);
    showToast('حدث خطأ في تحميل المدفوعات', 'error');
  });
}

function updateStats(totalAmount, count) {
  const totalEl = document.getElementById('totalPayments');
  const countEl = document.getElementById('resultCount');
  if (totalEl) totalEl.textContent = `$${totalAmount.toFixed(2)}`;
  if (countEl) countEl.textContent = `عرض ${count} دفعة`;
}

// ============================
// 5. عرض الجدول و Event Delegation
// ============================
function renderTable(data) {
  const tbody = document.getElementById('paymentsTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">لا يوجد مدفوعات</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((payment, index) => {
    const orderNumber = payment.orderNumber || 'N/A';
    const customerName = payment.customerName || 'غير معروف';

    return `
      <tr>
        <td>${index + 1}</td>
        <td><strong>#${escapeHtml(orderNumber)}</strong></td>
        <td>${escapeHtml(customerName)}</td>
        <td>$${payment.amount ? payment.amount.toFixed(2) : '0.00'}</td>
        <td><span class="badge bg-secondary">${escapeHtml(payment.method || '')}</span></td>
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
  }).join('');

  setupTableActions();
}

function setupTableActions() {
  const tbody = document.getElementById('paymentsTableBody');
  if (!tbody) return;
  tbody.removeEventListener('click', handleTableClick);
  tbody.addEventListener('click', handleTableClick);
}

function handleTableClick(e) {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (!action || !id) return;
  
  e.preventDefault();
  if (action === 'edit') openEditModal(id);
  else if (action === 'delete') confirmDelete(id);
}

// ============================
// 6. البحث والتصفية
// ============================
function filterPayments(term) {
  return payments.filter(p => {
    const orderNo = (p.orderNumber || '').toLowerCase();
    const custName = (p.customerName || '').toLowerCase();
    return orderNo.includes(term) || custName.includes(term);
  });
}

document.getElementById('searchInput')?.addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? filterPayments(term) : payments;
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} دفعة`;
});

// ============================
// 7. إدارة النموذج (Modal)
// ============================
document.getElementById('addPaymentBtn')?.addEventListener('click', () => {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'تسجيل دفعة جديدة';
  document.getElementById('paymentForm').reset();
  
  ['paymentId', 'orderId', 'oldAmount'].forEach(id => document.getElementById(id).value = '');
  
  initFlatpickr(new Date().toISOString().slice(0,10));
  populateCustomerSelect();
  
  const orderSelect = document.getElementById('orderSelect');
  if (orderSelect) {
    orderSelect.disabled = true;
    orderSelect.innerHTML = '<option value="">اختر طلب...</option>';
  }

  if (paymentModalInstance) paymentModalInstance.show();
});

document.getElementById('customerSelect')?.addEventListener('change', (e) => {
  loadOrdersForCustomer(e.target.value);
});

async function openEditModal(id) {
  const payment = payments.find(p => p.id === id);
  if (!payment) return showToast('الدفعة غير موجودة', 'error');

  editingId = id;
  document.getElementById('modalTitle').textContent = 'تعديل الدفعة';
  document.getElementById('paymentForm').reset();
  
  document.getElementById('paymentId').value = id;
  document.getElementById('oldAmount').value = payment.amount || 0;
  document.getElementById('amount').value = payment.amount || '';
  document.getElementById('method').value = payment.method || '';
  document.getElementById('paymentNotes').value = payment.notes || '';

  populateCustomerSelect();
  
  if (payment.customerId) {
    document.getElementById('customerSelect').value = payment.customerId;
    await loadOrdersForCustomer(payment.customerId);
    document.getElementById('orderSelect').value = payment.orderId || '';
  }

  initFlatpickr(formatDate(payment.paymentDate));

  if (paymentModalInstance) paymentModalInstance.show();
}

function initFlatpickr(defaultDate) {
  if (typeof flatpickr !== 'undefined') {
    flatpickr('#paymentDate', {
      locale: 'ar',
      dateFormat: 'Y-m-d',
      defaultDate: defaultDate
    });
  }
}

// ============================
// 8. الحفظ والحذف (Transactions)
// ============================
document.getElementById('savePaymentBtn')?.addEventListener('click', async () => {
  const customerId = document.getElementById('customerSelect').value;
  const orderId = document.getElementById('orderSelect').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const method = document.getElementById('method').value;

  if (!customerId || !orderId || isNaN(amount) || amount <= 0 || !method) {
    return showToast('الرجاء تعبئة جميع الحقول المطلوبة بشكل صحيح', 'warning');
  }

  const paymentId = document.getElementById('paymentId').value;
  const oldAmount = parseFloat(document.getElementById('oldAmount').value) || 0;
  const dateVal = document.getElementById('paymentDate').value;
  const notes = document.getElementById('paymentNotes').value.trim();

  const saveBtn = document.getElementById('savePaymentBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';

  try {
    await runTransaction(db, async (transaction) => {
      const orderRef = doc(db, 'orders', orderId);
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists()) throw new Error('الطلب غير موجود');
      
      const orderData = orderDoc.data();
      let newPaid = (orderData.paid || 0) - oldAmount + amount;

      if (newPaid > orderData.total) {
        throw new Error('المبلغ الإجمالي للدفعات يتجاوز قيمة الطلب');
      }

      transaction.update(orderRef, {
        paid: newPaid,
        balance: orderData.total - newPaid,
        updatedAt: new Date().toISOString()
      });

      const paymentData = {
        orderId,
        customerId,
        orderNumber: orderData.orderNumber || null,
        customerName: customersList.find(c => c.id === customerId)?.name || 'غير معروف',
        amount,
        method,
        paymentDate: dateVal ? new Date(dateVal + 'T00:00:00') : serverTimestamp(),
        notes,
        updatedAt: new Date().toISOString()
      };

      if (paymentId) {
        transaction.update(doc(db, 'payments', paymentId), paymentData);
      } else {
        paymentData.createdAt = new Date().toISOString();
        transaction.set(doc(collection(db, 'payments')), paymentData);
      }
    });

    showToast(paymentId ? 'تم تحديث الدفعة بنجاح' : 'تم تسجيل الدفعة بنجاح', 'success');
    if (paymentModalInstance) paymentModalInstance.hide();
  } catch (error) {
    console.error('Error saving:', error);
    showToast(error.message.includes('يتجاوز') ? error.message : 'حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ';
  }
});

async function confirmDelete(id) {
  const payment = payments.find(p => p.id === id);
  if (!payment) return;

  const result = await Swal.fire({
    title: 'هل أنت متأكد؟',
    text: `سيتم حذف الدفعة بقيمة $${payment.amount?.toFixed(2)} نهائياً وتحديث رصيد الطلب.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  });

  if (result.isConfirmed) {
    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'orders', payment.orderId);
        const orderDoc = await transaction.get(orderRef);
        
        if (orderDoc.exists()) {
          const orderData = orderDoc.data();
          const newPaid = (orderData.paid || 0) - payment.amount;
          transaction.update(orderRef, {
            paid: newPaid,
            balance: orderData.total - newPaid,
            updatedAt: new Date().toISOString()
          });
        }
        transaction.delete(doc(db, 'payments', id));
      });
      showToast('تم حذف الدفعة بنجاح', 'success');
    } catch (error) {
      console.error('Error deleting:', error);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }
}
