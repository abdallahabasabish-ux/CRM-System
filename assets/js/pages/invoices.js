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
  getDocs,
  getDoc,
  where
} from 'firebase/firestore';

// ============================
// متغيرات عامة
// ============================
let invoices = [];
let customers = [];
let orders = [];
let settings = {};
let invoicesListener = null;
let invoicePreviewModalInstance = null;
let mergeModalInstance = null;
let currentInvoiceId = null;

// ============================
// 1. دوال مساعدة (Toast, Escape, Format)
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

function formatDate(date) {
  if (!date) return '-';
  if (typeof date === 'string') return date;
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  return '';
}

// ============================
// 2. جلب إعدادات الشركة والبيانات
// ============================
async function loadSettings() {
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'general'));
    if (settingsDoc.exists()) {
      settings = settingsDoc.data();
    } else {
      settings = { companyName: 'شركتي', companyLogo: '', currency: '$' };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    settings = { companyName: 'شركتي', companyLogo: '', currency: '$' };
  }
}

async function loadCustomersAndOrders() {
  try {
    const customersSnap = await getDocs(collection(db, 'customers'));
    customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const ordersSnap = await getDocs(collection(db, 'orders'));
    orders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error loading customers/orders:', error);
  }
}

// ============================
// 3. قراءة الفواتير (Realtime)
// ============================
function listenToInvoices() {
  const invoicesRef = collection(db, 'invoices');
  const q = query(invoicesRef, orderBy('createdAt', 'desc'));

  if (invoicesListener) {
    invoicesListener();
  }

  invoicesListener = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      invoices = [];
      renderTable([]);
      document.getElementById('resultCount').textContent = 'عرض 0 فاتورة';
      return;
    }

    invoices = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt || null
    }));

    const searchTerm = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    const filtered = searchTerm ? filterInvoices(searchTerm) : invoices;
    renderTable(filtered);
    document.getElementById('resultCount').textContent = `عرض ${filtered.length} فاتورة`;
  }, (error) => {
    console.error('Error listening to invoices:', error);
    showToast('حدث خطأ في تحميل الفواتير', 'error');
  });
}

// ============================
// 4. عرض الجدول (مع استخدام data-attributes للأزرار)
// ============================
function renderTable(data) {
  const tbody = document.getElementById('invoicesTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">لا يوجد فواتير</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((inv) => {
    const customer = customers.find(c => c.id === inv.customerId);
    const customerName = customer ? customer.name : 'غير معروف';
    const statusBadge = inv.status === 'مدفوعة' ? 'badge bg-success' : 'badge bg-warning text-dark';

    html += `
      <tr>
        <td><input type="checkbox" class="invoice-checkbox" data-id="${inv.id}" /></td>
        <td><strong>#${inv.invoiceNumber || 'N/A'}</strong></td>
        <td>${escapeHtml(customerName)}</td>
        <td>$${inv.total ? inv.total.toFixed(2) : '0.00'}</td>
        <td><span class="${statusBadge}">${escapeHtml(inv.status || 'غير مدفوعة')}</span></td>
        <td>${formatDate(inv.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary action-btn" data-action="view" data-id="${inv.id}" title="عرض">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger action-btn" data-action="delete" data-id="${inv.id}" title="حذف">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // ========================================
  // استخدام Event Delegation لجميع الأزرار داخل الجدول
  // ========================================
  // نربط حدث واحد على tbody بدلاً من كل زر على حدة
  // سنقوم بذلك في دالة init بعد التأكد من وجود tbody
}

// ============================
// 5. البحث
// ============================
function filterInvoices(term) {
  return invoices.filter(inv => {
    const customer = customers.find(c => c.id === inv.customerId);
    const customerName = customer ? customer.name.toLowerCase() : '';
    return (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(term)) ||
           customerName.includes(term);
  });
}

// ============================
// 6. معالج الأحداث العام للأزرار (Event Delegation)
// ============================
function setupActionHandlers() {
  const tbody = document.getElementById('invoicesTableBody');
  if (!tbody) return;

  // إزالة المستمع القديم لتجنب التكرار
  tbody.removeEventListener('click', handleTableClick);
  tbody.addEventListener('click', handleTableClick);
}

function handleTableClick(e) {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (!action || !id) return;

  e.preventDefault();

  switch (action) {
    case 'view':
      viewInvoice(id);
      break;
    case 'delete':
      confirmDelete(id);
      break;
    default:
      console.warn('Unknown action:', action);
  }
}

// ============================
// 7. إنشاء فاتورة جديدة (من طلب)
// ============================
async function getOrdersOptions() {
  const ordersSnap = await getDocs(collection(db, 'orders'));
  const ordersList = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const options = {};
  ordersList.forEach(o => {
    const customer = customers.find(c => c.id === o.customerId);
    const customerName = customer ? customer.name : 'غير معروف';
    options[o.id] = `#${o.orderNumber || 'N/A'} - ${customerName} ($${o.total?.toFixed(2) || '0'})`;
  });
  return options;
}

async function createInvoiceFromOrder(orderId) {
  const saveBtn = document.getElementById('createInvoiceBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري...';

  try {
    const orderDoc = await getDoc(doc(db, 'orders', orderId));
    if (!orderDoc.exists()) {
      showToast('الطلب غير موجود', 'error');
      return;
    }
    const orderData = orderDoc.data();

    const now = new Date();
    const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
    const count = invoices.length + 1;
    const invoiceNumber = `INV-${dateStr}-${String(count).padStart(3,'0')}`;

    const invoiceData = {
      invoiceNumber,
      customerId: orderData.customerId,
      orderId: orderId,
      total: orderData.total || 0,
      paid: orderData.paid || 0,
      balance: (orderData.total || 0) - (orderData.paid || 0),
      status: (orderData.total || 0) - (orderData.paid || 0) <= 0 ? 'مدفوعة' : 'غير مدفوعة',
      items: [{
        description: `طلب #${orderData.orderNumber}`,
        amount: orderData.total || 0
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await addDoc(collection(db, 'invoices'), invoiceData);
    showToast('تم إنشاء الفاتورة بنجاح', 'success');
  } catch (error) {
    console.error('Error creating invoice:', error);
    showToast('حدث خطأ أثناء إنشاء الفاتورة', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-plus me-2"></i>فاتورة جديدة';
  }
}

document.getElementById('createInvoiceBtn')?.addEventListener('click', async () => {
  const { value: orderId } = await Swal.fire({
    title: 'اختر الطلب',
    input: 'select',
    inputOptions: await getOrdersOptions(),
    inputPlaceholder: 'اختر طلب...',
    showCancelButton: true,
    confirmButtonText: 'إنشاء فاتورة',
    cancelButtonText: 'إلغاء'
  });

  if (orderId) {
    await createInvoiceFromOrder(orderId);
  }
});

// ============================
// 8. عرض الفاتورة مع الشعار واسم الشركة
// ============================
async function viewInvoice(id) {
  const invoice = invoices.find(inv => inv.id === id);
  if (!invoice) {
    showToast('الفاتورة غير موجودة', 'error');
    return;
  }
  currentInvoiceId = id;

  const customer = customers.find(c => c.id === invoice.customerId);
  const customerName = customer ? customer.name : 'غير معروف';
  const customerPhone = customer ? customer.phone : '';
  const customerAddress = customer ? customer.address : '';

  const logoHtml = settings.companyLogo 
    ? `<img src="${settings.companyLogo}" alt="شعار الشركة" style="max-height:60px;max-width:150px;object-fit:contain;" />`
    : `<div style="font-size:24px;font-weight:bold;color:#0a1a2f;">${settings.companyName || 'شركتي'}</div>`;

  const html = `
    <div id="invoice-print-area" style="padding:20px;font-family:Arial,sans-serif;direction:rtl;background:#fff;color:#333;">
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0a1a2f;padding-bottom:15px;margin-bottom:20px;">
        <div>
          ${logoHtml}
          <div style="font-size:14px;color:#666;margin-top:5px;">${settings.companyAddress || ''}</div>
          <div style="font-size:14px;color:#666;">${settings.companyPhone || ''} | ${settings.companyEmail || ''}</div>
        </div>
        <div style="text-align:left;">
          <h2 style="color:#0a1a2f;margin:0;">فاتورة</h2>
          <div style="font-size:14px;color:#666;">رقم: #${invoice.invoiceNumber}</div>
          <div style="font-size:14px;color:#666;">التاريخ: ${formatDate(invoice.createdAt)}</div>
        </div>
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-weight:bold;">بيانات العميل</div>
        <div style="font-size:14px;color:#333;">${escapeHtml(customerName)}</div>
        <div style="font-size:14px;color:#333;">${escapeHtml(customerPhone)}</div>
        <div style="font-size:14px;color:#333;">${escapeHtml(customerAddress)}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:10px;text-align:right;border:1px solid #ddd;">البيان</th>
            <th style="padding:10px;text-align:center;border:1px solid #ddd;">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items?.map(item => `
            <tr>
              <td style="padding:10px;border:1px solid #ddd;">${escapeHtml(item.description)}</td>
              <td style="padding:10px;text-align:center;border:1px solid #ddd;">${settings.currency || '$'} ${item.amount?.toFixed(2) || '0.00'}</td>
            </tr>
          `).join('') || `
            <tr>
              <td style="padding:10px;border:1px solid #ddd;">إجمالي الطلب</td>
              <td style="padding:10px;text-align:center;border:1px solid #ddd;">${settings.currency || '$'} ${invoice.total?.toFixed(2) || '0.00'}</td>
            </tr>
          `}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding:10px;border:1px solid #ddd;font-weight:bold;">الإجمالي</td>
            <td style="padding:10px;text-align:center;border:1px solid #ddd;font-weight:bold;">${settings.currency || '$'} ${invoice.total?.toFixed(2) || '0.00'}</td>
          </tr>
          <tr>
            <td style="padding:10px;border:1px solid #ddd;font-weight:bold;">المدفوع</td>
            <td style="padding:10px;text-align:center;border:1px solid #ddd;font-weight:bold;">${settings.currency || '$'} ${invoice.paid?.toFixed(2) || '0.00'}</td>
          </tr>
          <tr>
            <td style="padding:10px;border:1px solid #ddd;font-weight:bold;color:#d9534f;">المتبقي</td>
            <td style="padding:10px;text-align:center;border:1px solid #ddd;font-weight:bold;color:#d9534f;">${settings.currency || '$'} ${invoice.balance?.toFixed(2) || '0.00'}</td>
          </tr>
        </tfoot>
      </table>

      <div style="text-align:center;font-size:12px;color:#999;border-top:1px solid #eee;padding-top:10px;">
        ${settings.companyName || ''} - شكراً لثقتكم بنا
      </div>
    </div>
  `;

  document.getElementById('invoicePreviewBody').innerHTML = html;
  if (invoicePreviewModalInstance) invoicePreviewModalInstance.show();
}

// ============================
// 9. طباعة، تحميل PDF، مشاركة واتساب
// ============================
document.getElementById('printInvoiceBtn')?.addEventListener('click', () => {
  const printContents = document.getElementById('invoice-print-area')?.innerHTML;
  if (!printContents) {
    showToast('لا توجد فاتورة للطباعة', 'warning');
    return;
  }
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>فاتورة</title>
    <style>body{font-family:Arial,sans-serif;direction:rtl;padding:20px;}</style>
    </head><body>${printContents}</body></html>
  `);
  win.document.close();
  win.print();
});

document.getElementById('downloadPdfBtn')?.addEventListener('click', async () => {
  const element = document.getElementById('invoice-print-area');
  if (!element) {
    showToast('لا توجد فاتورة للتحميل', 'warning');
    return;
  }
  try {
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`فاتورة_${currentInvoiceId || 'new'}.pdf`);
    showToast('تم تحميل الفاتورة PDF', 'success');
  } catch (error) {
    console.error('PDF error:', error);
    showToast('حدث خطأ في تحميل PDF', 'error');
  }
});

document.getElementById('shareWhatsappBtn')?.addEventListener('click', () => {
  const customer = customers.find(c => c.id === invoices.find(inv => inv.id === currentInvoiceId)?.customerId);
  const phone = customer?.phone || '';
  const message = `مرحباً، مرفق فاتورة جديدة. شكراً لثقتكم بنا.`;
  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
});

// ============================
// 10. حذف فاتورة
// ============================
async function confirmDelete(id) {
  const invoice = invoices.find(inv => inv.id === id);
  if (!invoice) return;

  const result = await Swal.fire({
    title: 'هل أنت متأكد؟',
    text: `سيتم حذف الفاتورة #${invoice.invoiceNumber} نهائيًا.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  });

  if (result.isConfirmed) {
    try {
      await deleteDoc(doc(db, 'invoices', id));
      showToast('تم حذف الفاتورة بنجاح', 'success');
    } catch (error) {
      console.error('Error deleting invoice:', error);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }
}

// ============================
// 11. دمج الفواتير
// ============================
document.getElementById('mergeInvoicesBtn')?.addEventListener('click', () => {
  openMergeModal();
});

async function openMergeModal() {
  const mergeInvoices = invoices.filter(inv => inv.balance > 0);
  if (mergeInvoices.length < 2) {
    showToast('تحتاج إلى فاتورتين على الأقل للدمج', 'warning');
    return;
  }

  const tbody = document.getElementById('mergeInvoicesBody');
  tbody.innerHTML = '';
  mergeInvoices.forEach(inv => {
    const customer = customers.find(c => c.id === inv.customerId);
    const customerName = customer ? customer.name : 'غير معروف';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="merge-checkbox" data-id="${inv.id}" /></td>
      <td>#${inv.invoiceNumber}</td>
      <td>${escapeHtml(customerName)}</td>
      <td>$${inv.total?.toFixed(2) || '0.00'}</td>
      <td>${formatDate(inv.createdAt)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('selectAllMerge').checked = false;
  document.getElementById('selectAllMerge').addEventListener('change', function() {
    document.querySelectorAll('.merge-checkbox').forEach(cb => cb.checked = this.checked);
  });

  document.getElementById('mergeInfo').textContent = 'اختر فواتير لنفس العميل لدمجها في فاتورة واحدة.';

  if (mergeModalInstance) mergeModalInstance.show();
}

document.getElementById('confirmMergeBtn')?.addEventListener('click', async () => {
  const selected = document.querySelectorAll('.merge-checkbox:checked');
  if (selected.length < 2) {
    showToast('يرجى اختيار فاتورتين على الأقل للدمج', 'warning');
    return;
  }

  const selectedIds = Array.from(selected).map(cb => cb.dataset.id);
  const selectedInvoices = invoices.filter(inv => selectedIds.includes(inv.id));

  const customerId = selectedInvoices[0].customerId;
  const sameCustomer = selectedInvoices.every(inv => inv.customerId === customerId);
  if (!sameCustomer) {
    showToast('جميع الفواتير المختارة يجب أن تكون لنفس العميل', 'error');
    return;
  }

  const totalSum = selectedInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
  const paidSum = selectedInvoices.reduce((sum, inv) => sum + (inv.paid || 0), 0);
  const balanceSum = totalSum - paidSum;

  const now = new Date();
  const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
  const count = invoices.length + 1;
  const invoiceNumber = `INV-MRG-${dateStr}-${String(count).padStart(3,'0')}`;

  const mergedInvoiceData = {
    invoiceNumber,
    customerId,
    total: totalSum,
    paid: paidSum,
    balance: balanceSum,
    status: balanceSum <= 0 ? 'مدفوعة' : 'غير مدفوعة',
    items: selectedInvoices.map(inv => ({
      description: `فاتورة #${inv.invoiceNumber}`,
      amount: inv.total || 0
    })),
    mergedFrom: selectedIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const confirmBtn = document.getElementById('confirmMergeBtn');
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الدمج...';

  try {
    await addDoc(collection(db, 'invoices'), mergedInvoiceData);
    showToast('تم دمج الفواتير بنجاح', 'success');
    if (mergeModalInstance) mergeModalInstance.hide();
  } catch (error) {
    console.error('Error merging invoices:', error);
    showToast('حدث خطأ أثناء دمج الفواتير', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="fas fa-object-group me-2"></i>دمج الفواتير المختارة';
  }
});

// ============================
// 12. تهيئة الوضع المظلم و Sidebar
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
}

// ============================
// 13. التهيئة العامة
// ============================
async function init() {
  console.log('🚀 Initializing Invoices page...');

  onAuthStateChangedCallback(async (user) => {
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

    await loadSettings();
    await loadCustomersAndOrders();
    listenToInvoices();

    // بعد تحميل البيانات، نضبط معالج الأحداث للأزرار (مرة واحدة فقط)
    setupActionHandlers();
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await logoutUser();
    window.location.href = '../login.html';
  });

  initDarkMode();
  initSidebar();

  // تهيئة المودالات
  const previewModal = document.getElementById('invoicePreviewModal');
  if (previewModal) {
    invoicePreviewModalInstance = new bootstrap.Modal(previewModal);
  }
  const mergeModal = document.getElementById('mergeModal');
  if (mergeModal) {
    mergeModalInstance = new bootstrap.Modal(mergeModal);
  }

  console.log('✅ Invoices page ready');
}

document.addEventListener('DOMContentLoaded', init);
