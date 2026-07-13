import { onAuthStateChangedCallback, logoutUser } from './auth.js';
import { db } from './firebase-config.js';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  doc,
  getDoc
} from 'firebase/firestore';

// ============================
// متغيرات عامة
// ============================
let customers = [];
let orders = [];
let payments = [];
let services = [];
let employees = [];
let customersListener = null;
let ordersListener = null;
let paymentsListener = null;
let servicesListener = null;
let employeesListener = null;

let chartsInitialized = false;

// ============================
// 1. دوال مساعدة (Toast)
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
// 2. المصادقة والتهيئة
// ============================
onAuthStateChangedCallback((user) => {
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

  // بدء الاستماع للبيانات
  listenToData();
});

// ============================
// 3. تسجيل الخروج وتبديل الوضع
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

// تبديل Sidebar (للشاشات الصغيرة)
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
// 4. الاستماع للبيانات من Firestore
// ============================
function listenToData() {
  // العملاء
  const customersRef = collection(db, 'customers');
  const customersQuery = query(customersRef, orderBy('createdAt', 'desc'));
  if (customersListener) customersListener();
  customersListener = onSnapshot(customersQuery, (snapshot) => {
    customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateStats();
    updateRecentCustomers();
  }, (error) => {
    console.error('Error listening to customers:', error);
    showToast('حدث خطأ في تحميل العملاء', 'error');
  });

  // الطلبات
  const ordersRef = collection(db, 'orders');
  const ordersQuery = query(ordersRef, orderBy('createdAt', 'desc'));
  if (ordersListener) ordersListener();
  ordersListener = onSnapshot(ordersQuery, (snapshot) => {
    orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateStats();
    updateRecentOrders();
    updateCharts();
  }, (error) => {
    console.error('Error listening to orders:', error);
    showToast('حدث خطأ في تحميل الطلبات', 'error');
  });

  // المدفوعات
  const paymentsRef = collection(db, 'payments');
  const paymentsQuery = query(paymentsRef, orderBy('paymentDate', 'desc'));
  if (paymentsListener) paymentsListener();
  paymentsListener = onSnapshot(paymentsQuery, (snapshot) => {
    payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateStats();
  }, (error) => {
    console.error('Error listening to payments:', error);
    showToast('حدث خطأ في تحميل المدفوعات', 'error');
  });

  // الخدمات (للرسوم البيانية)
  const servicesRef = collection(db, 'services');
  if (servicesListener) servicesListener();
  servicesListener = onSnapshot(servicesRef, (snapshot) => {
    services = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateCharts();
  }, (error) => {
    console.error('Error listening to services:', error);
  });

  // الموظفين (للرسوم البيانية)
  const employeesRef = collection(db, 'employees');
  if (employeesListener) employeesListener();
  employeesListener = onSnapshot(employeesRef, (snapshot) => {
    employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateCharts();
  }, (error) => {
    console.error('Error listening to employees:', error);
  });
}

// ============================
// 5. تحديث الإحصائيات
// ============================
function updateStats() {
  const totalCustomers = customers.length;
  const totalOrders = orders.length;
  const activeOrders = orders.filter(o => o.status === 'قيد التنفيذ' || o.status === 'جديد').length;
  const completedOrders = orders.filter(o => o.status === 'مكتمل').length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  document.getElementById('statCustomers').textContent = totalCustomers;
  document.getElementById('statActiveOrders').textContent = activeOrders;
  document.getElementById('statRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
  document.getElementById('statCompleted').textContent = completedOrders;

  // يمكن إضافة المزيد من الإحصائيات
}

// ============================
// 6. عرض آخر العملاء
// ============================
function updateRecentCustomers() {
  const tbody = document.getElementById('recentCustomers');
  if (!tbody) return;
  const recent = customers.slice(0, 5);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">لا يوجد عملاء</td></tr>`;
    return;
  }
  let html = '';
  recent.forEach((c, i) => {
    // حساب إجمالي مدفوعات العميل من الطلبات المرتبطة به
    const customerOrders = orders.filter(o => o.customerId === c.id);
    const totalPaid = customerOrders.reduce((sum, o) => sum + (o.paid || 0), 0);
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
// 7. عرض آخر الطلبات
// ============================
function updateRecentOrders() {
  const tbody = document.getElementById('recentOrders');
  if (!tbody) return;
  const recent = orders.slice(0, 5);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا يوجد طلبات</td></tr>`;
    return;
  }
  let html = '';
  recent.forEach((o) => {
    const customer = customers.find(c => c.id === o.customerId);
    const customerName = customer ? customer.name : 'غير معروف';
    const statusBadge = {
      'جديد': 'badge bg-info text-dark',
      'قيد التنفيذ': 'badge bg-warning text-dark',
      'مكتمل': 'badge bg-success',
      'ملغي': 'badge bg-danger'
    }[o.status] || 'badge bg-secondary';
    html += `
      <tr>
        <td><strong>#${o.orderNumber || 'N/A'}</strong></td>
        <td>${escapeHtml(customerName)}</td>
        <td><span class="${statusBadge}">${escapeHtml(o.status || 'جديد')}</span></td>
        <td>$${(o.total || 0).toFixed(2)}</td>
        <td>${formatDate(o.createdAt)}</td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// ============================
// 8. تحديث الرسوم البيانية
// ============================
function updateCharts() {
  if (typeof Chart === 'undefined') return;

  // --- مخطط توزيع الخدمات (دائري) ---
  const serviceCounts = {};
  orders.forEach(o => {
    if (o.serviceId) {
      serviceCounts[o.serviceId] = (serviceCounts[o.serviceId] || 0) + 1;
    }
  });
  const serviceLabels = [];
  const serviceData = [];
  Object.entries(serviceCounts).forEach(([id, count]) => {
    const service = services.find(s => s.id === id);
    const name = service ? service.name : 'غير معروف';
    serviceLabels.push(name);
    serviceData.push(count);
  });

  // إذا لم توجد بيانات، نعرض رسالة افتراضية
  if (serviceLabels.length === 0) {
    serviceLabels.push('لا توجد خدمات');
    serviceData.push(1);
  }

  const ctx1 = document.getElementById('servicesChart');
  if (ctx1) {
    if (window.servicesChartInstance) window.servicesChartInstance.destroy();
    window.servicesChartInstance = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: serviceLabels,
        datasets: [{
          data: serviceData,
          backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
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

  // --- مخطط الطلبات الشهرية (شريطي) ---
  const monthlyOrders = {};
  orders.forEach(o => {
    if (o.createdAt) {
      const date = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
      monthlyOrders[key] = (monthlyOrders[key] || 0) + 1;
    }
  });
  const sortedMonths = Object.keys(monthlyOrders).sort();
  const orderCounts = sortedMonths.map(m => monthlyOrders[m]);

  const ctx2 = document.getElementById('ordersChart');
  if (ctx2) {
    if (window.ordersChartInstance) window.ordersChartInstance.destroy();
    window.ordersChartInstance = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: sortedMonths.length > 0 ? sortedMonths : ['لا توجد بيانات'],
        datasets: [{
          label: 'الطلبات',
          data: sortedMonths.length > 0 ? orderCounts : [0],
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
// 9. دوال مساعدة إضافية
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

console.log('✅ Dashboard ready with real data');
