import { onAuthStateChangedCallback, logoutUser } from '../auth.js';
import { db } from '../firebase-config.js';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

let ordersList = [];
let customersList = [];
let invoiceModalInstance = null;
let currentInvoiceData = null;

// ============================
// دوال مساعدة
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

// ============================
// تحميل البيانات اللازمة للفواتير
// ============================
async function loadInvoiceData() {
  try {
    const ordersSnap = await getDocs(collection(db, 'orders'));
    ordersList = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const customersSnap = await getDocs(collection(db, 'customers'));
    customersList = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    renderOrdersTable(ordersList);
  } catch (error) {
    console.error('Error loading invoice data:', error);
    showToast('حدث خطأ في تحميل البيانات', 'error');
  }
}

// ============================
// عرض جدول الطلبات (القابلة للفوترة)
// ============================
function renderOrdersTable(orders) {
  const tbody = document.getElementById('invoicesTableBody');
  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">لا توجد طلبات</td></tr>`;
    document.getElementById('resultCount').textContent = 'عرض 0 فاتورة';
    return;
  }

  let html = '';
  orders.slice(0, 50).forEach((order) => {
    const customer = customersList.find(c => c.id === order.customerId);
    const customerName = customer ? customer.name : 'غير معروف';
    const total = order.total || 0;
    const status = order.status || 'جديد';
    const statusBadge = status === 'مكتمل' ? 'bg-success' : 'bg-warning text-dark';

    html += `
      <tr>
        <td><strong>#${order.orderNumber || 'N/A'}</strong></td>
        <td>${escapeHtml(customerName)}</td>
        <td>$${total.toFixed(2)}</td>
        <td><span class="badge ${statusBadge}">${escapeHtml(status)}</span></td>
        <td>${order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('ar') : '-'}</td>
        <td>
          <button class="btn btn-sm btn-accent create-invoice-btn" data-id="${order.id}" title="إنشاء فاتورة">
            <i class="fas fa-file-invoice"></i> فاتورة
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // ربط أحداث أزرار إنشاء الفاتورة
  tbody.querySelectorAll('.create-invoice-btn').forEach(btn => {
    btn.addEventListener('click', () => createInvoice(btn.dataset.id));
  });

  document.getElementById('resultCount').textContent = `عرض ${orders.length} طلب`;
}

// ============================
// إنشاء الفاتورة
// ============================
async function createInvoice(orderId) {
  try {
    const order = ordersList.find(o => o.id === orderId);
    if (!order) {
      showToast('الطلب غير موجود', 'error');
      return;
    }

    const customer = customersList.find(c => c.id === order.customerId);
    if (!customer) {
      showToast('العميل غير موجود', 'error');
      return;
    }

    // قراءة إعدادات الشركة من Firestore (اختياري)
    const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
    const settings = settingsDoc.exists() ? settingsDoc.data() : {};

    // تجهيز بيانات الفاتورة
    currentInvoiceData = {
      order,
      customer,
      settings,
      invoiceNumber: `INV-${order.orderNumber || 'N/A'}`,
      date: new Date().toISOString().slice(0, 10),
      total: order.total || 0,
      paid: order.paid || 0,
      balance: (order.total || 0) - (order.paid || 0),
      items: [
        { description: order.notes || 'خدمة', amount: order.total || 0 }
      ]
    };

    // عرض الفاتورة في المودال
    showInvoicePreview(currentInvoiceData);
  } catch (error) {
    console.error('Error creating invoice:', error);
    showToast('حدث خطأ أثناء إنشاء الفاتورة', 'error');
  }
}

// ============================
// عرض معاينة الفاتورة
// ============================
function showInvoicePreview(data) {
  const container = document.getElementById('invoicePreviewBody');
  if (!container) return;

  const companyName = data.settings?.companyName || 'شركتي';
  const companyAddress = data.settings?.companyAddress || '';
  const companyPhone = data.settings?.companyPhone || '';
  const currency = data.settings?.currency || '$';

  container.innerHTML = `
    <div id="invoice-content" style="background: #fff; color: #333; padding: 30px; font-family: 'Tajawal', sans-serif; direction: rtl; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #eee; padding-bottom: 15px; margin-bottom: 20px;">
        <div>
          <h2 style="margin: 0;">فاتورة</h2>
          <p style="color: #777; margin: 0;">${data.invoiceNumber}</p>
          <p style="color: #777; margin: 0;">التاريخ: ${data.date}</p>
        </div>
        <div style="text-align: left;">
          <h3 style="margin: 0;">${escapeHtml(companyName)}</h3>
          <p style="color: #777; margin: 0;">${escapeHtml(companyAddress)}</p>
          <p style="color: #777; margin: 0;">${escapeHtml(companyPhone)}</p>
        </div>
      </div>
      <div style="margin-bottom: 20px;">
        <p><strong>العميل:</strong> ${escapeHtml(data.customer.name)}</p>
        <p><strong>الهاتف:</strong> ${escapeHtml(data.customer.phone || '')}</p>
        <p><strong>البريد:</strong> ${escapeHtml(data.customer.email || '')}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">الوصف</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map(item => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(item.description)}</td>
              <td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${currency} ${item.amount.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">الإجمالي</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: left; font-weight: bold;">${currency} ${data.total.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">المدفوع</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${currency} ${data.paid.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">المتبقي</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: left; color: ${data.balance > 0 ? '#e74c3c' : '#27ae60'};">${currency} ${data.balance.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <div style="text-align: center; margin-top: 20px; color: #777; font-size: 12px;">
        شكراً لتعاملكم معنا
      </div>
    </div>
  `;

  // فتح المودال
  if (invoiceModalInstance) {
    invoiceModalInstance.show();
  }
}

// ============================
// طباعة الفاتورة
// ============================
function printInvoice() {
  const content = document.getElementById('invoice-content');
  if (!content) return;
  const win = window.open('', '', 'width=800,height=600');
  win.document.write(`
    <html><head><title>فاتورة</title>
    <style>body { font-family: 'Tajawal', sans-serif; direction: rtl; }</style>
    </head><body>${content.innerHTML}</body></html>
  `);
  win.document.close();
  win.print();
}

// ============================
// تحميل PDF
// ============================
async function downloadPdf() {
  const content = document.getElementById('invoice-content');
  if (!content) return;
  try {
    const canvas = await html2canvas(content, { scale: 2, backgroundColor: '#fff' });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`فاتورة_${currentInvoiceData?.invoiceNumber || 'invoice'}.pdf`);
    showToast('تم تحميل PDF بنجاح', 'success');
  } catch (error) {
    console.error('Error generating PDF:', error);
    showToast('حدث خطأ أثناء إنشاء PDF', 'error');
  }
}

// ============================
// مشاركة عبر واتساب
// ============================
function shareWhatsapp() {
  if (!currentInvoiceData) return;
  const customer = currentInvoiceData.customer;
  const order = currentInvoiceData.order;
  const message = `فاتورة رقم: ${currentInvoiceData.invoiceNumber}\nالعميل: ${customer.name}\nالإجمالي: ${currentInvoiceData.total}\nالمدفوع: ${currentInvoiceData.paid}\nالمتبقي: ${currentInvoiceData.balance}`;
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

// ============================
// تهيئة الصفحة
// ============================
function init() {
  console.log('🚀 Initializing Invoices page...');

  // المصادقة
  onAuthStateChangedCallback((user) => {
    if (!user) {
      window.location.href = '../login.html';
      return;
    }
    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserEmail = document.getElementById('sidebarUserEmail');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    if (sidebarUserName) sidebarUserName.textContent = user.displayName || user.email;
    if (sidebarUserEmail) sidebarUserEmail.textContent = user.email;
    if (sidebarAvatar) {
      sidebarAvatar.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
    }
    loadInvoiceData();
  });

  // تسجيل الخروج
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await logoutUser();
      window.location.href = '../login.html';
    });
  }

  // الوضع المظلم
  const themeToggle = document.getElementById('themeToggle');
  const htmlElement = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    htmlElement.setAttribute('data-theme', 'dark');
    if (themeToggle) themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
  }
  if (themeToggle) {
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

  // تهيئة مودال المعاينة
  const modalEl = document.getElementById('invoicePreviewModal');
  if (modalEl) {
    invoiceModalInstance = new bootstrap.Modal(modalEl);
  }

  // أزرار المودال
  document.getElementById('printInvoiceBtn')?.addEventListener('click', printInvoice);
  document.getElementById('downloadPdfBtn')?.addEventListener('click', downloadPdf);
  document.getElementById('shareWhatsappBtn')?.addEventListener('click', shareWhatsapp);

  console.log('✅ Invoices page ready');
}

document.addEventListener('DOMContentLoaded', init);
