// assets/js/dashboard.js
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
  document.getElementById('sidebarUserName').textContent = user.displayName || user.email;
  document.getElementById('sidebarUserEmail').textContent = user.email;
  document.getElementById('sidebarAvatar').textContent = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
});

// ============================
// 2. تسجيل الخروج
// ============================
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await logoutUser();
  window.location.href = 'login.html';
});

// ============================
// 3. تبديل الوضع المظلم (Dark Mode)
// ============================
const themeToggle = document.getElementById('themeToggle');
const htmlElement = document.documentElement;

// استعادة التفضيل المحفوظ
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

// ============================
// 4. تبديل الـ Sidebar (للشاشات الصغيرة)
// ============================
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ============================
// 5. الرسوم البيانية (Chart.js) - اختياري
// ============================
if (typeof Chart !== 'undefined') {
  const ctx1 = document.getElementById('servicesChart')?.getContext('2d');
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

  const ctx2 = document.getElementById('ordersChart')?.getContext('2d');
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
