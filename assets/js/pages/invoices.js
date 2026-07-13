// =============================================================
// invoices.js - النسخة المحسّنة النهائية
// يدعم: اختيار العميل، عرض الطلبات، تحديد الطلبات، 
// الشعار، الباركود، طباعة، PDF، واتساب
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
  getDocs,
  getDoc,
  where,
  Timestamp
} from 'firebase/firestore';

// =============================================================
// 1.  المتغيرات العامة
// =============================================================
let invoices = [];
let customers = [];
let orders = [];
let services = [];
let settings = {};
let invoicesListener = null;
let invoicePreviewModalInstance = null;
let createInvoiceModalInstance = null;
let currentInvoiceId = null;

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
// 3.  تحميل البيانات الأساسية (الإعدادات، العملاء، الخدمات)
// =============================================================
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

async function loadCustomersAndServices() {
  try {
    const [customersSnap, servicesSnap] = await Promise.all([
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'services'))
    ]);
    customers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    services = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error loading customers/services:', error);
    showToast('حدث خطأ في تحميل البيانات الأساسية', 'error');
  }
}

// =============================================================
// 4.  تحميل طلبات العميل (للمودال)
// =============================================================
async function loadOrdersForCustomer(customerId) {
  const tbody = document.getElementById('customerOrdersBody');
  const container = document.getElementById('ordersContainer');

  if (!customerId) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">اختر عميلاً لعرض طلباته</td></tr>';
    container.style.display = 'none';
    return;
  }

  try {
    const q = query(collection(db, 'orders'), where('customerId', '==', customerId));
    const snap = await getDocs(q);
    orders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">لا توجد طلبات لهذا العميل</td></tr>';
      container.style.display = 'block';
      updateSelectedSummary();
      return;
    }

    let html = '';
    orders.forEach((order) => {
      const service = services.find(s => s.id === order.serviceId);
      const serviceName = service ? service.name : 'خدمة غير معروفة';
      const price = order.total || 0;
      html += `
        <tr>
          <td><input type="checkbox" class="order-checkbox" 
                     data-id="${order.id}" 
                     data-price="${price}" 
                     data-desc="${escapeHtml(serviceName)} (طلب #${order.orderNumber || 'N/A'})" 
                     checked /></td>
          <td>#${order.orderNumber || 'N/A'}</td>
          <td>${escapeHtml(serviceName)}</td>
          <td>${formatCurrency(price)}</td>
          <td><span class="badge bg-${order.status === 'مكتمل' ? 'success' : 'warning'}">${escapeHtml(order.status || 'جديد')}</span></td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
    container.style.display = 'block';

    // ربط أحداث الـ checkboxes
    document.querySelectorAll('.order-checkbox').forEach(cb => {
      cb.addEventListener('change', updateSelectedSummary);
    });
    document.getElementById('selectAllOrders').addEventListener('change', function() {
      document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = this.checked);
      updateSelectedSummary();
    });

    updateSelectedSummary();
  } catch (error) {
    console.error('Error loading orders:', error);
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">حدث خطأ في تحميل الطلبات</td></tr>';
    showToast('حدث خطأ في تحميل الطلبات', 'error');
  }
}

function updateSelectedSummary() {
  const checkboxes = document.querySelectorAll('.order-checkbox:checked');
  const count = checkboxes.length;
  let total = 0;
  checkboxes.forEach(cb => total += parseFloat(cb.dataset.price) || 0);
  document.getElementById('selectedCount').textContent = count;
  document.getElementById('selectedTotal').textContent = formatCurrency(total);
}

// =============================================================
// 5.  تعبئة قائمة العملاء في المودال
// =============================================================
function populateCustomerSelect() {
  const select = document.getElementById('customerSelectInvoice');
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
// 6.  المصادقة والتهيئة العامة
// =============================================================
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
    sidebarAvatar.textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
  }

  await loadSettings();
  await loadCustomersAndServices();
  listenToInvoices();
  populateCustomerSelect();
});

// =============================================================
// 7.  تسجيل الخروج وتبديل الوضع
// =============================================================
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await logoutUser();
  window.location.href = '../login.html';
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

// تبديل Sidebar للجوال
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

// =============================================================
// 8.  قراءة الفواتير (Realtime)
// =============================================================
function listenToInvoices() {
  const q = query(collection(db, 'invoices'), orderBy('createdAt', 'desc'));

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

// =============================================================
// 9.  عرض الجدول
// =============================================================
function renderTable(data) {
  const tbody = document.getElementById('invoicesTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">لا يوجد فواتير</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((inv) => {
    const customer = customers.find(c => c.id === inv.customerId);
    const customerName = customer ? customer.name : 'غير معروف';
    const statusBadge = inv.status === 'مدفوعة' ? 'badge bg-success' : 'badge bg-warning text-dark';

    html += `
      <tr>
        <td><strong>#${inv.invoiceNumber || 'N/A'}</strong></td>
        <td>${escapeHtml(customerName)}</td>
        <td>${formatCurrency(inv.total)}</td>
        <td><span class="${statusBadge}">${escapeHtml(inv.status || 'غير مدفوعة')}</span></td>
        <td>${formatDate(inv.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary view-btn" data-id="${inv.id}" title="عرض">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${inv.id}" title="حذف">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // ربط الأحداث
  tbody.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => viewInvoice(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
  });
}

// =============================================================
// 10. البحث
// =============================================================
function filterInvoices(term) {
  return invoices.filter(inv => {
    const customer = customers.find(c => c.id === inv.customerId);
    const customerName = customer ? customer.name.toLowerCase() : '';
    return (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(term)) ||
           customerName.includes(term);
  });
}

document.getElementById('searchInput')?.addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? filterInvoices(term) : invoices;
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} فاتورة`;
});

// =============================================================
// 11. مودال إنشاء فاتورة جديدة (الأحداث)
// =============================================================
document.getElementById('createInvoiceBtn')?.addEventListener('click', () => {
  document.getElementById('ordersContainer').style.display = 'none';
  document.getElementById('customerOrdersBody').innerHTML =
    '<tr><td colspan="5" class="text-center text-muted">اختر عميلاً لعرض طلباته</td></tr>';
  document.getElementById('selectedCount').textContent = '0';
  document.getElementById('selectedTotal').textContent = '$0.00';

  populateCustomerSelect();

  const customerSelect = document.getElementById('customerSelectInvoice');
  customerSelect.removeEventListener('change', handleCustomerChange);
  customerSelect.addEventListener('change', handleCustomerChange);

  if (createInvoiceModalInstance) createInvoiceModalInstance.show();
});

function handleCustomerChange(e) {
  const customerId = e.target.value;
  loadOrdersForCustomer(customerId);
}

// =============================================================
// 12. إنشاء الفاتورة (حفظ)
// =============================================================
document.getElementById('confirmCreateInvoiceBtn')?.addEventListener('click', async () => {
  const customerId = document.getElementById('customerSelectInvoice').value;
  if (!customerId) {
    showToast('الرجاء اختيار عميل', 'warning');
    return;
  }

  const selectedCheckboxes = document.querySelectorAll('.order-checkbox:checked');
  if (selectedCheckboxes.length === 0) {
    showToast('الرجاء اختيار طلب واحد على الأقل', 'warning');
    return;
  }

  const selectedOrders = [];
  let totalAmount = 0;
  selectedCheckboxes.forEach(cb => {
    const order = orders.find(o => o.id === cb.dataset.id);
    if (order) {
      selectedOrders.push(order);
      totalAmount += order.total || 0;
    }
  });

  // إنشاء رقم فاتورة تلقائي
  const now = new Date();
  const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
  const count = invoices.length + 1;
  const invoiceNumber = `INV-${dateStr}-${String(count).padStart(3,'0')}`;

  const items = selectedOrders.map(order => {
    const service = services.find(s => s.id === order.serviceId);
    const desc = service ? service.name : 'خدمة غير معروفة';
    return {
      description: `${desc} (طلب #${order.orderNumber})`,
      amount: order.total || 0
    };
  });

  const customer = customers.find(c => c.id === customerId);

  const invoiceData = {
    invoiceNumber,
    customerId,
    customerName: customer ? customer.name : null,
    total: totalAmount,
    paid: 0,
    balance: totalAmount,
    status: 'غير مدفوعة',
    items: items,
    orderIds: selectedOrders.map(o => o.id),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const saveBtn = document.getElementById('confirmCreateInvoiceBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الإنشاء...';

  try {
    await addDoc(collection(db, 'invoices'), invoiceData);
    showToast('تم إنشاء الفاتورة بنجاح', 'success');
    if (createInvoiceModalInstance) createInvoiceModalInstance.hide();
  } catch (error) {
    console.error('Error creating invoice:', error);
    showToast('حدث خطأ أثناء إنشاء الفاتورة', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-file-invoice me-2"></i>إنشاء الفاتورة';
  }
});

// =============================================================
// 13. عرض الفاتورة (مع الشعار والباركود)
// =============================================================
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

const logoHtml = `<img src="https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg_uOBH-XBPOdfEkh6JSeBwU4FOCTxJPkb2H4NgJhVj6DtsyzJxzITcOdbObjW3_Q1bUpq8tnV86m4Q5kHhitUCM5-J-OzBGjAdvCj2By0iBQ_FmFQAR6ytlFFd54kdT0xf9ibZnwzUwUtARA3mCi8Kj44NJQxff5jbvvq6h9SwRFLWyKw3qNZTeqWGcfJo/s200/a%20(1).png" alt="شعار الشركة" style="max-height:60px; max-width:150px; object-fit:contain;" />`;

  const html = `
    <div id="invoice-print-area" class="invoice-preview-area">
      <div class="header">
        <div class="company-info">
          ${logoHtml}
          <div style="font-weight:bold;font-size:16px;margin-top:5px;">${settings.companyName || ''}</div>
          <div style="font-size:14px;color:#666;">${settings.companyAddress || ''}</div>
          <div style="font-size:14px;color:#666;">${settings.companyPhone || ''} | ${settings.companyEmail || ''}</div>
        </div>
        <div class="invoice-title">
          <h2>فاتورة</h2>
          <div style="font-size:14px;color:#666;">رقم: #${invoice.invoiceNumber}</div>
          <div style="font-size:14px;color:#666;">التاريخ: ${formatDate(invoice.createdAt)}</div>
        </div>
      </div>

      <div class="customer-info">
        <div style="font-weight:bold;">بيانات العميل</div>
        <div style="font-size:14px;color:#333;">${escapeHtml(customerName)}</div>
        <div style="font-size:14px;color:#333;">${escapeHtml(customerPhone)}</div>
        <div style="font-size:14px;color:#333;">${escapeHtml(customerAddress)}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:70%;">البيان</th>
            <th style="width:30%;text-align:center;">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items?.map(item => `
            <tr>
              <td>${escapeHtml(item.description)}</td>
              <td style="text-align:center;">${settings.currency || '$'} ${item.amount?.toFixed(2) || '0.00'}</td>
            </tr>
          `).join('') || `
            <tr><td colspan="2" class="text-center">لا توجد عناصر</td></tr>
          `}
        </tbody>
        <tfoot>
          <tr>
            <td style="font-weight:bold;">الإجمالي</td>
            <td style="text-align:center;font-weight:bold;">${settings.currency || '$'} ${invoice.total?.toFixed(2) || '0.00'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;">المدفوع</td>
            <td style="text-align:center;font-weight:bold;">${settings.currency || '$'} ${invoice.paid?.toFixed(2) || '0.00'}</td>
          </tr>
          <tr>
            <td style="font-weight:bold;color:#d9534f;">المتبقي</td>
            <td style="text-align:center;font-weight:bold;color:#d9534f;">${settings.currency || '$'} ${invoice.balance?.toFixed(2) || '0.00'}</td>
          </tr>
        </tfoot>
      </table>

      <div class="qrcode-container">
        <div id="qrcode-placeholder" style="width:120px;height:120px;background:#fff;border:1px solid #ddd;padding:5px;"></div>
      </div>

      <div class="footer">
        ${settings.companyName || ''} - شكراً لثقتكم بنا
      </div>
    </div>
  `;

  document.getElementById('invoicePreviewBody').innerHTML = html;
  if (invoicePreviewModalInstance) invoicePreviewModalInstance.show();

  // إنشاء الباركود بعد عرض المودال مباشرة
  setTimeout(() => {
    const qrElement = document.getElementById('qrcode-placeholder');
    if (qrElement && typeof QRCode !== 'undefined') {
      qrElement.innerHTML = '';
      new QRCode(qrElement, {
        text: invoice.invoiceNumber,
        width: 120,
        height: 120,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  }, 300);
}

// =============================================================
// 14. طباعة، تحميل PDF، واتساب
// =============================================================
document.getElementById('printInvoiceBtn')?.addEventListener('click', () => {
  const content = document.getElementById('invoice-print-area');
  if (!content) return;
  const win = window.open('', '_blank');
  win.document.write(`
    <html>
      <head>
        <title>فاتورة</title>
        <style>
          body { font-family: 'Almarai', sans-serif; direction: rtl; padding: 20px; }
          .invoice-preview-area { max-width: 100%; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ff6600; padding-bottom: 15px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: right; }
          th { background: #f8f9fa; }
          .qrcode-container { display: flex; justify-content: flex-end; margin-top: 10px; }
          .footer { text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px; margin-top: 20px; }
          .logo { max-height: 60px; max-width: 150px; object-fit: contain; }
        </style>
      </head>
      <body>${content.innerHTML}</body>
    </html>
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
    const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
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
  const invoice = invoices.find(inv => inv.id === currentInvoiceId);
  const customer = customers.find(c => c.id === invoice?.customerId);
  const phone = customer?.phone || '';
  const message = `مرحباً، مرفق فاتورة جديدة رقم #${invoice?.invoiceNumber || ''}. شكراً لثقتكم بنا.`;
  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
});

// =============================================================
// 15. حذف فاتورة
// =============================================================
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

// =============================================================
// 16. تهيئة المودالات
// =============================================================
const previewModal = document.getElementById('invoicePreviewModal');
if (previewModal) {
  invoicePreviewModalInstance = new bootstrap.Modal(previewModal);
}
const createModal = document.getElementById('createInvoiceModal');
if (createModal) {
  createInvoiceModalInstance = new bootstrap.Modal(createModal);
}

console.log('✅ Invoices.js loaded successfully (Professional version)');
