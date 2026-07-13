import { onAuthStateChangedCallback, logoutUser } from './auth.js';
import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';

// =============================================================
// 1.  متغيرات عامة (مع قيم افتراضية آمنة)
// =============================================================
let customersCount = 0;
let activeOrdersCount = 0;
let completedOrdersCount = 0;
let totalRevenue = 0;
let totalPayments = 0;
let paymentsCount = 0;
let recentPayments = [];
let recentCustomers = [];
let servicesMap = {};
let chartInstances = {};
let allOrders = [];

// ===== الخزينة =====
let treasuryBalance = 0;
let treasuryDeposits = 0;
let treasuryWithdrawals = 0;
let treasuryTransfers = 0;
let treasuryTxCount = 0;
let treasuryTransactions = [];

// =============================================================
// 2.  دوال مساعدة (آمنة تماماً)
// =============================================================
function formatCurrency(amount, currency = '$') {
  if (amount === undefined || amount === null) return `${currency}0.00`;
  return `${currency}${Math.abs(amount).toFixed(2)}`;
}

function safeDate(date) {
  if (!date) return null;
  if (date instanceof Timestamp) return date.toDate();
  if (date instanceof Date) return date;
  if (typeof date === 'string') return new Date(date);
  return null;
}

function formatDate(date) {
  const d = safeDate(date);
  if (!d) return '-';
  return d.toISOString().slice(0, 10);
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
// 3.  تهيئة الوضع المظلم والقائمة الجانبية
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
// 4.  تحميل أسماء الخدمات
// =============================================================
async function loadServices() {
  try {
    const servicesSnap = await getDocs(collection(db, 'services'));
    servicesMap = {};
    servicesSnap.docs.forEach(doc => {
      servicesMap[doc.id] = doc.data().name || 'خدمة غير معروفة';
    });
  } catch (error) {
    console.warn('⚠️ Could not load services:', error);
  }
}

// =============================================================
// 5.  تحميل البيانات الأساسية (مع معالجة الأخطاء)
// =============================================================
async function loadDashboardData() {
  try {
    console.log('📊 بدء تحميل بيانات لوحة التحكم...');

    // ===== العملاء =====
    const customersSnap = await getDocs(collection(db, 'customers'));
    customersCount = customersSnap.size;

    // ===== الطلبات =====
    const ordersSnap = await getDocs(collection(db, 'orders'));
    allOrders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    activeOrdersCount = allOrders.filter(o => o.status === 'قيد التنفيذ').length;
    completedOrdersCount = allOrders.filter(o => o.status === 'مكتمل').length;
    totalRevenue = allOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // ===== المدفوعات =====
    const paymentsSnap = await getDocs(collection(db, 'payments'));
    totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
    paymentsCount = paymentsSnap.size;

    // ===== آخر 5 دفعات =====
    const paymentsQuery = query(collection(db, 'payments'), orderBy('paymentDate', 'desc'), limit(5));
    const recentPaymentsSnap = await getDocs(paymentsQuery);
    recentPayments = recentPaymentsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      paymentDate: safeDate(doc.data().paymentDate)
    }));

    // ===== آخر 5 عملاء =====
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(5));
    const recentSnap = await getDocs(q);
    recentCustomers = recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // ===== الخزينة (مع معالجة المجموعة غير الموجودة) =====
    try {
      const treasurySnap = await getDocs(collection(db, 'treasury'));
      treasuryTransactions = treasurySnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: safeDate(doc.data().createdAt)
      }));
      treasuryDeposits = treasuryTransactions.filter(t => t.type === 'deposit')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      treasuryWithdrawals = treasuryTransactions.filter(t => t.type === 'withdraw')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      treasuryTransfers = treasuryTransactions.filter(t => t.type === 'transfer')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      treasuryBalance = treasuryDeposits - treasuryWithdrawals + treasuryTransfers;
      treasuryTxCount = treasuryTransactions.length;
    } catch (treasuryError) {
      console.warn('⚠️ Treasury collection not found or empty, using defaults.');
      treasuryTransactions = [];
      treasuryDeposits = 0;
      treasuryWithdrawals = 0;
      treasuryTransfers = 0;
      treasuryBalance = 0;
      treasuryTxCount = 0;
    }

    // ===== تحديث واجهة المستخدم =====
    updateStats();
    updateTreasuryStats();
    updateRecentPayments();
    updateRecentCustomers();
    updateCharts(allOrders);

    console.log('✅ تم تحميل بيانات لوحة التحكم بنجاح');
  } catch (error) {
    console.error('❌ خطأ في تحميل بيانات لوحة التحكم:', error);
    showToast('حدث خطأ في تحميل بعض البيانات. تم تحميل البيانات المتاحة.', 'warning');
  }
}

// =============================================================
// 6.  الاستماع للتحديثات الفورية
// =============================================================
function listenToRealtimeUpdates() {
  // ===== العملاء =====
  onSnapshot(collection(db, 'customers'), (snapshot) => {
    customersCount = snapshot.size;
    updateStats();
  }, (error) => console.warn('⚠️ Customers listener error:', error));

  // ===== الطلبات =====
  onSnapshot(collection(db, 'orders'), (snapshot) => {
    allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    activeOrdersCount = allOrders.filter(o => o.status === 'قيد التنفيذ').length;
    completedOrdersCount = allOrders.filter(o => o.status === 'مكتمل').length;
    totalRevenue = allOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    updateStats();
    updateCharts(allOrders);
  }, (error) => console.warn('⚠️ Orders listener error:', error));

  // ===== المدفوعات =====
  onSnapshot(collection(db, 'payments'), (snapshot) => {
    totalPayments = snapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
    paymentsCount = snapshot.size;
    updateStats();

    // تحديث جدول آخر الدفعات
    const sorted = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      paymentDate: safeDate(doc.data().paymentDate)
    })).sort((a, b) => {
      const da = a.paymentDate ? new Date(a.paymentDate) : 0;
      const db = b.paymentDate ? new Date(b.paymentDate) : 0;
      return db - da;
    }).slice(0, 5);
    recentPayments = sorted;
    updateRecentPayments();
    updatePaymentsChart();
  }, (error) => console.warn('⚠️ Payments listener error:', error));

  // ===== الخزينة (مع معالجة الأخطاء) =====
  try {
    onSnapshot(collection(db, 'treasury'), (snapshot) => {
      treasuryTransactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: safeDate(doc.data().createdAt)
      }));
      treasuryDeposits = treasuryTransactions.filter(t => t.type === 'deposit')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      treasuryWithdrawals = treasuryTransactions.filter(t => t.type === 'withdraw')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      treasuryTransfers = treasuryTransactions.filter(t => t.type === 'transfer')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      treasuryBalance = treasuryDeposits - treasuryWithdrawals + treasuryTransfers;
      treasuryTxCount = treasuryTransactions.length;
      updateTreasuryStats();
      updateTreasuryChart();
    }, (error) => {
      console.warn('⚠️ Treasury listener error (maybe collection missing):', error);
    });
  } catch (e) {
    console.warn('⚠️ Treasury listener setup error:', e);
  }

  // ===== آخر العملاء =====
  onSnapshot(query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(5)), (snapshot) => {
    recentCustomers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateRecentCustomers();
  }, (error) => console.warn('⚠️ Recent customers listener error:', error));
}

// =============================================================
// 7.  تحديث البطاقات الإحصائية الرئيسية
// =============================================================
function updateStats() {
  const el = (id) => document.getElementById(id);
  if (el('statCustomers')) el('statCustomers').textContent = customersCount;
  if (el('statActiveOrders')) el('statActiveOrders').textContent = activeOrdersCount;
  if (el('statPayments')) el('statPayments').textContent = formatCurrency(totalPayments);
  if (el('statCompleted')) el('statCompleted').textContent = completedOrdersCount;
  if (el('statRevenue')) el('statRevenue').textContent = formatCurrency(totalRevenue);
  if (el('statPaymentsCount')) el('statPaymentsCount').textContent = paymentsCount;
}

// =============================================================
// 8.  تحديث بطاقات الخزينة المصغرة
// =============================================================
function updateTreasuryStats() {
  const el = (id) => document.getElementById(id);
  if (el('treasuryHeaderBalance')) {
    el('treasuryHeaderBalance').innerHTML =
      `<small>الرصيد الحالي</small> ${formatCurrency(treasuryBalance)}`;
  }
  if (el('miniTotalDeposits')) el('miniTotalDeposits').textContent = formatCurrency(treasuryDeposits);
  if (el('miniTotalWithdrawals')) el('miniTotalWithdrawals').textContent = formatCurrency(treasuryWithdrawals);
  if (el('miniTotalTransfers')) el('miniTotalTransfers').textContent = formatCurrency(treasuryTransfers);
  if (el('miniTxCount')) el('miniTxCount').textContent = treasuryTxCount;
}

// =============================================================
// 9.  تحديث جدول آخر المدفوعات
// =============================================================
function updateRecentPayments() {
  const tbody = document.getElementById('recentPaymentsBody');
  if (!tbody) return;

  if (!recentPayments || recentPayments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">لا توجد مدفوعات</td></tr>';
    return;
  }

  let html = '';
  recentPayments.forEach((p, i) => {
    const customerName = p.customerName || 'غير معروف';
    const date = p.paymentDate ? formatDate(p.paymentDate) : '-';
    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(customerName)}</td>
        <td class="payment-amount">${formatCurrency(p.amount)}</td>
        <td><span class="payment-method-badge">${escapeHtml(p.method || '')}</span></td>
        <td>${date}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// =============================================================
// 10. تحديث جدول آخر العملاء
// =============================================================
function updateRecentCustomers() {
  const tbody = document.getElementById('recentCustomers');
  if (!tbody) return;

  if (!recentCustomers || recentCustomers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">لا يوجد عملاء</td></tr>';
    return;
  }

  let html = '';
  recentCustomers.forEach((c, i) => {
    const totalPaid = c.totalPaid || 0;
    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(c.name || '')}</td>
        <td>${escapeHtml(c.phone || '')}</td>
        <td>${formatCurrency(totalPaid)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// =============================================================
// 11.  الرسوم البيانية (مع معالجة الأخطاء)
// =============================================================
function updateCharts(ordersData) {
  try {
    const colors = ['#ff6600', '#0d6efd', '#28a745', '#8b5cf6', '#ffc107', '#dc3545'];

    // 11.1 توزيع الخدمات
    const serviceCount = {};
    ordersData.forEach(order => {
      const sid = order.serviceId;
      if (sid) serviceCount[sid] = (serviceCount[sid] || 0) + 1;
    });
    const sLabels = Object.keys(serviceCount).map(id => servicesMap[id] || id);
    const sValues = Object.values(serviceCount);

    const ctx1 = document.getElementById('servicesChart');
    if (ctx1) {
      if (chartInstances.services) chartInstances.services.destroy();
      chartInstances.services = new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: sLabels.length ? sLabels : ['لا توجد طلبات'],
          datasets: [{
            data: sLabels.length ? sValues : [1],
            backgroundColor: sLabels.length ? colors.slice(0, sLabels.length) : ['#e5e7eb'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          cutout: '60%',
          plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } } }
        }
      });
    }

    // 11.2 الطلبات الشهرية
    const monthlyOrders = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthlyOrders[key] = 0;
    }
    ordersData.forEach(order => {
      const date = safeDate(order.createdAt);
      if (date) {
        const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        if (monthlyOrders[key] !== undefined) monthlyOrders[key]++;
      }
    });
    const mLabels = Object.keys(monthlyOrders);
    const mValues = Object.values(monthlyOrders);

    const ctx2 = document.getElementById('ordersChart');
    if (ctx2) {
      if (chartInstances.orders) chartInstances.orders.destroy();
      chartInstances.orders = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: mLabels.map(l => l.split('-')[1] + '/' + l.split('-')[0]),
          datasets: [{
            label: 'الطلبات',
            data: mValues,
            backgroundColor: 'rgba(13, 110, 253, 0.7)',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { stepSize: 1 } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // 11.3 مخطط المدفوعات
    updatePaymentsChart();
    // 11.4 مخطط الخزينة
    updateTreasuryChart();
  } catch (chartError) {
    console.warn('⚠️ Chart rendering error:', chartError);
  }
}

// =============================================================
// 11.3 تحديث مخطط المدفوعات
// =============================================================
async function updatePaymentsChart() {
  try {
    const monthlyPayments = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthlyPayments[key] = 0;
    }

    const snap = await getDocs(collection(db, 'payments'));
    snap.docs.forEach(doc => {
      const data = doc.data();
      const date = safeDate(data.paymentDate);
      if (date) {
        const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        if (monthlyPayments[key] !== undefined) {
          monthlyPayments[key] += data.amount || 0;
        }
      }
    });

    const pLabels = Object.keys(monthlyPayments);
    const pValues = Object.values(monthlyPayments);

    const ctx3 = document.getElementById('paymentsChart');
    if (ctx3) {
      if (chartInstances.payments) chartInstances.payments.destroy();
      chartInstances.payments = new Chart(ctx3, {
        type: 'line',
        data: {
          labels: pLabels.map(l => l.split('-')[1] + '/' + l.split('-')[0]),
          datasets: [{
            label: 'المدفوعات ($)',
            data: pValues,
            borderColor: '#ff6600',
            backgroundColor: 'rgba(255, 102, 0, 0.1)',
            fill: true,
            tension: 0.3,
            pointBackgroundColor: '#ff6600'
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }
  } catch (e) { console.warn('⚠️ Payments chart error:', e); }
}

// =============================================================
// 11.4 تحديث مخطط الخزينة
// =============================================================
async function updateTreasuryChart() {
  try {
    const monthlyTreasury = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthlyTreasury[key] = { deposits: 0, withdrawals: 0 };
    }

    const snap = await getDocs(collection(db, 'treasury'));
    snap.docs.forEach(doc => {
      const data = doc.data();
      const date = safeDate(data.createdAt);
      if (date) {
        const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        if (monthlyTreasury[key] !== undefined) {
          if (data.type === 'deposit') monthlyTreasury[key].deposits += data.amount || 0;
          else if (data.type === 'withdraw') monthlyTreasury[key].withdrawals += data.amount || 0;
        }
      }
    });

    const labels = Object.keys(monthlyTreasury);
    const deposits = labels.map(l => monthlyTreasury[l].deposits);
    const withdrawals = labels.map(l => monthlyTreasury[l].withdrawals);

    const ctx4 = document.getElementById('treasuryChart');
    if (ctx4) {
      if (chartInstances.treasury) chartInstances.treasury.destroy();
      chartInstances.treasury = new Chart(ctx4, {
        type: 'bar',
        data: {
          labels: labels.map(l => l.split('-')[1] + '/' + l.split('-')[0]),
          datasets: [
            { label: 'إيداعات', data: deposits, backgroundColor: 'rgba(40,167,69,0.7)', borderRadius: 4 },
            { label: 'سحوبات', data: withdrawals, backgroundColor: 'rgba(220,53,69,0.7)', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { usePointStyle: true } } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }
  } catch (e) { console.warn('⚠️ Treasury chart error:', e); }
}

// =============================================================
// 12.  التهيئة العامة
// =============================================================
onAuthStateChangedCallback(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  // تحديث بيانات المستخدم
  const sidebarUserName = document.getElementById('sidebarUserName');
  const sidebarUserEmail = document.getElementById('sidebarUserEmail');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  if (sidebarUserName) sidebarUserName.textContent = user.displayName || user.email;
  if (sidebarUserEmail) sidebarUserEmail.textContent = user.email;
  if (sidebarAvatar) {
    sidebarAvatar.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
  }

  initDarkMode();
  initSidebar();

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await logoutUser();
    window.location.href = 'login.html';
  });

  await loadServices();
  await loadDashboardData();
  listenToRealtimeUpdates();
});

console.log('✅ Dashboard.js loaded (stable version with full treasury support)');
