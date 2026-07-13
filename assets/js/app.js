// ----- صفحة index.html: التوجيه التلقائي -----
if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
  onAuthStateChanged(user => {
    if (user) {
      // مستخدم مسجل الدخول → لوحة التحكم
      window.location.href = 'dashboard.html';
    } else {
      // غير مسجل → صفحة تسجيل الدخول
      window.location.href = 'login.html';
    }
  });
}

// ----- صفحة login.html: معالجة نموذج الدخول -----
if (window.location.pathname.endsWith('login.html')) {
  const form = document.getElementById('loginForm');
  const errorDiv = document.getElementById('loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // إخفاء أي خطأ سابق
    errorDiv.style.display = 'none';
    errorDiv.innerText = '';

    // تعطيل الزر مؤقتاً
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري التحقق...';

    try {
      await loginUser(email, password);
      // نجاح → التوجيه تلقائياً عن طريق onAuthStateChanged
      window.location.href = 'dashboard.html';
    } catch (error) {
      let msg = 'حدث خطأ، تحقق من البيانات وحاول مرة أخرى.';
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

  // إظهار/إخفاء كلمة المرور
  document.getElementById('togglePassword').addEventListener('click', function() {
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

// ----- صفحة dashboard.html: عرض بيانات المستخدم + زر الخروج -----
if (window.location.pathname.endsWith('dashboard.html')) {
  onAuthStateChanged(user => {
    if (!user) {
      // غير مسجل → اذهب لتسجيل الدخول
      window.location.href = 'login.html';
      return;
    }
    // عرض المعلومات
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userUid').textContent = user.uid;
    document.getElementById('userName').textContent = user.displayName || user.email;
  });

  // زر تسجيل الخروج
  document.getElementById('logoutBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    await logoutUser();
    window.location.href = 'login.html';
  });
}
