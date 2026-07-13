// =============================================================
// treasury.js - إدارة الخزينة الشخصية
// يدعم: إيداع، سحب، تحويل، عرض الرصيد، سجل المعاملات
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
  where,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

// =============================================================
// 1.  المتغيرات العامة
// =============================================================
let transactions = [];
let customers = [];
let treasuryModalInstance = null;
let currentFilter = 'all';
let transactionsListener = null;

// =============================================================
// 2.  دوال مساعدة
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
// 3.  المصادقة والتهيئة
// =============================================================
onAuthStateChangedCallback(async (user) => {
  if (!user) {
    window.location.href = '../login.html';
    return;
  }

  // تحديث بيانات المستخدم
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

  initDarkMode();
  initSidebar();

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await logoutUser();
    window.location.href = '../login.html';
  });

  // تهيئة المودال
  const modalEl = document.getElementById('treasuryModal');
  if (modalEl) {
    treasuryModalInstance = new bootstrap.Modal(modalEl);
  }

  // تحميل العملاء لقائمة الاختيار
  await loadCustomers();

  // تحميل المعاملات
  listenToTransactions();

  // ربط الأحداث
  document.getElementById('depositBtn')?.addEventListener('click', () => openModal('deposit'));
  document.getElementById('withdrawBtn')?.addEventListener('click', () => openModal('withdraw'));
  document.getElementById('transferBtn')?.addEventListener('click', () => openModal('transfer'));
  document.getElementById('saveTxBtn')?.addEventListener('click', saveTransaction);

  // فلاتر المعاملات
  document.querySelectorAll('.filter-badge').forEach(badge => {
    badge.addEventListener('click', function() {
      document.querySelectorAll('.filter-badge').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      currentFilter = this.dataset.filter;
      renderTransactions();
    });
  });

  // إعادة تعيين المودال عند الإغلاق
  modalEl?.addEventListener('hidden.bs.modal', () => {
    document.getElementById('treasuryForm').reset();
    document.getElementById('txType').value = 'deposit';
    document.getElementById('sourceGroup').style.display = 'block';
    document.getElementById('customerGroup').style.display = 'none';
    document.getElementById('targetGroup').style.display = 'none';
  });
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
// 5.  تحميل العملاء
// =============================================================
async function loadCustomers() {
  try {
    const snap = await getDocs(collection(db, 'customers'));
    customers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    populateCustomerSelect();
  } catch (error) {
    console.error('Error loading customers:', error);
  }
}

function populateCustomerSelect() {
  const select = document.getElementById('txCustomer');
  if (!select) return;
  select.innerHTML = '<option value="">اختر عميل...</option>';
  customers.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    select.appendChild(opt);
  });
}

// =============================================================
// 6.  قراءة المعاملات (Realtime)
// =============================================================
function listenToTransactions() {
  if (transactionsListener) {
    transactionsListener();
  }

  transactionsListener = onSnapshot(
    query(collection(db, 'treasury'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      if (snapshot.empty) {
        transactions = [];
        renderTransactions();
        return;
      }

      transactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt || null
      }));

      renderTransactions();
      updateStats();
    },
    (error) => {
      console.error('Error listening to transactions:', error);
      showToast('حدث خطأ في تحميل المعاملات', 'error');
    }
  );
}

// =============================================================
// 7.  عرض المعاملات
// =============================================================
function renderTransactions() {
  const container = document.getElementById('transactionsList');
  const empty = document.getElementById('noTransactions');

  let filtered = transactions;
  if (currentFilter !== 'all') {
    filtered = transactions.filter(t => t.type === currentFilter);
  }

  if (filtered.length === 0) {
    container.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  container.style.display = 'block';

  let html = '';
  filtered.forEach((tx, index) => {
    const isDeposit = tx.type === 'deposit';
    const isWithdraw = tx.type === 'withdraw';
    const isTransfer = tx.type === 'transfer';

    let iconClass = 'transfer';
    let icon = 'fa-exchange-alt';
    let amountClass = 'positive';
    let sign = '+';

    if (isDeposit) {
      iconClass = 'deposit';
      icon = 'fa-arrow-down';
      amountClass = 'positive';
      sign = '+';
    } else if (isWithdraw) {
      iconClass = 'withdraw';
      icon = 'fa-arrow-up';
      amountClass = 'negative';
      sign = '-';
    } else if (isTransfer) {
      iconClass = 'transfer';
      icon = 'fa-exchange-alt';
      amountClass = 'positive';
      sign = '+';
    }

    const title = tx.title || tx.type || 'معاملة';
    const sub = tx.note || tx.source || '';

    html += `
      <div class="transaction-item">
        <div class="tx-icon ${iconClass}">
          <i class="fas ${icon}"></i>
        </div>
        <div class="tx-info">
          <div class="tx-title">${escapeHtml(title)}</div>
          <div class="tx-sub">${escapeHtml(sub)} • ${formatDate(tx.createdAt)}</div>
        </div>
        <div class="tx-amount ${amountClass}">${sign}${formatCurrency(tx.amount)}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// =============================================================
// 8.  تحديث الإحصائيات
// =============================================================
function updateStats() {
  const totalDeposits = transactions.filter(t => t.type === 'deposit')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const totalWithdrawals = transactions.filter(t => t.type === 'withdraw')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  const totalTransfers = transactions.filter(t => t.type === 'transfer')
    .reduce((sum, t) => sum + (t.amount || 0), 0);

  // حساب الرصيد = الإيداعات - السحوبات + التحويلات (حسب التصميم)
  const balance = totalDeposits - totalWithdrawals + totalTransfers;

  document.getElementById('currentBalance').textContent = formatCurrency(balance);
  document.getElementById('totalDeposits').textContent = formatCurrency(totalDeposits);
  document.getElementById('totalWithdrawals').textContent = formatCurrency(totalWithdrawals);
  document.getElementById('totalTransfers').textContent = formatCurrency(totalTransfers);
  document.getElementById('transactionCount').textContent = transactions.length;
}

// =============================================================
// 9.  فتح المودال
// =============================================================
function openModal(type) {
  const titles = {
    deposit: 'إيداع',
    withdraw: 'سحب',
    transfer: 'تحويل'
  };

  document.getElementById('treasuryModalTitle').textContent = titles[type] || 'معاملة';
  document.getElementById('txType').value = type;
  document.getElementById('treasuryForm').reset();

  // تفعيل Flatpickr
  if (typeof flatpickr !== 'undefined') {
    flatpickr('#txDate', {
      locale: 'ar',
      dateFormat: 'Y-m-d',
      defaultDate: new Date().toISOString().slice(0, 10)
    });
  }

  // إظهار/إخفاء الحقول حسب النوع
  const sourceGroup = document.getElementById('sourceGroup');
  const customerGroup = document.getElementById('customerGroup');
  const targetGroup = document.getElementById('targetGroup');

  if (type === 'deposit') {
    sourceGroup.style.display = 'block';
    customerGroup.style.display = 'block';
    targetGroup.style.display = 'none';
    document.getElementById('txSource').value = 'customer';
  } else if (type === 'withdraw') {
    sourceGroup.style.display = 'none';
    customerGroup.style.display = 'none';
    targetGroup.style.display = 'block';
  } else if (type === 'transfer') {
    sourceGroup.style.display = 'block';
    customerGroup.style.display = 'block';
    targetGroup.style.display = 'block';
    document.getElementById('txSource').value = 'customer';
  }

  // إظهار/إخفاء حقل العميل بناءً على المصدر
  document.getElementById('txSource')?.addEventListener('change', function() {
    const customerGroup = document.getElementById('customerGroup');
    if (this.value === 'customer') {
      customerGroup.style.display = 'block';
    } else {
      customerGroup.style.display = 'none';
    }
  });

  if (treasuryModalInstance) treasuryModalInstance.show();
}

// =============================================================
// 10.  حفظ المعاملة
// =============================================================
async function saveTransaction() {
  const type = document.getElementById('txType').value;
  const amount = parseFloat(document.getElementById('txAmount').value);
  const date = document.getElementById('txDate').value || new Date().toISOString().slice(0, 10);
  const note = document.getElementById('txNote').value.trim();

  if (!amount || amount <= 0) {
    showToast('الرجاء إدخال مبلغ صحيح', 'warning');
    return;
  }

  const saveBtn = document.getElementById('saveTxBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';

  try {
    const data = {
      type,
      amount,
      note,
      date: date ? new Date(date + 'T00:00:00') : serverTimestamp(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // إضافة حقول حسب النوع
    if (type === 'deposit' || type === 'transfer') {
      const source = document.getElementById('txSource').value;
      data.source = source;
      if (source === 'customer') {
        const customerId = document.getElementById('txCustomer').value;
        if (customerId) {
          const customer = customers.find(c => c.id === customerId);
          data.customerId = customerId;
          data.customerName = customer ? customer.name : null;
          data.title = `إيداع من ${customer ? customer.name : 'عميل'}`;
        } else {
          data.title = 'إيداع';
        }
      } else {
        data.title = 'إيداع خارجي';
      }
    }

    if (type === 'withdraw' || type === 'transfer') {
      const target = document.getElementById('txTarget').value;
      data.target = target;
      if (type === 'withdraw') {
        data.title = `سحب إلى ${target}`;
      } else {
        data.title = 'تحويل';
      }
    }

    if (type === 'transfer') {
      data.title = 'تحويل';
    }

    // حفظ في Firestore
    await addDoc(collection(db, 'treasury'), data);

    showToast('تم تسجيل المعاملة بنجاح', 'success');
    if (treasuryModalInstance) treasuryModalInstance.hide();
  } catch (error) {
    console.error('Error saving transaction:', error);
    showToast('حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ';
  }
}

console.log('✅ Treasury page ready');
