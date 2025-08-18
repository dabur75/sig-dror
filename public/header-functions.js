// ========== AUTH & HEADER FUNCTIONS ==========
// בדיקת הרשאות - אם המשתמש לא מחובר, העבר לדף התחברות
var role = localStorage.getItem('role');
if (!role) {
    window.location.href = "login.html";
}

// ========== MOBILE MENU FUNCTIONS ==========
// Mobile menu functionality
window.toggleMobileMenu = function() {
  const nav = document.querySelector('#main-navbar nav');
  const hamburger = document.querySelector('.hamburger-menu');
  const overlay = document.querySelector('.mobile-menu-overlay');
  
  if (!nav || !hamburger) return;
  
  nav.classList.toggle('active');
  hamburger.classList.toggle('active');
  
  if (overlay) {
    overlay.classList.toggle('active');
  }
  
  // Prevent body scroll when menu is open
  if (nav.classList.contains('active')) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = 'auto';
  }
};

window.closeMobileMenu = function() {
  const nav = document.querySelector('#main-navbar nav');
  const hamburger = document.querySelector('.hamburger-menu');
  const overlay = document.querySelector('.mobile-menu-overlay');
  
  if (!nav || !hamburger) return;
  
  nav.classList.remove('active');
  hamburger.classList.remove('active');
  
  if (overlay) {
    overlay.classList.remove('active');
  }
  
  document.body.style.overflow = 'auto';
};

// Update mobile user info when header user info is updated
function updateMobileUserInfo() {
  const desktopUser = document.getElementById('header-user');
  const desktopRole = document.getElementById('header-role');
  const mobileUser = document.getElementById('mobile-header-user');
  const mobileRole = document.getElementById('mobile-header-role');
  
  if (desktopUser && mobileUser) {
    mobileUser.textContent = desktopUser.textContent;
  }
  if (desktopRole && mobileRole) {
    mobileRole.textContent = desktopRole.textContent;
  }
}

// ========== HEADER USER RENDERING ==========
// פונקציה להצגת שם המשתמש והתפקיד
function renderHeaderUser(retryCount = 0) {
    console.log('renderHeaderUser called, retry count:', retryCount);
    var userSpan = document.getElementById("header-user");
    var roleSpan = document.getElementById("header-role");
    var schedulerLink = document.getElementById("scheduler-link");
    var guideName = localStorage.getItem("name") || "";
    var role = localStorage.getItem("role");
    
    console.log('userSpan:', userSpan);
    console.log('roleSpan:', roleSpan);
    console.log('schedulerLink:', schedulerLink);
    console.log('guideName:', guideName);
    console.log('role:', role);

    // אם האלמנטים לא קיימים, נסה שוב אחרי זמן קצר (עד 10 ניסיונות)
    if ((!userSpan || !roleSpan) && retryCount < 10) {
      console.log('Elements not found, retrying... (attempt ' + (retryCount + 1) + ')');
      setTimeout(() => {
        renderHeaderUser(retryCount + 1);
      }, 200);
      return;
    }

    if (userSpan) {
      userSpan.textContent = guideName ? guideName : (role === "רכז" ? "רכז/רכזת" : "מדריך/ה");
      console.log('Set userSpan text to:', userSpan.textContent);
    }
    if (roleSpan) {
      if (role === "רכז" || role === "רכזת") {
        roleSpan.textContent = (role === "רכזת" ? "רכזת" : "רכז");
      } else if (role === "מדריך" || role === "מדריכה") {
        roleSpan.textContent = (role === "מדריכה" ? "מדריכה" : "מדריך");
      } else {
        roleSpan.textContent = "";
      }
      console.log('Set roleSpan text to:', roleSpan.textContent);
    }
    
    // הצג/הסתר כפתור שיבוץ לפי התפקיד
    if (schedulerLink) {
      schedulerLink.style.display = (role === "רכז" || role === "רכזת") ? "inline-block" : "none";
      console.log('Scheduler link display set to:', schedulerLink.style.display);
    }
    
    // הצג/הסתר כפתור דוחות לפי התפקיד
    var reportsLink = document.getElementById("reports-link");
    if (reportsLink) {
      reportsLink.style.display = (role === "רכז" || role === "רכזת") ? "inline-block" : "none";
      console.log('Reports link display set to:', reportsLink.style.display);
    }
    
    // Update mobile user info after header is rendered
    setTimeout(updateMobileUserInfo, 100);
}

// ========== EVENT LISTENERS ==========
// פונקציית התנתקות
window.logout = function() {
  localStorage.clear();
  window.location.href = "login.html";
};

// Setup mobile menu event listeners
function setupMobileMenu() {
  // Close menu when clicking on a link
  const navLinks = document.querySelectorAll('#main-navbar nav a[href]');
  navLinks.forEach(link => {
    link.addEventListener('click', closeMobileMenu);
  });
  
  // Close menu on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeMobileMenu();
    }
  });
}

// הפעלת הפונקציה כשהדף נטען
document.addEventListener("DOMContentLoaded", function() {
    renderHeaderUser();
    setupMobileMenu();
});

// הפעלת הפונקציה גם אם הדף כבר נטען
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        renderHeaderUser();
        setupMobileMenu();
    });
} else {
    renderHeaderUser();
    setupMobileMenu();
} 