import { onAuthStateChangedCallback, logoutUser, loginUser } from './auth.js';

console.log('app.js loaded');

const currentPage = window.location.pathname.split('/').pop() || 'index.html';
console.log('Current page:', currentPage);

// ----- index.html (التوجيه) -----
if (currentPage === 'index.html' || currentPage === '') {
  console.log('Running index page logic');
  onAuthStateChangedCallback((user) => {
    console.log('Auth state changed:', user);
    if (user) {
      window.location.href = 'dashboard.html';
    } else {
      window.location.href = 'login.html';
    }
  });
}

// ----- login.html -----
if (currentPage === 'login.html') {
  console.log('Running login page logic');
  const form = document.getElementById('loginForm');
  const errorDiv = document.getElementById('loginError');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      errorDiv.style.display = 'none';
      errorDiv.innerText = '';

      const btn = document.getElementById('loginBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري التحقق...';

      try {
        await loginUser(email, password);
        window.location.href = 'dashboard.html';
      } catch (error) {
        let msg = 'حدث خطأ، تحقق من البيانات.';
        if (error.code === 'auth/user-not-found') msg = 'البريد الإلكتروني غير مسجل.';
        else if (error.code === 'auth/wrong-password') msg = 'كلمة المرور غير صحيحة.';
        else if (error.code === 'auth/invalid-email') msg = 'البريد الإلكتروني غير صحيح.';
        else if (error.code === 'auth/too-many-requests') msg = 'تم حظر الحساب مؤقتاً، حاول لاحقاً.';
        errorDiv.innerText = msg;
        errorDiv.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>تسجيل الدخول';
      }
    });

    // تبديل كلمة المرور
    const toggleBtn = document.getElementById('togglePassword');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        const pass = document.getElementById('password');
        const icon = this.querySelector('i');
        if (pass.type === 'password') {
          pass.type = 'text';
          icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
          pass.type = 'password';
          icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
      });
    }
  }
}

// ----- dashboard.html -----
if (currentPage === 'dashboard.html') {
  console.log('Running dashboard page logic');
  onAuthStateChangedCallback((user) => {
    console.log('Dashboard auth state:', user);
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userUid').textContent = user.uid;
    document.getElementById('userName').textContent = user.displayName || user.email;
  });

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await logoutUser();
      window.location.href = 'login.html';
    });
  }
}
