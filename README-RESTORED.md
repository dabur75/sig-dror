# 🚀 SIGALIT PROJECT - RESTORED & READY

## ✅ RESTORATION COMPLETE

The Sigalit project has been successfully restored from backup with the following structure:

```
sigalit-backend/
├── app.js                 # Main backend application (4,767 lines)
├── public/               # Frontend files served by backend
│   ├── dashboard.html    # Main dashboard
│   ├── login.html        # Login page
│   ├── schedule.html     # Schedule management
│   ├── scheduler.html    # Advanced scheduler
│   ├── reports.html      # Reports and analytics
│   ├── tasks.html        # Task management
│   ├── constraints.html  # Constraint management
│   ├── guides.html       # Guide management
│   └── ... (other HTML files)
├── sigalit.db           # SQLite database
├── package.json         # Dependencies
└── start-dev.sh         # Development startup script
```

## 🚀 QUICK START

### 1. Install Dependencies
```bash
cd LocalSites/sigalit-backend
npm install
```

### 2. Start Development Server
```bash
./start-dev.sh
```

### 3. Access the Application
- **Frontend:** http://localhost:4000
- **Backend API:** http://localhost:4000/api/*

## 🔧 FEATURES

### Backend (Node.js + Express)
- ✅ Complete scheduling system
- ✅ User management (guides, coordinators)
- ✅ Constraint management
- ✅ Vacation requests
- ✅ Task management
- ✅ Reports and analytics
- ✅ SQLite database
- ✅ RESTful API endpoints

### Frontend (HTML + CSS + JavaScript)
- ✅ Modern responsive design
- ✅ Hebrew RTL support
- ✅ Dashboard interface
- ✅ Schedule management
- ✅ Advanced scheduler
- ✅ Reports and analytics
- ✅ User management

## 📊 DATABASE

- **Type:** SQLite
- **File:** `sigalit.db`
- **Tables:** users, schedule, constraints, vacations, tasks, conversations, etc.
- **Data:** All original data preserved

## 🌐 API ENDPOINTS

- `GET /api/guides` - Get all guides
- `GET /api/schedule/:year/:month` - Get schedule for month
- `GET /api/constraints` - Get user constraints
- `GET /api/vacations` - Get vacation requests
- `GET /api/tasks` - Get tasks
- `GET /api/reports/*` - Various report endpoints
- And many more...

## 🛠️ DEVELOPMENT

- **Port:** 4000 (configurable via PORT environment variable)
- **Auto-restart:** Uses nodemon for development
- **Static files:** Served from `public/` directory
- **CORS:** Enabled for cross-origin requests

## 🔒 SECURITY

- Input validation on all endpoints
- SQL injection protection via prepared statements
- CORS configuration
- Error handling and logging

## 📱 BROWSER SUPPORT

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive design
- Hebrew language support with RTL layout

---

**Status:** ✅ Fully restored and operational  
**Last Updated:** August 6, 2025  
**Backup Source:** Complete project backup from production
