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

// ============================
// متغيرات عامة
// ============================
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

// متغيرات الخزينة
let treasuryBalance = 0;
let treasuryDeposits = 0;
let treasuryWithdrawals = 0;
let treasuryTransfers = 0;
let treasuryTxCount = 0;
let treasuryTransactions = [];

// ============================
// دوال مساعدة
// ============================
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

// ============================
// 1. المصادقة والتهيئة
// ============================
onAuthStateChangedCallback(async (user) => {
  if (!user) {
    window.location.href = 'login.html';
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
    window.location.href = 'login.html';
  });

  // تحميل أسماء الخدمات
  await loadServices();

  // تحميل البيانات
  await loadDashboardData();

  // بدء الاستماع للتحديثات الفورية
  listenToRealtimeUpdates();
});

// ============================
// 2. الوضع المظلم والقائمة الجانبية
// ============================
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

// ============================
// 3. تحميل أسماء الخدمات
// ============================
async function loadServices() {
  try {
    const servicesSnap = await getDocs(collection(db, 'services'));
    servicesMap = {};
    servicesSnap.docs.forEach(doc => {
      servicesMap[doc.id] = doc.data().name || 'خدمة غير معروفة';
    });
  } catch (error) {
    console.error('Error loading services:', error);
  }
}

// ============================
// 4. تحميل البيانات الأولية
// ============================
async function loadDashboardData() {
  try {
    // العملاء
    const customersSnap = await getDocs(collection(db, 'customers'));
    customersCount = customersSnap.size;

    // الطلبات
    const ordersSnap = await getDocs(collection(db, 'orders'));
    allOrders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    activeOrdersCount = allOrders.filter(o => o.status === 'قيد التنفيذ').length;
    completedOrdersCount = allOrders.filter(o => o.status === 'مكتمل').length;
    totalRevenue = allOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // المدفوعات
    const paymentsSnap = await getDocs(collection(db, 'payments'));
    totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
    paymentsCount = paymentsSnap.size;

    // آخر 5 دفعات
    const paymentsQuery = query(collection(db, 'payments'), orderBy('paymentDate', 'desc'), limit(5));
    const recentPaymentsSnap = await getDocs(paymentsQuery);
    recentPayments = recentPaymentsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      paymentDate: doc.data().paymentDate?.toDate?.() || doc.data().paymentDate || null
    }));

    // آخر 5 عملاء
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(5));
    const recentSnap = await getDocs(q);
    recentCustomers = recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // ===== بيانات الخزينة =====
    const treasurySnap = await getDocs(collection(db, 'treasury'));
    treasuryTransactions = treasurySnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt || null
    }));
    treasuryDeposits = treasuryTransactions.filter(t => t.type === 'deposit')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    treasuryWithdrawals = treasuryTransactions.filter(t => t.type === 'withdraw')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    treasuryTransfers = treasuryTransactions.filter(t => t.type === 'transfer')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    treasuryBalance = treasuryDeposits - treasuryWithdrawals + treasuryTransfers;
    treasuryTxCount = treasuryTransactions.length;

    // تحديث واجهة المستخدم
    updateStats();
    updateTreasuryStats();
    updateRecentPayments();
    updateRecentCustomers();
    updateCharts(allOrders);

  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showToast('حدث خطأ في تحميل البيانات', 'error');
  }
}

// ============================
// 5. الاستماع للتحديثات الفورية
// ============================
function listenToRealtimeUpdates() {
  // العملاء
  onSnapshot(collection(db, 'customers'), (snapshot) => {
    customersCount = snapshot.size;
    updateStats();
  });

  // الطلبات
  onSnapshot(collection(db, 'orders'), (snapshot) => {
    allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    activeOrdersCount = allOrders.filter(o => o.status === 'قيد التنفيذ').length;
    completedOrdersCount = allOrders.filter(o => o.status === 'مكتمل').length;
    totalRevenue = allOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    updateStats();
    updateCharts(allOrders);
  });

  // المدفوعات
  onSnapshot(collection(db, 'payments'), (snapshot) => {
    totalPayments = snapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
    paymentsCount = snapshot.size;
    updateStats();

    // تحديث جدول آخر الدفعات
    const sorted = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      paymentDate: doc.data().paymentDate?.toDate?.() || doc.data().paymentDate || null
    })).sort((a, b) => {
      const da = a.paymentDate ? new Date(a.paymentDate) : 0;
      const db = b.paymentDate ? new Date(b.paymentDate) : 0;
      return db - da;
    }).slice(0, 5);
    recentPayments = sorted;
    updateRecentPayments();

    // تحديث مخطط المدفوعات
    updatePaymentsChart();
  });

  // الخزينة
  onSnapshot(collection(db, 'treasury'), (snapshot) => {
    treasuryTransactions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt || null
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
  });

  // آخر العملاء
  onSnapshot(query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(5)), (snapshot) => {
    recentCustomers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateRecentCustomers();
  });
}

// ============================
// 6. تحديث البطاقات الإحصائية
// ============================
function updateStats() {
  document.getElementById('statCustomers').textContent = customersCount;
  document.getElementById('statActiveOrders').textContent = activeOrdersCount;
  document.getElementById('statPayments').textContent = formatCurrency(totalPayments);
  document.getElementById('statCompleted').textContent = completedOrdersCount;
  document.getElementById('statRevenue').textContent = formatCurrency(totalRevenue);
  document.getElementById('statPaymentsCount').textContent = paymentsCount;
}

// ============================
// 7. تحديث بطاقات الخزينة
// ============================
function updateTreasuryStats() {
  document.getElementById('treasuryBalance').textContent = formatCurrency(treasuryBalance);
  document.getElementById('treasuryDeposits').textContent = formatCurrency(treasuryDeposits);
  document.getElementById('treasuryWithdrawals').textContent = formatCurrency(treasuryWithdrawals);
  document.getElementById('treasuryTxCount').textContent = treasuryTxCount;
}

// ============================
// 8. تحديث جدول آخر الدفعات
// ============================
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

// ============================
// 9. تحديث جدول آخر العملاء
// ============================
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

// ============================
// 10. تحديث الرسوم البيانية
// ============================
function updateCharts(ordersData) {
  const colors = ['#ff6600', '#0d6efd', '#28a745', '#8b5cf6', '#ffc107', '#dc3545'];

  // ===== 10.1 مخطط توزيع الخدمات =====
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

  // ===== 10.2 مخطط الطلبات الشهرية =====
  const monthlyOrders = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthlyOrders[key] = 0;
  }
  ordersData.forEach(order => {
    const date = order.createdAt?.toDate?.() || order.createdAt;
    if (date) {
      const d = date instanceof Date ? date : new Date(date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
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

  // ===== 10.3 مخطط المدفوعات =====
  updatePaymentsChart();

  // ===== 10.4 مخطط الخزينة =====
  updateTreasuryChart();
}

// ============================
// 10.3 تحديث مخطط المدفوعات
// ============================
async function updatePaymentsChart() {
  const monthlyPayments = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthlyPayments[key] = 0;
  }

  try {
    const snap = await getDocs(collection(db, 'payments'));
    snap.docs.forEach(doc => {
      const data = doc.data();
      const date = data.paymentDate?.toDate?.() || data.paymentDate;
      if (date) {
        const d = date instanceof Date ? date : new Date(date);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
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
  } catch (error) {
    console.error('Error updating payments chart:', error);
  }
}

// ============================
// 10.4 تحديث مخطط الخزينة
// ============================
async function updateTreasuryChart() {
  const monthlyTreasury = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthlyTreasury[key] = { deposits: 0, withdrawals: 0 };
  }

  try {
    const snap = await getDocs(collection(db, 'treasury'));
    snap.docs.forEach(doc => {
      const data = doc.data();
      const date = data.createdAt?.toDate?.() || data.createdAt;
      if (date) {
        const d = date instanceof Date ? date : new Date(date);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (monthlyTreasury[key] !== undefined) {
          if (data.type === 'deposit') {
            monthlyTreasury[key].deposits += data.amount || 0;
          } else if (data.type === 'withdraw') {
            monthlyTreasury[key].withdrawals += data.amount || 0;
          }
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
            {
              label: 'إيداعات',
              data: deposits,
              backgroundColor: 'rgba(40, 167, 69, 0.7)',
              borderRadius: 4
            },
            {
              label: 'سحوبات',
              data: withdrawals,
              backgroundColor: 'rgba(220, 53, 69, 0.7)',
              borderRadius: 4
            }
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
  } catch (error) {
    console.error('Error updating treasury chart:', error);
  }
}

console.log('✅ Dashboard ready with real data and treasury');
