import { onAuthStateChangedCallback, logoutUser } from './auth.js';

// ============================
// 1. التحقق من المصادقة
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
});

// ============================
// 2. تسجيل الخروج
// ============================
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await logoutUser();
    window.location.href = 'login.html';
  });
}

// ============================
// 3. تبديل الوضع المظلم (Dark Mode)
// ============================
const themeToggle = document.getElementById('themeToggle');
const htmlElement = document.documentElement;

// استعادة التفضيل المحفوظ
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

// ============================
// 4. تبديل الـ Sidebar (للشاشات الصغيرة)
// ============================
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
    // إظهار/إخفاء الطبقة المظللة
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.classList.toggle('active');
  });
}

// ============================
// 5. إغلاق القائمة الجانبية عند النقر على الطبقة المظللة
// ============================
const overlay = document.getElementById('sidebar-overlay');
if (overlay) {
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
  });
}

// ============================
// 6. الرسوم البيانية (Chart.js)
// ============================
if (typeof Chart !== 'undefined') {
  // مخطط دائري - توزيع الخدمات
  const ctx1 = document.getElementById('servicesChart');
  if (ctx1) {
    new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: ['تصميم', 'تطوير', 'تسويق', 'استشارات'],
        datasets: [{
          data: [35, 40, 15, 10],
          backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        cutout: '65%',
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // مخطط شريطي - الطلبات الشهرية
  const ctx2 = document.getElementById('ordersChart');
  if (ctx2) {
    new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
        datasets: [{
          label: 'الطلبات',
          data: [65, 78, 82, 91, 74, 102],
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
  }
}

console.log('✅ Dashboard ready');
