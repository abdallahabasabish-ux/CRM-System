// =============================================================
// login.js - معالجة تسجيل الدخول والتسجيل و Google
// =============================================================
import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// =============================================================
// 1.  دوال مساعدة (Toast)
// =============================================================
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
    alert(message);
  }
}

// =============================================================
// 2.  الوضع المظلم
// =============================================================
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

// =============================================================
// 3.  تبديل إظهار/إخفاء كلمة المرور
// =============================================================
document.getElementById('toggleLoginPassword')?.addEventListener('click', function() {
  const input = document.getElementById('loginPassword');
  const icon = this.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
});

document.getElementById('toggleRegisterPassword')?.addEventListener('click', function() {
  const input = document.getElementById('registerPassword');
  const icon = this.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
});

document.getElementById('toggleRegisterConfirm')?.addEventListener('click', function() {
  const input = document.getElementById('registerConfirm');
  const icon = this.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
});

// =============================================================
// 4.  تسجيل الدخول بالبريد وكلمة المرور
// =============================================================
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  errorDiv.style.display = 'none';
  errorDiv.textContent = '';
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري...';

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    let msg = 'حدث خطأ، تحقق من البيانات.';
    if (error.code === 'auth/user-not-found') msg = 'البريد الإلكتروني غير مسجل.';
    else if (error.code === 'auth/wrong-password') msg = 'كلمة المرور غير صحيحة.';
    else if (error.code === 'auth/invalid-email') msg = 'البريد الإلكتروني غير صحيح.';
    else if (error.code === 'auth/too-many-requests') msg = 'تم حظر الحساب مؤقتاً، حاول لاحقاً.';
    errorDiv.textContent = msg;
    errorDiv.style.display = 'block';
    showToast(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>تسجيل الدخول';
  }
});

// =============================================================
// 5.  إنشاء حساب جديد
// =============================================================
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const confirm = document.getElementById('registerConfirm').value;
  const errorDiv = document.getElementById('registerError');
  const btn = document.getElementById('registerBtn');

  errorDiv.style.display = 'none';
  errorDiv.textContent = '';

  if (password !== confirm) {
    errorDiv.textContent = 'كلمة المرور وتأكيدها غير متطابقين.';
    errorDiv.style.display = 'block';
    showToast('كلمة المرور غير متطابقة', 'error');
    return;
  }
  if (password.length < 6) {
    errorDiv.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
    errorDiv.style.display = 'block';
    showToast('كلمة المرور ضعيفة', 'error');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري...';

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (name) {
      await updateProfile(user, { displayName: name });
    }

    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName: name || user.email,
      role: 'موظف',
      disabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    showToast('تم إنشاء الحساب بنجاح!', 'success');
  } catch (error) {
    let msg = 'حدث خطأ أثناء التسجيل.';
    if (error.code === 'auth/email-already-in-use') msg = 'البريد الإلكتروني مستخدم بالفعل.';
    else if (error.code === 'auth/invalid-email') msg = 'البريد الإلكتروني غير صحيح.';
    else if (error.code === 'auth/weak-password') msg = 'كلمة المرور ضعيفة (6 أحرف على الأقل).';
    errorDiv.textContent = msg;
    errorDiv.style.display = 'block';
    showToast(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus me-2"></i>إنشاء حساب';
  }
});

// =============================================================
// 6.  تسجيل الدخول عبر Google
// =============================================================
const provider = new GoogleAuthProvider();

async function handleGoogleSignIn() {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        displayName: user.displayName || user.email,
        role: 'موظف',
        disabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Google sign-in error:', error);
    let msg = 'فشل تسجيل الدخول عبر Google.';
    if (error.code === 'auth/popup-closed-by-user') msg = 'تم إغلاق النافذة المنبثقة.';
    else if (error.code === 'auth/cancelled-popup-request') msg = 'تم إلغاء الطلب.';
    else if (error.code === 'auth/account-exists-with-different-credential') {
      msg = 'يوجد حساب بنفس البريد الإلكتروني. يرجى استخدام طريقة تسجيل الدخول الأخرى.';
    }
    showToast(msg, 'error');
  }
}

document.getElementById('googleLoginBtn')?.addEventListener('click', handleGoogleSignIn);
document.getElementById('googleRegisterBtn')?.addEventListener('click', handleGoogleSignIn);

// =============================================================
// 7.  نسيت كلمة المرور
// =============================================================
document.getElementById('forgotPasswordLink')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const { value: email } = await Swal.fire({
    title: 'استعادة كلمة المرور',
    input: 'email',
    inputLabel: 'أدخل بريدك الإلكتروني',
    inputPlaceholder: 'example@company.com',
    showCancelButton: true,
    confirmButtonText: 'إرسال',
    cancelButtonText: 'إلغاء',
    inputValidator: (value) => {
      if (!value) return 'يرجى إدخال البريد الإلكتروني';
      if (!value.includes('@')) return 'بريد إلكتروني غير صحيح';
    }
  });

  if (email) {
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.', 'success');
    } catch (error) {
      let msg = 'حدث خطأ.';
      if (error.code === 'auth/user-not-found') msg = 'لا يوجد حساب بهذا البريد.';
      showToast(msg, 'error');
    }
  }
});

// =============================================================
// 8.  مراقبة حالة المصادقة (التوجيه التلقائي)
// =============================================================
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = 'dashboard.html';
  }
});

// =============================================================
// 9.  التهيئة
// =============================================================
initDarkMode();
console.log('✅ Login page ready');
