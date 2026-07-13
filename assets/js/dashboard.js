import { onAuthStateChangedCallback, logoutUser } from './auth.js';
import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot
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

// ============================
// 1. المصادقة والتهيئة
// ============================
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

  await loadServices();
  await loadDashboardData();
  listenToRealtimeUpdates();
});

// ============================
// 2. تسجيل الخروج وتبديل الوضع (نفس الكود السابق)
// ============================
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await logoutUser();
  window.location.href = 'login.html';
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
    activeOrdersCount = ordersSnap.docs.filter(doc => doc.data().status === 'قيد التنفيذ').length;
    completedOrdersCount = ordersSnap.docs.filter(doc => doc.data().status === 'مكتمل').length;
    totalRevenue = ordersSnap.docs.reduce((sum, doc) => sum + (doc.data().total || 0), 0);

    // المدفوعات (جلب الكل لحساب الإجمالي والعدد)
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

    // تحديث واجهة المستخدم
    updateStats();
    updateRecentPayments();
    updateRecentCustomers();
    updateCharts(ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));

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
    activeOrdersCount = snapshot.docs.filter(doc => doc.data().status === 'قيد التنفيذ').length;
    completedOrdersCount = snapshot.docs.filter(doc => doc.data().status === 'مكتمل').length;
    totalRevenue = snapshot.docs.reduce((sum, doc) => sum + (doc.data().total || 0), 0);
    updateStats();
    const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateCharts(ordersData);
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

    // تحديث الرسم البياني للمدفوعات (يتم إعادة رسمه)
    updatePaymentsChart();
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
  document.getElementById('statPayments').textContent = `$${totalPayments.toFixed(2)}`;
  document.getElementById('statCompleted').textContent = completedOrdersCount;
  document.getElementById('statRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
  document.getElementById('statPaymentsCount').textContent = paymentsCount;
}

// ============================
// 7. تحديث جدول آخر الدفعات
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
        <td class="payment-amount">$${(p.amount || 0).toFixed(2)}</td>
        <td><span class="payment-method">${escapeHtml(p.method || '')}</span></td>
        <td>${date}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// ============================
// 8. تحديث جدول آخر العملاء
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
        <td>$${totalPaid.toFixed(2)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// ============================
// 9. تحديث الرسوم البيانية (بما فيها المدفوعات)
// ============================
function updateCharts(ordersData) {
  const colors = ['#ff6600', '#0d6efd', '#28a745', '#8b5cf6', '#ffc107', '#dc3545'];

  // --- 9.1 توزيع الخدمات ---
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

  // --- 9.2 الطلبات الشهرية ---
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

  // --- 9.3 تحديث مخطط المدفوعات (يُستدعى أيضاً بشكل منفصل) ---
  updatePaymentsChart();
}

// ============================
// 9.3 تحديث مخطط المدفوعات الشهرية (منفصل)
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
// 10. دوال مساعدة
// ============================
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

console.log('✅ Dashboard ready with payments');
