// =============================================================
// reports.js - الإصدار الاحترافي النهائي
// يدعم: جميع التقارير (الطلبات، العملاء، الموظفين، المدفوعات، الخزينة)
// مع تصميم متقدم، فلاتر زمنية، تصدير، ورسوم بيانية تفاعلية
// =============================================================

import { onAuthStateChangedCallback, logoutUser } from '../auth.js';
import { db } from '../firebase-config.js';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  Timestamp
} from 'firebase/firestore';

// =============================================================
// 1.  المتغيرات العامة وإدارة الحالة
// =============================================================
const state = {
  orders: [],
  customers: [],
  employees: [],
  payments: [],
  services: [],
  treasury: [],
  currentFilter: '30',
  dateFrom: null,
  dateTo: null,
  charts: {},
  filtered: {
    orders: [],
    payments: [],
    treasury: []
  }
};

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
// 3.  تحميل البيانات الأساسية (مع الخزينة)
// =============================================================
async function fetchAllData() {
  try {
    showToast('جاري تحميل البيانات...', 'info');

    const [ordersSnap, customersSnap, employeesSnap, paymentsSnap, servicesSnap, treasurySnap] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'employees')),
      getDocs(collection(db, 'payments')),
      getDocs(collection(db, 'services')),
      getDocs(collection(db, 'treasury'))
    ]);

    state.orders = ordersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt || null
    }));

    state.customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    state.employees = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    state.services = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    state.payments = paymentsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      paymentDate: doc.data().paymentDate?.toDate?.() || doc.data().paymentDate || null
    }));

    state.treasury = treasurySnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt || null
    }));

    showToast('تم تحميل البيانات بنجاح', 'success');
    return true;
  } catch (error) {
    console.error('Error fetching data:', error);
    showToast('حدث خطأ في تحميل البيانات', 'error');
    return false;
  }
}

// =============================================================
// 4.  منطق الفلترة الزمنية (مشترك)
// =============================================================
function getDateRange() {
  const now = new Date();
  let fromDate = new Date(now);
  let toDate = new Date(now);
  toDate.setHours(23, 59, 59, 999);

  switch (state.currentFilter) {
    case '7': fromDate.setDate(now.getDate() - 7); break;
    case '30': fromDate.setDate(now.getDate() - 30); break;
    case '90': fromDate.setMonth(now.getMonth() - 3); break;
    case '365': fromDate.setFullYear(now.getFullYear() - 1); break;
    case 'custom':
      if (state.dateFrom && state.dateTo) {
        fromDate = new Date(state.dateFrom + 'T00:00:00');
        toDate = new Date(state.dateTo + 'T23:59:59');
      } else return null;
      break;
    case 'all':
    default: return null;
  }
  return { fromDate, toDate };
}

function filterDataByDate(data, dateField = 'createdAt') {
  const range = getDateRange();
  if (!range) return data;
  const { fromDate, toDate } = range;
  return data.filter(item => {
    let date = item[dateField];
    if (!date) return false;
    if (date instanceof Date) date = date;
    else if (typeof date === 'string') date = new Date(date);
    else return false;
    return date >= fromDate && date <= toDate;
  });
}

function applyAllFilters() {
  state.filtered.orders = filterDataByDate(state.orders, 'createdAt');
  state.filtered.payments = filterDataByDate(state.payments, 'paymentDate');
  state.filtered.treasury = filterDataByDate(state.treasury, 'createdAt');
  updateUI();
}

// =============================================================
// 5.  تحديث واجهة المستخدم (UI)
// =============================================================
function updateUI() {
  const { orders, payments, treasury } = state.filtered;
  updateStatsCards(orders, payments, treasury);
  destroyCharts();
  createCharts(orders, payments, treasury);
  updateOrdersReport(orders);
  updateCustomersReport();
  updateEmployeesReport();
  updatePaymentsReport(payments);
  updateTreasuryReport(treasury);
  updateTreasuryMiniStats(treasury);
}

// =============================================================
// 6.  بطاقات الإحصائيات الرئيسية
// =============================================================
function updateStatsCards(orders, payments, treasury) {
  const totalCustomers = state.customers.length;
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  document.getElementById('statCustomers').textContent = totalCustomers;
  document.getElementById('statOrders').textContent = totalOrders;
  document.getElementById('statRevenue').textContent = formatCurrency(totalRevenue);
  document.getElementById('statPayments').textContent = formatCurrency(totalPayments);
}

// =============================================================
// 7.  إحصائيات الخزينة المصغرة (Mini Stats)
// =============================================================
function updateTreasuryMiniStats(treasuryData) {
  const deposits = treasuryData.filter(t => t.type === 'deposit').reduce((s, t) => s + (t.amount || 0), 0);
  const withdrawals = treasuryData.filter(t => t.type === 'withdraw').reduce((s, t) => s + (t.amount || 0), 0);
  const transfers = treasuryData.filter(t => t.type === 'transfer').reduce((s, t) => s + (t.amount || 0), 0);
  const balance = deposits - withdrawals + transfers;

  const miniDeposits = document.getElementById('miniTotalDeposits');
  const miniWithdrawals = document.getElementById('miniTotalWithdrawals');
  const miniTransfers = document.getElementById('miniTotalTransfers');
  const miniTxCount = document.getElementById('miniTxCount');
  const headerBalance = document.getElementById('treasuryHeaderBalance');

  if (miniDeposits) miniDeposits.textContent = formatCurrency(deposits);
  if (miniWithdrawals) miniWithdrawals.textContent = formatCurrency(withdrawals);
  if (miniTransfers) miniTransfers.textContent = formatCurrency(transfers);
  if (miniTxCount) miniTxCount.textContent = treasuryData.length;
  if (headerBalance) headerBalance.innerHTML = `<small>الرصيد الحالي</small> ${formatCurrency(balance)}`;
}

// =============================================================
// 8.  الرسوم البيانية (مع دعم RTL)
// =============================================================
function destroyCharts() {
  Object.values(state.charts).forEach(chart => chart?.destroy());
  state.charts = {};
}

function createCharts(orders, payments, treasury) {
  Chart.defaults.font.family = 'Almarai, sans-serif';
  const colors = ['#ff6600', '#0d6efd', '#28a745', '#8b5cf6', '#ffc107', '#dc3545'];

  // 8.1 توزيع الطلبات حسب الحالة (دائري)
  const statusMap = {};
  orders.forEach(o => { statusMap[o.status || 'غير معروف'] = (statusMap[o.status || 'غير معروف'] || 0) + 1; });
  const statusLabels = Object.keys(statusMap);
  const statusData = Object.values(statusMap);
  const ctx1 = document.getElementById('ordersStatusChart');
  if (ctx1) {
    state.charts.status = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: statusLabels,
        datasets: [{
          data: statusData.length ? statusData : [1],
          backgroundColor: statusData.length ? colors.slice(0, statusLabels.length) : ['#e5e7eb'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } } }
      }
    });
  }

  // 8.2 الإيرادات الشهرية (شريطي)
  const monthlyRevenue = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthlyRevenue[key] = 0;
  }
  orders.forEach(o => {
    if (o.createdAt) {
      const d = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (monthlyRevenue[key] !== undefined) monthlyRevenue[key] += o.total || 0;
    }
  });
  const revenueLabels = Object.keys(monthlyRevenue);
  const revenueData = Object.values(monthlyRevenue);
  const ctx2 = document.getElementById('monthlyRevenueChart');
  if (ctx2) {
    state.charts.revenue = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: revenueLabels.map(l => l.split('-')[1] + '/' + l.split('-')[0]),
        datasets: [{
          label: 'الإيرادات ($)',
          data: revenueData,
          backgroundColor: 'rgba(255,102,0,0.7)',
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

  // 8.3 الخدمات الأكثر طلباً (دائري)
  const serviceCount = {};
  orders.forEach(o => {
    const svc = state.services.find(s => s.id === o.serviceId);
    const name = svc ? svc.name : 'غير معروف';
    serviceCount[name] = (serviceCount[name] || 0) + 1;
  });
  const sorted = Object.entries(serviceCount).sort((a,b) => b[1]-a[1]).slice(0,6);
  const svcLabels = sorted.map(s => s[0]);
  const svcData = sorted.map(s => s[1]);
  const ctx3 = document.getElementById('topServicesChart');
  if (ctx3) {
    state.charts.services = new Chart(ctx3, {
      type: 'pie',
      data: {
        labels: svcLabels.length ? svcLabels : ['لا توجد طلبات'],
        datasets: [{
          data: svcLabels.length ? svcData : [1],
          backgroundColor: ['#ff6600','#0d6efd','#28a745','#8b5cf6','#ffc107','#dc3545'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } } }
      }
    });
  }

  // 8.4 أداء الموظفين (شريطي)
  const empOrders = {};
  orders.forEach(o => { if (o.employeeId) empOrders[o.employeeId] = (empOrders[o.employeeId] || 0) + 1; });
  const empData = state.employees.map(e => ({ name: e.name || 'غير معروف', count: empOrders[e.id] || 0 }))
    .sort((a,b) => b.count - a.count).slice(0,8);
  const ctx4 = document.getElementById('employeePerformanceChart');
  if (ctx4) {
    state.charts.employees = new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: empData.map(e => e.name),
        datasets: [{
          label: 'عدد الطلبات',
          data: empData.map(e => e.count),
          backgroundColor: 'rgba(13,110,253,0.7)',
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
}

// =============================================================
// 9.  التقارير الجدولية (جميع الأقسام)
// =============================================================

// 9.1 تقرير الطلبات
function updateOrdersReport(orders) {
  const tbody = document.getElementById('ordersReportBody');
  if (!tbody) return;
  const data = orders.slice(0, 100);
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">لا توجد طلبات</td></tr>`;
    return;
  }
  let html = '', totalSum=0, paidSum=0, remainingSum=0;
  data.forEach(o => {
    const customer = state.customers.find(c => c.id === o.customerId);
    const service = state.services.find(s => s.id === o.serviceId);
    const total = o.total || 0;
    const paid = o.paid || 0;
    const remaining = total - paid;
    totalSum += total; paidSum += paid; remainingSum += remaining;
    html += `<tr>
      <td><strong>#${o.orderNumber || 'N/A'}</strong></td>
      <td>${customer ? escapeHtml(customer.name) : 'غير معروف'}</td>
      <td>${service ? escapeHtml(service.name) : 'غير معروف'}</td>
      <td><span class="badge-status badge bg-${o.status === 'مكتمل' ? 'success' : o.status === 'ملغي' ? 'danger' : 'warning'}">${escapeHtml(o.status || 'جديد')}</span></td>
      <td>${formatCurrency(total)}</td>
      <td>${formatCurrency(paid)}</td>
      <td>${formatCurrency(remaining)}</td>
    </tr>`;
  });
  html += `<tr class="report-total-row"><td colspan="4" style="text-align:center;">الإجمالي</td><td>${formatCurrency(totalSum)}</td><td>${formatCurrency(paidSum)}</td><td>${formatCurrency(remainingSum)}</td></tr>`;
  tbody.innerHTML = html;
}

// 9.2 تقرير العملاء (محسوب ديناميكياً)
function updateCustomersReport() {
  const tbody = document.getElementById('customersReportBody');
  if (!tbody) return;
  if (state.customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا يوجد عملاء</td></tr>`;
    return;
  }
  let html = '', totalPaidSum=0, totalBalanceSum=0;
  state.customers.forEach(c => {
    const ordersCount = state.orders.filter(o => o.customerId === c.id).length;
    const totalOrdersValue = state.orders.filter(o => o.customerId === c.id).reduce((s,o) => s + (o.total || 0), 0);
    const totalPaid = state.payments.filter(p => p.customerId === c.id).reduce((s,p) => s + (p.amount || 0), 0);
    const balance = totalOrdersValue - totalPaid;
    totalPaidSum += totalPaid;
    totalBalanceSum += balance;
    html += `<tr>
      <td>${escapeHtml(c.name || '')}</td>
      <td>${escapeHtml(c.phone || '')}</td>
      <td>${ordersCount}</td>
      <td>${formatCurrency(totalPaid)}</td>
      <td>${formatCurrency(balance)}</td>
    </tr>`;
  });
  html += `<tr class="report-total-row"><td colspan="3" style="text-align:center;">الإجمالي</td><td>${formatCurrency(totalPaidSum)}</td><td>${formatCurrency(totalBalanceSum)}</td></tr>`;
  tbody.innerHTML = html;
}

// 9.3 تقرير الموظفين
function updateEmployeesReport() {
  const tbody = document.getElementById('employeesReportBody');
  if (!tbody) return;
  if (state.employees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا يوجد موظفين</td></tr>`;
    return;
  }
  let html = '', totalCommissionSum = 0;
  state.employees.forEach(e => {
    const empOrders = state.orders.filter(o => o.employeeId === e.id);
    const completed = empOrders.filter(o => o.status === 'مكتمل').length;
    const rate = empOrders.length > 0 ? Math.round((completed / empOrders.length) * 100) : 0;
    const commission = empOrders.reduce((s,o) => s + ((o.total || 0) * (e.commission || 0) / 100), 0);
    totalCommissionSum += commission;
    html += `<tr>
      <td>${escapeHtml(e.name || '')}</td>
      <td>${escapeHtml(e.position || '')}</td>
      <td>${empOrders.length}</td>
      <td>${rate}%</td>
      <td>${formatCurrency(commission)}</td>
    </tr>`;
  });
  html += `<tr class="report-total-row"><td colspan="4" style="text-align:center;">الإجمالي</td><td>${formatCurrency(totalCommissionSum)}</td></tr>`;
  tbody.innerHTML = html;
}

// 9.4 تقرير المدفوعات
function updatePaymentsReport(payments) {
  const tbody = document.getElementById('paymentsReportBody');
  if (!tbody) return;
  const data = payments.slice(0,100);
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">لا توجد مدفوعات</td></tr>`;
    return;
  }
  let html = '', amountSum=0;
  data.forEach(p => {
    const customer = state.customers.find(c => c.id === p.customerId);
    const customerName = customer ? customer.name : (p.customerName || 'غير معروف');
    amountSum += p.amount || 0;
    html += `<tr>
      <td>${escapeHtml(customerName)}</td>
      <td>${formatCurrency(p.amount || 0)}</td>
      <td>${escapeHtml(p.method || '')}</td>
      <td>${formatDate(p.paymentDate)}</td>
    </tr>`;
  });
  html += `<tr class="report-total-row"><td style="text-align:center;">الإجمالي</td><td>${formatCurrency(amountSum)}</td><td colspan="2"></td></tr>`;
  tbody.innerHTML = html;
}

// 9.5 تقرير الخزينة (مع تصميم مميز)
function updateTreasuryReport(treasuryData) {
  const tbody = document.getElementById('treasuryReportBody');
  if (!tbody) return;
  const data = treasuryData.slice(0, 100);
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا توجد معاملات خزينة</td></tr>`;
    return;
  }
  let html = '';
  let totalDeposits = 0, totalWithdrawals = 0, totalTransfers = 0;

  data.forEach(tx => {
    const typeMap = { deposit: 'إيداع', withdraw: 'سحب', transfer: 'تحويل' };
    const typeLabel = typeMap[tx.type] || tx.type;
    const amount = tx.amount || 0;
    const sign = tx.type === 'withdraw' ? '-' : '+';
    const rowClass = tx.type === 'withdraw' ? 'tx-withdraw-row' : tx.type === 'deposit' ? 'tx-deposit-row' : 'tx-transfer-row';

    if (tx.type === 'deposit') totalDeposits += amount;
    else if (tx.type === 'withdraw') totalWithdrawals += amount;
    else if (tx.type === 'transfer') totalTransfers += amount;

    let badgeClass = 'badge bg-success';
    if (tx.type === 'withdraw') badgeClass = 'badge bg-danger';
    else if (tx.type === 'transfer') badgeClass = 'badge bg-warning text-dark';

    html += `
      <tr class="${rowClass}">
        <td>${formatDate(tx.createdAt)}</td>
        <td><span class="${badgeClass}" style="font-weight:600;">${typeLabel}</span></td>
        <td class="tx-amount">${sign}${formatCurrency(amount)}</td>
        <td>${escapeHtml(tx.source || tx.target || '-')}</td>
        <td>${escapeHtml(tx.note || '')}</td>
      </tr>
    `;
  });

  const balance = totalDeposits - totalWithdrawals + totalTransfers;
  html += `
    <tr class="report-total-row" style="background: var(--color-primary); color: #fff;">
      <td colspan="2" style="text-align:center; font-weight:700;">الإجمالي</td>
      <td style="font-weight:700;">الإيداعات: ${formatCurrency(totalDeposits)}</td>
      <td style="font-weight:700;">السحوبات: ${formatCurrency(totalWithdrawals)}</td>
      <td style="font-weight:700;">الرصيد: ${formatCurrency(balance)}</td>
    </tr>
  `;
  tbody.innerHTML = html;
}

// =============================================================
// 10.  وظائف التصدير (Excel, PDF, طباعة)
// =============================================================
function getActiveTable() {
  const activeTab = document.querySelector('#reportTabs .nav-link.active');
  if (!activeTab) return null;
  const tabId = activeTab.getAttribute('data-bs-target')?.replace('#', '');
  return document.getElementById(tabId);
}

function exportToExcel() {
  const tableContainer = getActiveTable();
  if (!tableContainer) { showToast('لا يوجد جدول لتصديره', 'warning'); return; }
  const table = tableContainer.querySelector('table');
  if (!table) { showToast('الجدول غير موجود', 'warning'); return; }
  try {
    const wb = XLSX.utils.table_to_book(table, { sheet: 'تقرير', raw: true });
    XLSX.writeFile(wb, `تقرير_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('تم تصدير التقرير إلى Excel', 'success');
  } catch (error) {
    console.error('Excel export error:', error);
    showToast('حدث خطأ في تصدير Excel', 'error');
  }
}

async function exportToPdf() {
  const tableContainer = getActiveTable();
  if (!tableContainer) { showToast('لا يوجد جدول لتصديره', 'warning'); return; }
  try {
    const canvas = await html2canvas(tableContainer, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false
    });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`تقرير_${new Date().toISOString().slice(0,10)}.pdf`);
    showToast('تم تصدير التقرير إلى PDF', 'success');
  } catch (error) {
    console.error('PDF export error:', error);
    showToast('حدث خطأ في تصدير PDF', 'error');
  }
}

function printReport() {
  const tableContainer = getActiveTable();
  if (!tableContainer) { showToast('لا يوجد جدول للطباعة', 'warning'); return; }
  const win = window.open('', '_blank');
  const content = tableContainer.innerHTML;
  win.document.write(`
    <html><head><title>تقرير</title>
    <style>body{font-family:'Almarai',sans-serif;direction:rtl;padding:20px;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;text-align:right;} th{background:#f5f5f5;}</style>
    </head><body>${content}</body></html>
  `);
  win.document.close();
  win.print();
}

// =============================================================
// 11.  أحداث الفلاتر والأزرار
// =============================================================
function setupEventListeners() {
  // أزرار الفلاتر السريعة
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      state.currentFilter = this.dataset.filter;
      if (state.currentFilter === 'custom') {
        const from = document.getElementById('dateFrom')?.value;
        const to = document.getElementById('dateTo')?.value;
        if (from && to) {
          state.dateFrom = from;
          state.dateTo = to;
        } else {
          state.currentFilter = '30';
          document.querySelector('.filter-btn[data-filter="30"]')?.classList.add('active');
          showToast('يرجى تحديد تاريخ البداية والنهاية', 'warning');
          return;
        }
      }
      applyAllFilters();
    });
  });

  // تطبيق التاريخ المخصص
  document.getElementById('applyCustomDate')?.addEventListener('click', () => {
    const from = document.getElementById('dateFrom')?.value;
    const to = document.getElementById('dateTo')?.value;
    if (!from || !to) {
      showToast('يرجى تحديد تاريخ البداية والنهاية', 'warning');
      return;
    }
    state.dateFrom = from;
    state.dateTo = to;
    state.currentFilter = 'custom';
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    applyAllFilters();
  });

  // أزرار التصدير
  document.getElementById('exportExcelBtn')?.addEventListener('click', exportToExcel);
  document.getElementById('exportPdfBtn')?.addEventListener('click', exportToPdf);
  document.getElementById('printBtn')?.addEventListener('click', printReport);
}

// =============================================================
// 12.  التهيئة العامة للصفحة
// =============================================================
async function init() {
  console.log('🚀 Initializing Reports page (Professional version)...');

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
      sidebarAvatar.textContent = user.displayName
        ? user.displayName.charAt(0).toUpperCase()
        : user.email.charAt(0).toUpperCase();
    }

    // إعداد تسجيل الخروج
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await logoutUser();
      window.location.href = '../login.html';
    });

    // تحميل البيانات
    const success = await fetchAllData();
    if (success) {
      state.currentFilter = '30';
      const defaultBtn = document.querySelector('.filter-btn[data-filter="30"]');
      if (defaultBtn) defaultBtn.classList.add('active');
      applyAllFilters();
      setupEventListeners();
    }
  });
}

// بدء التطبيق
init();

console.log('✅ Reports.js loaded successfully (Full version with Treasury support)');
