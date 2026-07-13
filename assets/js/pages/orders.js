import { onAuthStateChangedCallback, logoutUser } from '../auth.js';
import { db } from '../firebase-config.js';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, getDocs, where, writeBatch
} from 'firebase/firestore';

let orders = [];
let editingId = null;
let ordersListener = null;
let customersList = [];
let servicesList = [];
let employeesList = [];
const STAGES = ['استلام','مراجعة','تصميم','تطوير','اختبار','مراجعة نهائية','تسليم','إغلاق'];

// ============================
// 1. المصادقة
// ============================
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
  
  await loadSelectOptions();
  listenToOrders();
});

// ============================
// 2. تسجيل الخروج وتبديل الوضع
// ============================
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await logoutUser();
  window.location.href = '../login.html';
});

// ... (كود تبديل الوضع و Sidebar مشابه للصفحات الأخرى، سأختصر هنا)

// ============================
// 3. تحميل القوائم المنسدلة
// ============================
async function loadSelectOptions() {
  try {
    const customersSnap = await getDocs(collection(db, 'customers'));
    customersList = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const servicesSnap = await getDocs(collection(db, 'services'));
    servicesList = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const employeesQuery = query(collection(db, 'employees'), where('status', '==', 'نشط'));
    const employeesSnap = await getDocs(employeesQuery);
    employeesList = employeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
  if (customerSelect) {
    customerSelect.innerHTML = '<option value="">اختر عميل...</option>';
    customersList.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      customerSelect.appendChild(opt);
    });
  }
  // ... (نفس الشيء للخدمات والموظفين)
}

// ============================
// 4. قراءة الطلبات (Realtime)
// ============================
function listenToOrders() {
  const ordersRef = collection(db, 'orders');
  const q = query(ordersRef, orderBy('createdAt', 'desc'));
  if (ordersListener) ordersListener();

  ordersListener = onSnapshot(q, (snapshot) => {
    // ... (نفس المنطق السابق)
    renderTable(filtered);
  }, error => showToast('حدث خطأ في تحميل الطلبات', 'error'));
}

// ============================
// 5. عرض الجدول
// ============================
function renderTable(data) {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  // ... (نفس الكود السابق مع استخدام escapeHtml وبناء الصفوف)
}

// ============================
// 6. دوال المودال (الإضافة، التعديل، الحفظ، الحذف)
// ============================
// ... (نفس الكود السابق مع إضافة التحقق من وجود العناصر)

console.log('✅ صفحة الطلبات جاهزة');
