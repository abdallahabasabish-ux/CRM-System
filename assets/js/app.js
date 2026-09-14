// ============================================
//  في app.js - استبدل الكود الحالي بهذا
// ============================================

if (currentPage === 'dashboard.html') {
    onAuthStateChangedCallback((user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        // ✅ الحل: استخدام دالة آمنة لتحديث العناصر
        safeSetText('userEmail', user.email || '');
        safeSetText('userUid', user.uid || '');
        safeSetText('userName', user.displayName || user.email || 'مستخدم');

        console.log('✅ Dashboard auth state updated:', user.email);
    });

    // زر تسجيل الخروج
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await logoutUser();
                window.location.href = 'login.html';
            } catch (error) {
                console.error('Logout error:', error);
                window.location.href = 'login.html';
            }
        });
    }
}

// ============================================
//  دوال مساعدة آمنة - أضفها في أعلى app.js
// ============================================

/**
 * تحديث textContent بأمان (يتجنب الخطأ إذا كان العنصر غير موجود)
 */
function safeSetText(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
        return true;
    }
    // تسجيل تحذير فقط في وضع التطوير
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.warn(`⚠️ Element with id="${elementId}" not found in DOM`);
    }
    return false;
}

/**
 * تحديث innerHTML بأمان
 */
function safeSetHTML(elementId, html) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = html;
        return true;
    }
    return false;
}

/**
 * تحديث قيمة input بأمان
 */
function safeSetValue(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.value = value;
        return true;
    }
    return false;
}

/**
 * إظهار/إخفاء عنصر بأمان
 */
function safeToggle(elementId, show) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = show ? '' : 'none';
        return true;
    }
    return false;
}
