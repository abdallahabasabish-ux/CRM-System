import { onAuthStateChangedCallback, logoutUser } from './auth.js';
import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';

// ============================
// متغيرات عامة
// ============================
let customersCount = 0;
let ordersCount = 0;
let activeOrdersCount = 0;
let completedOrdersCount = 0;
let totalRevenue = 0;
let totalPayments = 0;
let recentCustomers = [];
let chartInstances = {};

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
    sidebarAvatar.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
  }

  // تحميل البيانات
  await loadDashboardData();
  listenToRealtimeUpdates();
});

// ============================
// 2. تسجيل الخروج وتبديل الوضع
// ============================
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await logoutUser();
  window.location.href = 'login.html';
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
// 3. تحميل البيانات (قراءة لمرة واحدة)
// ============================
async function loadDashboardData() {
  try {
    // عدد العملاء
    const customersSnap = await getDocs(collection(db, 'customers'));
    customersCount = customersSnap.size;

    // الطلبات
    const ordersSnap = await getDocs(collection(db, 'orders'));
    ordersCount = ordersSnap.size;
    activeOrdersCount = ordersSnap.docs.filter(doc => doc.data().status === 'قيد التنفيذ').length;
    completedOrdersCount = ordersSnap.docs.filter(doc => doc.data().status === 'مكتمل').length;

    // الإيرادات (مجموع total)
    totalRevenue = ordersSnap.docs.reduce((sum, doc) => sum + (doc.data().total || 0), 0);

    // المدفوعات
    const paymentsSnap = await getDocs(collection(db, 'payments'));
    totalPayments = paymentsSnap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);

    // آخر 5 عملاء
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(5));
    const recentSnap = await getDocs(q);
    recentCustomers = recentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // تحديث واجهة المستخدم
    updateStats();
    updateRecentCustomers();
    updateCharts(ordersSnap.docs.map(doc => doc.data()));

  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showToast('حدث خطأ في تحميل البيانات', 'error');
  }
}

// ============================
// 4. الاستماع للتحديثات الفورية (Realtime)
// ============================
function listenToRealtimeUpdates() {
  // استماع للعملاء
  onSnapshot(collection(db, 'customers'), (snapshot) => {
    customersCount = snapshot.size;
    updateStats();
  });

  // استماع للطلبات
  onSnapshot(collection(db, 'orders'), (snapshot) => {
    ordersCount = snapshot.size;
    activeOrdersCount = snapshot.docs.filter(doc => doc.data().status === 'قيد التنفيذ').length;
    completedOrdersCount = snapshot.docs.filter(doc => doc.data().status === 'مكتمل').length;
    totalRevenue = snapshot.docs.reduce((sum, doc) => sum + (doc.data().total || 0), 0);
    updateStats();
    updateCharts(snapshot.docs.map(doc => doc.data()));
  });

  // استماع للمدفوعات
  onSnapshot(collection(db, 'payments'), (snapshot) => {
    totalPayments = snapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
    updateStats();
  });
}

// ============================
// 5. تحديث البطاقات الإحصائية
// ============================
function updateStats() {
  document.getElementById('statCustomers').textContent = customersCount;
  document.getElementById('statActiveOrders').textContent = activeOrdersCount;
  document.getElementById('statRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
  document.getElementById('statCompleted').textContent = completedOrdersCount;
}

// ============================
// 6. تحديث جدول آخر العملاء
// ============================
function updateRecentCustomers() {
  const tbody = document.getElementById('recentCustomers');
  if (!tbody) return;
  if (recentCustomers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">لا يوجد عملاء</td></tr>';
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

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================
// 7. تحديث الرسوم البيانية
// ============================
function updateCharts(ordersData) {
  // توزيع الخدمات (من الطلبات)
  const serviceCount = {};
  ordersData.forEach(order => {
    const serviceId = order.serviceId;
    if (serviceId) {
      serviceCount[serviceId] = (serviceCount[serviceId] || 0) + 1;
    }
  });
  const serviceLabels = Object.keys(serviceCount);
  const serviceValues = Object.values(serviceCount);
  const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const ctx1 = document.getElementById('servicesChart');
  if (ctx1) {
    if (chartInstances.services) chartInstances.services.destroy();
    chartInstances.services = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: serviceLabels.length ? serviceLabels : ['لا توجد طلبات'],
        datasets: [{
          data: serviceLabels.length ? serviceValues : [1],
          backgroundColor: colors.slice(0, serviceLabels.length || 1),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        cutout: '65%',
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // الطلبات الشهرية (آخر 6 أشهر)
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

  const labels = Object.keys(monthlyOrders);
  const values = Object.values(monthlyOrders);

  const ctx2 = document.getElementById('ordersChart');
  if (ctx2) {
    if (chartInstances.orders) chartInstances.orders.destroy();
    chartInstances.orders = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: labels.map(l => l.split('-')[1] + '/' + l.split('-')[0]),
        datasets: [{
          label: 'الطلبات',
          data: values,
          backgroundColor: 'rgba(79, 70, 229, 0.7)',
          borderRadius: 6
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
}

// ============================
// 8. دالة Toast (إذا لم تكن موجودة)
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

console.log('✅ Dashboard ready with real data');
