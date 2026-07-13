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
  where,
  writeBatch
} from 'firebase/firestore';

// ============================
// متغيرات عامة
// ============================
let orders = [];
let editingId = null;
let ordersListener = null;
let orderModalInstance = null;

// قوائم للقوائم المنسدلة
let customersList = [];
let servicesList = [];
let employeesList = [];

// مراحل التنفيذ الثابتة
const STAGES = [
  'استلام',
  'مراجعة',
  'تصميم',
  'تطوير',
  'اختبار',
  'مراجعة نهائية',
  'تسليم',
  'إغلاق'
];

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
  
  // تحميل القوائم المطلوبة للمودال ثم الاستماع للطلبات
  loadSelectOptions().then(() => {
    listenToOrders();
  });
});

// ============================
// 2. تسجيل الخروج وتبديل الوضع
// ============================
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await logoutUser();
  window.location.href = '../login.html';
});

// تبديل الوضع المظلم
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

// تبديل Sidebar للشاشات الصغيرة
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ============================
// 3. تهيئة Modal
// ============================
const modalElement = document.getElementById('orderModal');
if (modalElement) {
  orderModalInstance = new bootstrap.Modal(modalElement, { backdrop: 'static' });
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
// 5. تحميل قوائم العملاء والخدمات والموظفين للمودال
// ============================
async function loadSelectOptions() {
  try {
    // العملاء
    const customersSnap = await getDocs(collection(db, 'customers'));
    customersList = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // الخدمات
    const servicesSnap = await getDocs(collection(db, 'services'));
    servicesList = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // الموظفين (النشطين فقط)
    const employeesQuery = query(collection(db, 'employees'), where('status', '==', 'نشط'));
    const employeesSnap = await getDocs(employeesQuery);
    employeesList = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // تعبئة القوائم المنسدلة في المودال (سيتم استدعاؤها قبل فتح المودال)
    populateSelects();
  } catch (error) {
    console.error('Error loading select options:', error);
    showToast('حدث خطأ في تحميل البيانات الأساسية', 'error');
  }
}

function populateSelects() {
  const customerSelect = document.getElementById('customer');
  const serviceSelect = document.getElementById('service');
  const employeeSelect = document.getElementById('employee');

  // تنظيف الخيارات مع الاحتفاظ بالخيار الفارغ
  customerSelect.innerHTML = '<option value="">اختر عميل...</option>';
  serviceSelect.innerHTML = '<option value="">اختر خدمة...</option>';
  employeeSelect.innerHTML = '<option value="">اختر موظف...</option>';

  customersList.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    customerSelect.appendChild(opt);
  });

  servicesList.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} ($${s.price})`;
    opt.dataset.price = s.price;
    serviceSelect.appendChild(opt);
  });

  employeesList.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = e.name;
    employeeSelect.appendChild(opt);
  });
}

// ============================
// 6. قراءة الطلبات من Firestore (Realtime)
// ============================
function listenToOrders() {
  const ordersRef = collection(db, 'orders');
  const q = query(ordersRef, orderBy('createdAt', 'desc'));

  if (ordersListener) {
    ordersListener();
  }

  ordersListener = onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      orders = [];
      renderTable([]);
      document.getElementById('resultCount').textContent = 'عرض 0 طلب';
      return;
    }

    orders = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // تحويل التواريخ إلى كائنات Date إذا لزم
        deadline: data.deadline ? data.deadline.toDate ? data.deadline.toDate() : data.deadline : null,
        createdAt: data.createdAt ? data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt : null
      };
    });

    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const filtered = searchTerm ? filterOrders(searchTerm) : orders;
    renderTable(filtered);
    document.getElementById('resultCount').textContent = `عرض ${filtered.length} طلب`;
  }, (error) => {
    console.error('Error listening to orders:', error);
    showToast('حدث خطأ في تحميل الطلبات', 'error');
  });
}

// ============================
// 7. عرض الجدول
// ============================
function renderTable(data) {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">لا يوجد طلبات</td></tr>`;
    return;
  }

  let html = '';
  data.forEach((order) => {
    // إيجاد اسم العميل والخدمة والموظف من المعرفات
    const customer = customersList.find(c => c.id === order.customerId);
    const service = servicesList.find(s => s.id === order.serviceId);
    const employee = employeesList.find(e => e.id === order.employeeId);

    const statusClass = {
      'جديد': 'badge bg-info text-dark',
      'قيد التنفيذ': 'badge bg-warning text-dark',
      'مكتمل': 'badge bg-success',
      'ملغي': 'badge bg-danger'
    }[order.status] || 'badge bg-secondary';

    const priorityClass = {
      'عالية': 'text-danger',
      'متوسطة': 'text-warning',
      'منخفضة': 'text-success'
    }[order.priority] || '';

    const completionRate = order.completionRate || 0;
    const total = order.total || 0;
    const paid = order.paid || 0;
    const remaining = total - paid;

    html += `
      <tr>
        <td><strong>#${order.orderNumber || 'N/A'}</strong></td>
        <td>${customer ? escapeHtml(customer.name) : 'غير معروف'}</td>
        <td>${service ? escapeHtml(service.name) : 'غير معروف'}</td>
        <td>${employee ? escapeHtml(employee.name) : 'غير معروف'}</td>
        <td><span class="${statusClass}">${escapeHtml(order.status || 'جديد')}</span></td>
        <td class="${priorityClass}">${escapeHtml(order.priority || 'متوسطة')}</td>
        <td>$${total.toFixed(2)}</td>
        <td>$${remaining.toFixed(2)}</td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="progress flex-grow-1" style="height: 6px; min-width: 50px;">
              <div class="progress-bar bg-primary" style="width: ${completionRate}%"></div>
            </div>
            <span class="small">${completionRate}%</span>
          </div>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${order.id}" title="تعديل">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${order.id}" title="حذف">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
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

// ============================
// 8. البحث والفلترة
// ============================
function filterOrders(term) {
  return orders.filter(o => {
    const customer = customersList.find(c => c.id === o.customerId);
    const customerName = customer ? customer.name.toLowerCase() : '';
    return (o.orderNumber && o.orderNumber.toLowerCase().includes(term)) ||
           customerName.includes(term);
  });
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  const filtered = term ? filterOrders(term) : orders;
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `عرض ${filtered.length} طلب`;
});

// ============================
// 9. فتح مودال الإضافة
// ============================
document.getElementById('addOrderBtn').addEventListener('click', () => {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'طلب جديد';
  document.getElementById('orderForm').reset();
  document.getElementById('orderId').value = '';
  // ضبط القيم الافتراضية
  document.getElementById('status').value = 'جديد';
  document.getElementById('priority').value = 'متوسطة';
  document.getElementById('discount').value = 0;
  document.getElementById('tax').value = 0;
  document.getElementById('paid').value = 0;
  document.getElementById('price').value = '';
  document.getElementById('total').value = '';
  // تعبئة مراحل التنفيذ
  renderStages([]);
  // تحديث الإجمالي عند تغيير السعر أو الخصم أو الضريبة
  document.getElementById('price').addEventListener('input', calculateTotal);
  document.getElementById('discount').addEventListener('input', calculateTotal);
  document.getElementById('tax').addEventListener('input', calculateTotal);
  // تعبئة القوائم المنسدلة (تم تحميلها مسبقاً)
  populateSelects();
  // تفعيل Flatpickr للتاريخ
  flatpickr('#deadline', {
    locale: 'ar',
    dateFormat: 'Y-m-d',
    minDate: 'today'
  });
  orderModalInstance.show();
});

// ============================
// 10. فتح مودال التعديل
// ============================
function openEditModal(id) {
  const order = orders.find(o => o.id === id);
  if (!order) {
    showToast('الطلب غير موجود', 'error');
    return;
  }

  editingId = id;
  document.getElementById('modalTitle').textContent = 'تعديل الطلب';
  document.getElementById('orderId').value = id;
  document.getElementById('customer').value = order.customerId || '';
  document.getElementById('service').value = order.serviceId || '';
  document.getElementById('employee').value = order.employeeId || '';
  document.getElementById('deadline').value = order.deadline ? formatDate(order.deadline) : '';
  document.getElementById('price').value = order.price || '';
  document.getElementById('discount').value = order.discount || 0;
  document.getElementById('tax').value = order.tax || 0;
  document.getElementById('paid').value = order.paid || 0;
  document.getElementById('status').value = order.status || 'جديد';
  document.getElementById('priority').value = order.priority || 'متوسطة';
  document.getElementById('notes').value = order.notes || '';

  // تعبئة مراحل التنفيذ
  renderStages(order.stages || []);
  // حساب الإجمالي
  calculateTotal();

  // إضافة مستمعي الأحداث للحساب
  document.getElementById('price').addEventListener('input', calculateTotal);
  document.getElementById('discount').addEventListener('input', calculateTotal);
  document.getElementById('tax').addEventListener('input', calculateTotal);

  // تفعيل Flatpickr
  flatpickr('#deadline', {
    locale: 'ar',
    dateFormat: 'Y-m-d',
    minDate: 'today'
  });

  orderModalInstance.show();
}

// ============================
// 11. حساب الإجمالي
// ============================
function calculateTotal() {
  const price = parseFloat(document.getElementById('price').value) || 0;
  const discount = parseFloat(document.getElementById('discount').value) || 0;
  const taxRate = parseFloat(document.getElementById('tax').value) || 0;
  const total = price - discount + (price - discount) * (taxRate / 100);
  document.getElementById('total').value = total.toFixed(2);
  return total;
}

// ============================
// 12. عرض مراحل التنفيذ
// ============================
function renderStages(savedStages) {
  const container = document.getElementById('stagesContainer');
  container.innerHTML = '';

  // إنشاء مصفوفة المراحل مع حالة الإكمال من savedStages أو false
  const stagesWithStatus = STAGES.map((stage, index) => {
    const found = savedStages.find(s => s.stage === stage);
    return {
      stage,
      completed: found ? found.completed : false
    };
  });

  stagesWithStatus.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'form-check';
    div.innerHTML = `
      <input class="form-check-input stage-checkbox" type="checkbox" id="stage_${index}" 
        data-stage="${item.stage}" ${item.completed ? 'checked' : ''}>
      <label class="form-check-label" for="stage_${index}">
        ${item.stage}
      </label>
    `;
    container.appendChild(div);
  });

  // إضافة مستمعي الأحداث لحساب النسبة
  document.querySelectorAll('.stage-checkbox').forEach(cb => {
    cb.addEventListener('change', updateCompletionRate);
  });

  // تحديث النسبة
  updateCompletionRate();
}

function updateCompletionRate() {
  const checkboxes = document.querySelectorAll('.stage-checkbox');
  const checked = document.querySelectorAll('.stage-checkbox:checked').length;
  const total = checkboxes.length;
  const rate = total > 0 ? Math.round((checked / total) * 100) : 0;
  document.getElementById('completionBadge').textContent = `نسبة الإنجاز: ${rate}%`;
  return rate;
}

// ============================
// 13. حفظ البيانات (إضافة / تعديل)
// ============================
document.getElementById('saveOrderBtn').addEventListener('click', async () => {
  const customerId = document.getElementById('customer').value;
  const serviceId = document.getElementById('service').value;
  const employeeId = document.getElementById('employee').value;
  const price = parseFloat(document.getElementById('price').value) || 0;
  
  if (!customerId || !serviceId || !employeeId || price <= 0) {
    showToast('يرجى اختيار العميل والخدمة والموظف وتحديد سعر صحيح', 'warning');
    return;
  }

  // جمع مراحل التنفيذ
  const stageCheckboxes = document.querySelectorAll('.stage-checkbox');
  const stages = Array.from(stageCheckboxes).map(cb => ({
    stage: cb.dataset.stage,
    completed: cb.checked
  }));

  const completionRate = updateCompletionRate();

  // حساب الإجمالي
  const total = calculateTotal();
  const paid = parseFloat(document.getElementById('paid').value) || 0;

  const data = {
    customerId,
    serviceId,
    employeeId,
    price,
    discount: parseFloat(document.getElementById('discount').value) || 0,
    tax: parseFloat(document.getElementById('tax').value) || 0,
    total,
    paid,
    status: document.getElementById('status').value,
    priority: document.getElementById('priority').value,
    notes: document.getElementById('notes').value.trim(),
    stages,
    completionRate,
    deadline: document.getElementById('deadline').value || null,
    updatedAt: new Date().toISOString()
  };

  const id = document.getElementById('orderId').value;
  const saveBtn = document.getElementById('saveOrderBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري الحفظ...';

  try {
    if (id) {
      await updateDoc(doc(db, 'orders', id), data);
      showToast('تم تحديث الطلب بنجاح', 'success');
    } else {
      // إنشاء رقم طلب تلقائي: ORD-YYYYMMDD-XXX
      const now = new Date();
      const dateStr = now.toISOString().slice(0,10).replace(/-/g,'');
      // نأخذ عدد الطلبات الحالي +1 (تقريبي)
      const count = orders.length + 1;
      const orderNumber = `ORD-${dateStr}-${String(count).padStart(3, '0')}`;
      data.orderNumber = orderNumber;
      data.createdAt = new Date().toISOString();
      await addDoc(collection(db, 'orders'), data);
      showToast('تم إضافة الطلب بنجاح', 'success');
    }
    orderModalInstance.hide();
  } catch (error) {
    console.error('Error saving order:', error);
    showToast('حدث خطأ أثناء الحفظ', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fas fa-save me-2"></i>حفظ';
  }
});

// ============================
// 14. حذف طلب مع تأكيد
// ============================
async function confirmDelete(id) {
  const order = orders.find(o => o.id === id);
  if (!order) return;

  const result = await Swal.fire({
    title: 'هل أنت متأكد؟',
    text: `سيتم حذف الطلب #${order.orderNumber} نهائيًا.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'نعم، احذف',
    cancelButtonText: 'إلغاء'
  });

  if (result.isConfirmed) {
    try {
      await deleteDoc(doc(db, 'orders', id));
      showToast('تم حذف الطلب بنجاح', 'success');
    } catch (error) {
      console.error('Error deleting order:', error);
      showToast('حدث خطأ أثناء الحذف', 'error');
    }
  }
}

// ============================
// 15. إعادة تعيين النموذج عند الإغلاق
// ============================
modalElement?.addEventListener('hidden.bs.modal', () => {
  document.getElementById('orderForm').reset();
  document.getElementById('orderId').value = '';
  // إزالة مستمعي الأحداث لمنع التراكم
  document.getElementById('price').removeEventListener('input', calculateTotal);
  document.getElementById('discount').removeEventListener('input', calculateTotal);
  document.getElementById('tax').removeEventListener('input', calculateTotal);
});

// ============================
// 16. دالة مساعدة لتنسيق التاريخ
// ============================
function formatDate(date) {
  if (!date) return '';
  if (typeof date === 'string') return date;
  if (date instanceof Date) return date.toISOString().slice(0,10);
  return '';
}

console.log('✅ صفحة الطلبات جاهزة');
