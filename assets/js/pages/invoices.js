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
  getDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';

// ============================
// متغيرات عامة
// ============================
let invoices = [];
let ordersList = [];
let currentInvoiceId = null;
let invoicesListener = null;
let createInvoiceModalInstance = null;
let viewInvoiceModalInstance = null;

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
  
  loadOrdersForInvoiceSelect().then(() => {
    listenToInvoices();
  });
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
// 3. تهيئة الـ Modals
// ============================
const createModalEl = document.getElementById('createInvoiceModal');
const viewModalEl = document.getElementById('viewInvoiceModal');
if (createModalEl) {
  createInvoiceModalInstance = new bootstrap.Modal(createModalEl);
}
if (viewModalEl) {
  viewInvoiceModalInstance = new bootstrap.Modal(viewModalEl);
}

// ============================
// 4. دوال مساعدة (Toast)
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
// 5. تحميل قائمة الطلبات لاختيار الفاتورة
// ============================
async function loadOrdersForInvoiceSelect() {
  try {
    const ordersSnapshot = await getDocs(collection(db, 'orders'));
    ordersList = ordersSnapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data };
    });
    populateInvoiceOrderSelect();
  } catch (error) {
    console.error('Error loading orders for invoice select:', error);
  }
}

function populateInvoiceOrderSelect() {
  const select = document.getElementById('invoiceOrderSelect');
  select.innerHTML = '<option value="">اختر طلب...</option>';
  ordersList.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    const customerName = o.customerName || 'عميل';
    opt.textContent = `#${o.orderNumber || 'N/A'} - ${customerName} ($${o.total?.toFixed(2) || '0'})`;
    select.appendChild(opt);
  });
}

// ============================
// 6. قراءة الفواتير من Firestore (Realtime)
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
      ...doc.data()
    }));

    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const filtered = searchTerm ? filterInvoices(searchTerm) : invoices;
    renderTable(filtered);
    document.getElementById('resultCount').textContent = `عرض ${filtered.length} فاتورة`;
  }, (error) => {
    console.error('Error listening to invoices:', error);
    showToast('حدث خطأ في تحميل الفواتير', 'error');
  });
}

// ============================
// 7. عرض الجدول
// ============================
function renderTable(data) {
  const tbody = document.getElementById('invoicesTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">لا يوجد فواتير</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((invoice) => {
    const customerName = invoice.customerName || 'غير معروف';
    html += `
      <tr>
        <td><strong>${escapeHtml(invoice.invoiceNumber || 'N/A')}</strong></td>
        <td>${escapeHtml(customerName)}</td>
        <td>#${escapeHtml(invoice.orderNumber || 'N/A')}</td>
        <td>$${invoice.total ? invoice.total.toFixed(2) : '0.00'}</td>
        <td>${formatDate(invoice.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary view-btn" data-id="${invoice.id}" title="عرض">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${invoice.id}" title="حذف">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  tbody.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => viewInvoice(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(date) {
  if (!date) return '-';
  if (date.toDate) date = date.toDate();
  if (date instanceof Date) {
    return date.toISOString().slice(0,10);
  }
  return date;
}

// ============================
// 8. البحث والفلترة
// ============================
function filterInvoices(term) {
  return invoices.filter(inv => {
    const invoiceNumber = inv.invoiceNumber?.toLowerCase() || '';
    const customerName = inv.customerName?.toLowerCase() || '';
    const orderNumber = inv.orderNumber?.toLowerCase() || '';
    return invoiceNumber.includes(term) || customerName.includes(term) || orderNumber.includes(term);
  });
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? filterInvoices(term) : invoices;
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} فاتورة`;
});

// ============================
// 9. فتح مودال إنشاء فاتورة
// ============================
document.getElementById('createInvoiceBtn').addEventListener('click', () => {
  // توليد رقم فاتورة تلقائي
  const now = new Date();
  const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
  const count = invoices.length + 1;
  const invoiceNumber = `INV-${dateStr}-${String(count).padStart(3, '0')}`;
  document.getElementById('invoiceNumber').value = invoiceNumber;

  // تعبئة قائمة الطلبات
  populateInvoiceOrderSelect();

  createInvoiceModalInstance.show();
});

// ============================
// 10. إنشاء الفاتورة
// ============================
document.getElementById('generateInvoiceBtn').addEventListener('click', async () => {
  const orderId = document.getElementById('invoiceOrderSelect').value;
  const invoiceNumber = document.getElementById('invoiceNumber').value;

  if (!orderId) {
    showToast('الرجاء اختيار طلب', 'warning');
    return;
  }

  const btn = document.getElementById('generateInvoiceBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الإنشاء...';

  try {
    // جلب بيانات الطلب كاملة
    const orderDoc = await getDoc(doc(db, 'orders', orderId));
    if (!orderDoc.exists()) {
      throw new Error('الطلب غير موجود');
    }
    const orderData = orderDoc.data();

    // جلب بيانات العميل والخدمة والموظف
    const [customerDoc, serviceDoc, employeeDoc] = await Promise.all([
      orderData.customerId ? getDoc(doc(db, 'customers', orderData.customerId)) : null,
      orderData.serviceId ? getDoc(doc(db, 'services', orderData.serviceId)) : null,
      orderData.employeeId ? getDoc(doc(db, 'employees', orderData.employeeId)) : null
    ]);

    const customerData = customerDoc?.exists() ? customerDoc.data() : null;
    const serviceData = serviceDoc?.exists() ? serviceDoc.data() : null;
    const employeeData = employeeDoc?.exists() ? employeeDoc.data() : null;

    // إنشاء كائن الفاتورة
    const invoiceData = {
      invoiceNumber,
      orderId,
      orderNumber: orderData.orderNumber || null,
      customerId: orderData.customerId || null,
      customerName: customerData?.name || 'غير معروف',
      customerPhone: customerData?.phone || null,
      customerEmail: customerData?.email || null,
      serviceId: orderData.serviceId || null,
      serviceName: serviceData?.name || null,
      employeeId: orderData.employeeId || null,
      employeeName: employeeData?.name || null,
      amount: orderData.total || 0,
      discount: orderData.discount || 0,
      tax: orderData.tax || 0,
      total: orderData.total || 0,
      paid: orderData.paid || 0,
      balance: orderData.balance || 0,
      status: orderData.status || 'جديد',
      createdAt: serverTimestamp()
    };

    // حفظ الفاتورة في Firestore
    const docRef = await addDoc(collection(db, 'invoices'), invoiceData);
    showToast('تم إنشاء الفاتورة بنجاح', 'success');
    createInvoiceModalInstance.hide();

    // عرض الفاتورة فوراً
    viewInvoice(docRef.id);
  } catch (error) {
    console.error('Error creating invoice:', error);
    showToast('حدث خطأ أثناء إنشاء الفاتورة', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-file-pdf me-2"></i>إنشاء الفاتورة';
  }
});

// ============================
// 11. عرض الفاتورة (معاينة)
// ============================
async function viewInvoice(invoiceId) {
  try {
    const invoiceDoc = await getDoc(doc(db, 'invoices', invoiceId));
    if (!invoiceDoc.exists()) {
      showToast('الفاتورة غير موجودة', 'error');
      return;
    }
    const invoice = invoiceDoc.data();
    currentInvoiceId = invoiceId;

    // بناء HTML لعرض الفاتورة
    const previewDiv = document.getElementById('invoicePreview');
    previewDiv.innerHTML = generateInvoiceHTML(invoice);

    // إنشاء QR Code
    const qrContainer = document.getElementById('qrCodeContainer');
    if (qrContainer) {
      qrContainer.innerHTML = '';
      const qrCode = new QRCode(qrContainer, {
        text: window.location.href + '?invoice=' + invoiceId,
        width: 100,
        height: 100,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    }

    viewInvoiceModalInstance.show();
  } catch (error) {
    console.error('Error viewing invoice:', error);
    showToast('حدث خطأ في عرض الفاتورة', 'error');
  }
}

// ============================
// 12. إنشاء HTML للفاتورة
// ============================
function generateInvoiceHTML(invoice) {
  // بيانات الشركة (افتراضية - يمكن إضافتها من الإعدادات لاحقاً)
  const companyName = 'شركة الأعمال المتكاملة';
  const companyAddress = 'الرياض، المملكة العربية السعودية';
  const companyPhone = '+966 55 123 4567';
  const companyEmail = 'info@company.com';
  const companyLogo = 'https://via.placeholder.com/100x50?text=LOGO'; // يمكن تغييره لاحقاً

  const statusBadge = {
    'جديد': 'bg-info text-dark',
    'قيد التنفيذ': 'bg-warning text-dark',
    'مكتمل': 'bg-success text-white',
    'ملغي': 'bg-danger text-white'
  }[invoice.status] || 'bg-secondary';

  return `
    <div id="invoiceContent" style="direction: rtl; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <!-- رأس الفاتورة -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 20px; margin-bottom: 20px;">
        <div>
          <img src="${companyLogo}" alt="شعار الشركة" style="max-height: 60px; margin-bottom: 10px;" />
          <h2 style="margin: 0; font-weight: 700; color: #1a202c;">${companyName}</h2>
          <p style="margin: 4px 0; color: #4a5568;">${companyAddress}</p>
          <p style="margin: 4px 0; color: #4a5568;">📞 ${companyPhone}</p>
          <p style="margin: 4px 0; color: #4a5568;">✉️ ${companyEmail}</p>
        </div>
        <div style="text-align: left;">
          <h1 style="font-weight: 700; color: #4f46e5; margin: 0;">فاتورة</h1>
          <p style="margin: 4px 0; font-size: 14px; color: #4a5568;"><strong>رقم الفاتورة:</strong> ${invoice.invoiceNumber}</p>
          <p style="margin: 4px 0; font-size: 14px; color: #4a5568;"><strong>التاريخ:</strong> ${formatDate(invoice.createdAt)}</p>
          <p style="margin: 4px 0; font-size: 14px; color: #4a5568;"><span class="badge ${statusBadge}">${invoice.status}</span></p>
        </div>
      </div>

      <!-- بيانات العميل والطلب -->
      <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
        <div>
          <h5 style="font-weight: 600; color: #1a202c; margin-bottom: 4px;">بيانات العميل</h5>
          <p style="margin: 4px 0; color: #4a5568;"><strong>الاسم:</strong> ${invoice.customerName || 'غير معروف'}</p>
          <p style="margin: 4px 0; color: #4a5568;"><strong>الهاتف:</strong> ${invoice.customerPhone || '-'}</p>
          <p style="margin: 4px 0; color: #4a5568;"><strong>البريد:</strong> ${invoice.customerEmail || '-'}</p>
        </div>
        <div>
          <h5 style="font-weight: 600; color: #1a202c; margin-bottom: 4px;">بيانات الطلب</h5>
          <p style="margin: 4px 0; color: #4a5568;"><strong>رقم الطلب:</strong> #${invoice.orderNumber || 'N/A'}</p>
          <p style="margin: 4px 0; color: #4a5568;"><strong>الخدمة:</strong> ${invoice.serviceName || '-'}</p>
          <p style="margin: 4px 0; color: #4a5568;"><strong>الموظف:</strong> ${invoice.employeeName || '-'}</p>
        </div>
      </div>

      <!-- تفاصيل المبلغ -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead style="background: #f8f9fa;">
          <tr>
            <th style="padding: 10px; text-align: right; border: 1px solid #dee2e6;">البيان</th>
            <th style="padding: 10px; text-align: center; border: 1px solid #dee2e6;">القيمة ($)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 8px; border: 1px solid #dee2e6;">سعر الخدمة</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6;">${invoice.amount?.toFixed(2) || '0.00'}</td>
          </tr>
          ${invoice.discount ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #dee2e6;">الخصم</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6;">-${invoice.discount.toFixed(2)}</td>
          </tr>` : ''}
          ${invoice.tax ? `
          <tr>
            <td style="padding: 8px; border: 1px solid #dee2e6;">الضريبة (${invoice.tax}%)</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6;">${((invoice.amount - (invoice.discount||0)) * invoice.tax / 100).toFixed(2)}</td>
          </tr>` : ''}
          <tr style="font-weight: bold; background: #f8f9fa;">
            <td style="padding: 10px; border: 1px solid #dee2e6;">الإجمالي</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #dee2e6;">${invoice.total?.toFixed(2) || '0.00'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #dee2e6;">المدفوع</td>
            <td style="padding: 8px; text-align: center; border: 1px solid #dee2e6;">${invoice.paid?.toFixed(2) || '0.00'}</td>
          </tr>
          <tr style="font-weight: bold; color: ${invoice.balance > 0 ? '#dc3545' : '#10b981'};">
            <td style="padding: 10px; border: 1px solid #dee2e6;">المتبقي</td>
            <td style="padding: 10px; text-align: center; border: 1px solid #dee2e6;">${invoice.balance?.toFixed(2) || '0.00'}</td>
          </tr>
        </tbody>
      </table>

      <!-- QR Code -->
      <div style="display: flex; justify-content: center; align-items: center; gap: 20px; padding: 10px 0; border-top: 1px solid #dee2e6; margin-top: 20px;">
        <div id="qrCodeContainer" style="text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #6c757d;">QR Code للفاتورة</p>
        </div>
        <div style="text-align: center; color: #6c757d; font-size: 12px;">
          <p style="margin: 0;">شكراً لك على ثقتك</p>
          <p style="margin: 0;">نظام إدارة الأعمال</p>
        </div>
      </div>
    </div>
  `;
}

// ============================
// 13. حذف فاتورة
// ============================
async function confirmDelete(id) {
  const invoice = invoices.find(i => i.id === id);
  if (!invoice) return;

  const result = await Swal.fire({
    title: 'هل أنت متأكد؟',
    text: `سيتم حذف الفاتورة ${invoice.invoiceNumber} نهائيًا.`,
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
// 14. طباعة الفاتورة
// ============================
document.getElementById('printInvoiceBtn').addEventListener('click', () => {
  const content = document.getElementById('invoiceContent');
  if (content) {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html dir="rtl">
        <head><title>طباعة الفاتورة</title></head>
        <body style="margin:0;padding:20px;">${content.outerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }
});

// ============================
// 15. تحميل PDF (باستخدام html2canvas + jsPDF)
// ============================
document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
  const content = document.getElementById('invoiceContent');
  if (!content) return;

  const btn = document.getElementById('downloadPdfBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري التحميل...';

  try {
    const canvas = await html2canvas(content, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    pdf.save(`فاتورة_${Date.now()}.pdf`);
    showToast('تم تحميل PDF بنجاح', 'success');
  } catch (error) {
    console.error('Error generating PDF:', error);
    showToast('حدث خطأ في إنشاء PDF', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-download me-2"></i>تحميل PDF';
  }
});

// ============================
// 16. مشاركة الفاتورة (نسخ الرابط)
// ============================
document.getElementById('shareInvoiceBtn').addEventListener('click', () => {
  const url = window.location.href + '?invoice=' + currentInvoiceId;
  if (navigator.share) {
    navigator.share({
      title: 'الفاتورة',
      text: 'تفاصيل الفاتورة',
      url: url
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url).then(() => {
      showToast('تم نسخ رابط الفاتورة', 'info');
    }).catch(() => {
      showToast('الرابط: ' + url, 'info');
    });
  }
});

// ============================
// 17. إرسال عبر واتساب
// ============================
document.getElementById('whatsappBtn').addEventListener('click', () => {
  const url = window.location.href + '?invoice=' + currentInvoiceId;
  const message = `مرحباً، هذه فاتورتك: ${url}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
});

console.log('✅ صفحة الفواتير جاهزة');
