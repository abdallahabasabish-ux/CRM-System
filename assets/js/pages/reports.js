import { onAuthStateChangedCallback, logoutUser } from '../auth.js';
import { db } from '../firebase-config.js';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';

// ============================
// متغيرات عامة
// ============================
let allOrders = [];
let allCustomers = [];
let allEmployees = [];
let allPayments = [];
let allServices = [];
let currentFilter = '7'; // الفترة الافتراضية
let chartInstances = {};

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
  
  loadAllData();
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
// 3. تحميل جميع البيانات
// ============================
async function loadAllData() {
  try {
    showToast('جاري تحميل البيانات...', 'info');

    // تحميل العملاء
    const customersSnap = await getDocs(collection(db, 'customers'));
    allCustomers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // تحميل الخدمات
    const servicesSnap = await getDocs(collection(db, 'services'));
    allServices = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // تحميل الموظفين
    const employeesSnap = await getDocs(collection(db, 'employees'));
    allEmployees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // تحميل الطلبات
    const ordersSnap = await getDocs(collection(db, 'orders'));
    allOrders = ordersSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt || null
      };
    });

    // تحميل المدفوعات
    const paymentsSnap = await getDocs(collection(db, 'payments'));
    allPayments = paymentsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        paymentDate: data.paymentDate?.toDate?.() || data.paymentDate || null
      };
    });

    // تحديث جميع التقارير والرسوم البيانية
    updateAllReports();

    showToast('تم تحميل البيانات بنجاح', 'success');
  } catch (error) {
    console.error('Error loading data:', error);
    showToast('حدث خطأ في تحميل البيانات', 'error');
  }
}

// ============================
// 4. فلترة البيانات حسب الفترة الزمنية
// ============================
function filterDataByDate(data, dateField = 'createdAt') {
  if (currentFilter === 'all') return data;
  const now = new Date();
  let fromDate = new Date();
  if (currentFilter === '7') fromDate.setDate(now.getDate() - 7);
  else if (currentFilter === '30') fromDate.setDate(now.getDate() - 30);
  else if (currentFilter === '90') fromDate.setMonth(now.getMonth() - 3);
  else if (currentFilter === '365') fromDate.setFullYear(now.getFullYear() - 1);
  else if (currentFilter === 'custom') {
    const from = document.getElementById('dateFrom').value;
    const to = document.getElementById('dateTo').value;
    if (!from || !to) return data;
    const fromDateCustom = new Date(from + 'T00:00:00');
    const toDateCustom = new Date(to + 'T23:59:59');
    return data.filter(item => {
      const date = item[dateField];
      if (!date) return false;
      const d = date instanceof Date ? date : new Date(date);
      return d >= fromDateCustom && d <= toDateCustom;
    });
  }
  return data.filter(item => {
    const date = item[dateField];
    if (!date) return false;
    const d = date instanceof Date ? date : new Date(date);
    return d >= fromDate;
  });
}

// ============================
// 5. تحديث جميع التقارير
// ============================
function updateAllReports() {
  // تحديد الفترة المطبقة
  const filteredOrders = filterDataByDate(allOrders, 'createdAt');
  const filteredPayments = filterDataByDate(allPayments, 'paymentDate');

  // تحديث البطاقات الإحصائية
  updateStatsCards(filteredOrders, filteredPayments);

  // تحديث الرسوم البيانية
  updateCharts(filteredOrders, filteredPayments);

  // تحديث الجداول
  updateOrdersReport(filteredOrders);
  updateCustomersReport();
  updateEmployeesReport();
  updatePaymentsReport(filteredPayments);
}

// ============================
// 6. تحديث البطاقات الإحصائية
// ============================
function updateStatsCards(orders, payments) {
  const totalCustomers = allCustomers.length;
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  document.getElementById('statCustomers').textContent = totalCustomers;
  document.getElementById('statOrders').textContent = totalOrders;
  document.getElementById('statRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
  document.getElementById('statPayments').textContent = `$${totalPayments.toFixed(2)}`;
}

// ============================
// 7. تحديث الرسوم البيانية
// ============================
function updateCharts(orders, payments) {
  // تدمير الرسوم السابقة
  Object.values(chartInstances).forEach(chart => chart.destroy());
  chartInstances = {};

  // 7.1 توزيع الطلبات حسب الحالة (دائري)
  const statusCounts = {};
  orders.forEach(o => {
    statusCounts[o.status || 'غير معروف'] = (statusCounts[o.status || 'غير معروف'] || 0) + 1;
  });
  const statusLabels = Object.keys(statusCounts);
  const statusData = Object.values(statusCounts);
  const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const ctx1 = document.getElementById('ordersStatusChart').getContext('2d');
  chartInstances.status = new Chart(ctx1, {
    type: 'doughnut',
    data: {
      labels: statusLabels,
      datasets: [{
        data: statusData,
        backgroundColor: colors.slice(0, statusLabels.length),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // 7.2 الإيرادات الشهرية (شريطي)
  const monthlyRevenue = {};
  orders.forEach(o => {
    if (o.createdAt) {
      const date = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
      monthlyRevenue[key] = (monthlyRevenue[key] || 0) + (o.total || 0);
    }
  });
  const sortedMonths = Object.keys(monthlyRevenue).sort();
  const revenueData = sortedMonths.map(m => monthlyRevenue[m]);

  const ctx2 = document.getElementById('monthlyRevenueChart').getContext('2d');
  chartInstances.revenue = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: sortedMonths,
      datasets: [{
        label: 'الإيرادات ($)',
        data: revenueData,
        backgroundColor: 'rgba(79, 70, 229, 0.7)',
        borderRadius: 6,
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

  // 7.3 الخدمات الأكثر طلبًا (دائري)
  const serviceCounts = {};
  orders.forEach(o => {
    const service = allServices.find(s => s.id === o.serviceId);
    const serviceName = service ? service.name : 'غير معروف';
    serviceCounts[serviceName] = (serviceCounts[serviceName] || 0) + 1;
  });
  const sortedServices = Object.entries(serviceCounts).sort((a,b) => b[1] - a[1]).slice(0, 6);
  const serviceLabels = sortedServices.map(s => s[0]);
  const serviceData = sortedServices.map(s => s[1]);

  const ctx3 = document.getElementById('topServicesChart').getContext('2d');
  chartInstances.services = new Chart(ctx3, {
    type: 'pie',
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
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // 7.4 أداء الموظفين (شريطي)
  const employeeOrders = {};
  orders.forEach(o => {
    if (o.employeeId) {
      employeeOrders[o.employeeId] = (employeeOrders[o.employeeId] || 0) + 1;
    }
  });
  const employeeNames = allEmployees.map(e => e.name);
  const employeeDataBar = allEmployees.map(e => employeeOrders[e.id] || 0);
  const topEmployees = employeeDataBar.map((count, index) => ({ name: employeeNames[index], count }))
    .sort((a,b) => b.count - a.count)
    .slice(0, 8);

  const ctx4 = document.getElementById('employeePerformanceChart').getContext('2d');
  chartInstances.employees = new Chart(ctx4, {
    type: 'bar',
    data: {
      labels: topEmployees.map(e => e.name),
      datasets: [{
        label: 'عدد الطلبات',
        data: topEmployees.map(e => e.count),
        backgroundColor: 'rgba(16, 185, 129, 0.7)',
        borderRadius: 6,
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

// ============================
// 8. تحديث تقرير الطلبات
// ============================
function updateOrdersReport(orders) {
  const tbody = document.getElementById('ordersReportBody');
  if (!orders || orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">لا توجد طلبات</td></tr>`;
    return;
  }
  let html = '';
  orders.slice(0, 50).forEach(o => {
    const customer = allCustomers.find(c => c.id === o.customerId);
    const service = allServices.find(s => s.id === o.serviceId);
    const total = o.total || 0;
    const paid = o.paid || 0;
    const remaining = total - paid;
    html += `<tr>
      <td><strong>#${o.orderNumber || 'N/A'}</strong></td>
      <td>${customer ? escapeHtml(customer.name) : 'غير معروف'}</td>
      <td>${service ? escapeHtml(service.name) : 'غير معروف'}</td>
      <td><span class="badge bg-${o.status === 'مكتمل' ? 'success' : o.status === 'ملغي' ? 'danger' : 'warning'}">${escapeHtml(o.status || 'جديد')}</span></td>
      <td>$${total.toFixed(2)}</td>
      <td>$${paid.toFixed(2)}</td>
      <td>$${remaining.toFixed(2)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ============================
// 9. تحديث تقرير العملاء
// ============================
function updateCustomersReport() {
  const tbody = document.getElementById('customersReportBody');
  if (allCustomers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا يوجد عملاء</td></tr>`;
    return;
  }
  let html = '';
  allCustomers.forEach(c => {
    const customerOrders = allOrders.filter(o => o.customerId === c.id);
    const totalPaid = customerOrders.reduce((sum, o) => sum + (o.paid || 0), 0);
    const totalBalance = customerOrders.reduce((sum, o) => sum + ((o.total || 0) - (o.paid || 0)), 0);
    html += `<tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.phone || '')}</td>
      <td>${customerOrders.length}</td>
      <td>$${totalPaid.toFixed(2)}</td>
      <td>$${totalBalance.toFixed(2)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ============================
// 10. تحديث تقرير الموظفين
// ============================
function updateEmployeesReport() {
  const tbody = document.getElementById('employeesReportBody');
  if (allEmployees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا يوجد موظفين</td></tr>`;
    return;
  }
  let html = '';
  allEmployees.forEach(e => {
    const employeeOrders = allOrders.filter(o => o.employeeId === e.id);
    const completed = employeeOrders.filter(o => o.status === 'مكتمل').length;
    const completionRate = employeeOrders.length > 0 ? Math.round((completed / employeeOrders.length) * 100) : 0;
    const totalCommission = employeeOrders.reduce((sum, o) => sum + ((o.total || 0) * (e.commission || 0) / 100), 0);
    html += `<tr>
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.position || '')}</td>
      <td>${employeeOrders.length}</td>
      <td>${completionRate}%</td>
      <td>$${totalCommission.toFixed(2)}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ============================
// 11. تحديث تقرير المدفوعات
// ============================
function updatePaymentsReport(payments) {
  const tbody = document.getElementById('paymentsReportBody');
  if (!payments || payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">لا توجد مدفوعات</td></tr>`;
    return;
  }
  let html = '';
  payments.slice(0, 50).forEach(p => {
    const order = allOrders.find(o => o.id === p.orderId);
    html += `<tr>
      <td>#${order?.orderNumber || 'N/A'}</td>
      <td>$${(p.amount || 0).toFixed(2)}</td>
      <td>${escapeHtml(p.method || '')}</td>
      <td>${p.paymentDate ? formatDate(p.paymentDate) : '-'}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

// ============================
// 12. دوال مساعدة
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
  if (date instanceof Date) return date.toISOString().slice(0,10);
  return '';
}

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
// 13. أحداث الفلاتر
// ============================
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentFilter = this.dataset.filter;
    if (currentFilter === 'custom') {
      // تجاهل، سيتم استخدام الأزرار المخصصة
    }
    updateAllReports();
  });
});

document.getElementById('applyCustomDate').addEventListener('click', () => {
  const from = document.getElementById('dateFrom').value;
  const to = document.getElementById('dateTo').value;
  if (!from || !to) {
    showToast('الرجاء تحديد تاريخ البداية والنهاية', 'warning');
    return;
  }
  currentFilter = 'custom';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  updateAllReports();
});

// ============================
// 14. تصدير Excel
// ============================
document.getElementById('exportExcelBtn').addEventListener('click', () => {
  const activeTab = document.querySelector('#reportTabs .nav-link.active');
  const tabId = activeTab?.getAttribute('data-bs-target')?.replace('#', '');
  const table = document.querySelector(`#${tabId} table`);
  if (!table) {
    showToast('لا يوجد جدول لتصديره', 'warning');
    return;
  }
  const ws = XLSX.utils.table_to_sheet(table);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `تقرير_${tabId}_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('تم تصدير التقرير إلى Excel بنجاح', 'success');
});

// ============================
// 15. تصدير PDF
// ============================
document.getElementById('exportPdfBtn').addEventListener('click', async () => {
  const activeTab = document.querySelector('#reportTabs .nav-link.active');
  const tabId = activeTab?.getAttribute('data-bs-target')?.replace('#', '');
  const tableContainer = document.getElementById(tabId);
  if (!tableContainer) {
    showToast('لا يوجد جدول لتصديره', 'warning');
    return;
  }
  try {
    const canvas = await html2canvas(tableContainer, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true
    });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`تقرير_${tabId}_${new Date().toISOString().slice(0,10)}.pdf`);
    showToast('تم تصدير التقرير إلى PDF بنجاح', 'success');
  } catch (error) {
    console.error('Error exporting PDF:', error);
    showToast('حدث خطأ أثناء تصدير PDF', 'error');
  }
});

// ============================
// 16. طباعة التقرير
// ============================
document.getElementById('printBtn').addEventListener('click', () => {
  window.print();
});

console.log('✅ صفحة التقارير جاهزة');
