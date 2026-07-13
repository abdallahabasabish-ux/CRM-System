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
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';

// ============================
// متغيرات عامة
// ============================
let payments = [];
let ordersList = [];
let editingId = null;
let paymentsListener = null;
let paymentModalInstance = null;

// ============================
// 1. المصادقة
// ============================
onAuthStateChangedCallback((user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }
  document.getElementById('sidebarUserName').textContent = user.displayName || user.email;
  document.getElementById('sidebarUserEmail').textContent = user.email;
  document.getElementById('sidebarAvatar').textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
  
  loadOrdersForSelect().then(() => {
    listenToPayments();
  });
});

// ============================
// 2. تسجيل الخروج وتبديل الوضع
// ============================
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await logoutUser();
  window.location.href = '../login.html';
});

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

document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ============================
// 3. تهيئة Modal
// ============================
const modalElement = document.getElementById('paymentModal');
if (modalElement) {
  paymentModalInstance = new bootstrap.Modal(modalElement);
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
// 5. تحميل قائمة الطلبات للمودال (فقط الطلبات غير المكتملة أو المدفوع جزئياً)
// ============================
async function loadOrdersForSelect() {
  try {
    const ordersSnapshot = await getDocs(collection(db, 'orders'));
    ordersList = ordersSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        remaining: (data.total || 0) - (data.paid || 0)
      };
    });
    populateOrderSelect();
  } catch (error) {
    console.error('Error loading orders for select:', error);
    showToast('حدث خطأ في تحميل الطلبات', 'error');
  }
}

function populateOrderSelect() {
  const select = document.getElementById('orderSelect');
  select.innerHTML = '<option value="">اختر طلب...</option>';
  ordersList.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    const customerName = o.customerName || 'عميل';
    opt.textContent = `#${o.orderNumber || 'N/A'} - ${customerName} (المتبقي: $${o.remaining.toFixed(2)})`;
    if (o.remaining <= 0) {
      opt.disabled = true;
      opt.textContent += ' (مدفوع بالكامل)';
    }
    select.appendChild(opt);
  });
}

// ============================
// 6. قراءة المدفوعات من Firestore (Realtime)
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

    // حساب إجمالي المدفوعات
    const total = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    document.getElementById('totalPayments').textContent = `$${total.toFixed(2)}`;

    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const filtered = searchTerm ? filterPayments(searchTerm) : payments;
    renderTable(filtered);
    document.getElementById('resultCount').textContent = `عرض ${filtered.length} دفعة`;
  }, (error) => {
    console.error('Error listening to payments:', error);
    showToast('حدث خطأ في تحميل المدفوعات', 'error');
  });
}

// ============================
// 7. عرض الجدول
// ============================
function renderTable(data) {
  const tbody = document.getElementById('paymentsTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">لا يوجد مدفوعات</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((payment, index) => {
    // إيجاد معلومات الطلب والعميل
    const order = ordersList.find(o => o.id === payment.orderId);
    const orderNumber = order?.orderNumber || 'N/A';
    const customerName = order?.customerName || 'غير معروف';

    html += `
      <tr>
        <td>${index + 1}</td>
        <td><strong>#${orderNumber}</strong></td>
        <td>${escapeHtml(customerName)}</td>
        <td>$${payment.amount ? payment.amount.toFixed(2) : '0.00'}</td>
        <td>${escapeHtml(payment.method || '')}</td>
        <td>${formatDate(payment.paymentDate)}</td>
        <td>${escapeHtml(payment.notes || '')}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${payment.id}" title="تعديل">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${payment.id}" title="حذف">
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

function formatDate(date) {
  if (!date) return '-';
  if (typeof date === 'string') return date;
  if (date instanceof Date) return date.toISOString().slice(0,10);
  return '';
}

// ============================
// 8. البحث والفلترة
// ============================
function filterPayments(term) {
  return payments.filter(p => {
    const order = ordersList.find(o => o.id === p.orderId);
    const orderNumber = order?.orderNumber?.toLowerCase() || '';
    const customerName = order?.customerName?.toLowerCase() || '';
    return orderNumber.includes(term) || customerName.includes(term);
  });
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? filterPayments(term) : payments;
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} دفعة`;
});

// ============================
// 9. فتح مودال الإضافة
// ============================
document.getElementById('addPaymentBtn').addEventListener('click', () => {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'تسجيل دفعة جديدة';
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentId').value = '';
  document.getElementById('orderId').value = '';
  document.getElementById('oldAmount').value = '';

  // تفعيل Flatpickr للتاريخ
  flatpickr('#paymentDate', {
    locale: 'ar',
    dateFormat: 'Y-m-d',
    defaultDate: new Date().toISOString().slice(0,10)
  });

  // تعبئة قائمة الطلبات
  populateOrderSelect();

  paymentModalInstance.show();
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
  document.getElementById('orderId').value = payment.orderId || '';
  document.getElementById('amount').value = payment.amount || '';
  document.getElementById('oldAmount').value = payment.amount || 0;
  document.getElementById('method').value = payment.method || '';
  document.getElementById('paymentDate').value = formatDate(payment.paymentDate);
  document.getElementById('paymentNotes').value = payment.notes || '';

  // تعبئة قائمة الطلبات
  populateOrderSelect();
  // تحديد الطلب المختار
  document.getElementById('orderSelect').value = payment.orderId || '';

  // تفعيل Flatpickr
  flatpickr('#paymentDate', {
    locale: 'ar',
    dateFormat: 'Y-m-d',
    defaultDate: payment.paymentDate || new Date()
  });

  paymentModalInstance.show();
}

// ============================
// 11. حفظ البيانات (مع Transaction)
// ============================
document.getElementById('savePaymentBtn').addEventListener('click', async () => {
  const orderId = document.getElementById('orderSelect').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const method = document.getElementById('method').value;
  
  if (!orderId || !amount || amount <= 0 || !method) {
    showToast('الرجاء اختيار الطلب والمبلغ وطريقة الدفع', 'warning');
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
    // استخدام Transaction لتحديث الدفعة ورصيد الطلب معًا
    await runTransaction(db, async (transaction) => {
      const orderRef = doc(db, 'orders', orderId);
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists()) {
        throw new Error('الطلب غير موجود');
      }

      const orderData = orderDoc.data();
      let newPaid = orderData.paid || 0;

      if (paymentId) {
        // تعديل: طرح المبلغ القديم وإضافة الجديد
        newPaid = newPaid - oldAmount + amount;
      } else {
        // إضافة: زيادة المبلغ
        newPaid = newPaid + amount;
      }

      // التأكد من أن المبلغ لا يتجاوز الإجمالي
      if (newPaid > orderData.total) {
        throw new Error('المبلغ الإجمالي للدفعات لا يمكن أن يتجاوز قيمة الطلب');
      }

      const balance = orderData.total - newPaid;

      // تحديث رصيد الطلب
      transaction.update(orderRef, {
        paid: newPaid,
        balance: balance,
        updatedAt: new Date().toISOString()
      });

      // إضافة أو تعديل الدفعة
      const paymentData = {
        orderId,
        orderNumber: orderData.orderNumber || null,
        customerName: orderData.customerName || null,
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
    paymentModalInstance.hide();
  } catch (error) {
    console.error('Error saving payment:', error);
    let msg = 'حدث خطأ أثناء الحفظ';
    if (error.message.includes('يتجاوز')) {
      msg = error.message;
    }
    showToast(msg, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ';
  }
});

// ============================
// 12. حذف دفعة (مع Transaction)
// ============================
async function confirmDelete(id) {
  const payment = payments.find(p => p.id === id);
  if (!payment) return;

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

  if (result.isConfirmed) {
    try {
      await runTransaction(db, async (transaction) => {
        // حذف الدفعة من مجموعة payments
        const paymentRef = doc(db, 'payments', id);
        transaction.delete(paymentRef);

        // تحديث رصيد الطلب
        const orderRef = doc(db, 'orders', payment.orderId);
        const orderDoc = await transaction.get(orderRef);
        if (orderDoc.exists()) {
          const orderData = orderDoc.data();
          const newPaid = (orderData.paid || 0) - payment.amount;
          const balance = orderData.total - newPaid;
          transaction.update(orderRef, {
            paid: newPaid,
            balance: balance,
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
}

// ============================
// 13. إعادة تعيين النموذج عند الإغلاق
// ============================
modalElement?.addEventListener('hidden.bs.modal', () => {
  document.getElementById('paymentForm').reset();
  document.getElementById('paymentId').value = '';
  document.getElementById('orderId').value = '';
  document.getElementById('oldAmount').value = '';
});

console.log('✅ صفحة المدفوعات جاهزة');
