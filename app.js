const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 4000;
const Database = require('better-sqlite3');

// Use Fly.io data directory for production, local directory for development
const dbPath = process.env.NODE_ENV === 'production' ? '/data/sigalit.db' : 'sigalit.db';
const db = new Database(dbPath);

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS constraints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    details TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS fixed_constraints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    weekday INTEGER NOT NULL,
    hour_start TEXT,
    hour_end TEXT,
    details TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS vacations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date_start TEXT NOT NULL,
    date_end TEXT NOT NULL,
    note TEXT,
    status TEXT,
    response_note TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY,
    updated_at TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS overrides_activities (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    facilitator TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY,
    patient TEXT NOT NULL,
    reason TEXT NOT NULL,
    doctor TEXT NOT NULL,
    date TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    weekday TEXT NOT NULL,
    type TEXT NOT NULL,
    guide1_id INTEGER,
    guide2_id INTEGER,
    guide1_name TEXT,
    guide2_name TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS schedule_draft (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    weekday TEXT NOT NULL,
    type TEXT NOT NULL,
    guide1_id INTEGER,
    guide2_id INTEGER,
    name TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    day TEXT NOT NULL,
    handover_guide_id INTEGER,
    regular_guide_id INTEGER
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    created_at TEXT,
    creator_id INTEGER,
    assigned_to_id INTEGER,
    status TEXT,
    shift_date TEXT,
    notes TEXT,
    closed_by_id INTEGER,
    closed_at TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS weekly_activities (
    id INTEGER PRIMARY KEY,
    weekday TEXT NOT NULL,
    time TEXT NOT NULL,
    duration TEXT,
    title TEXT NOT NULL,
    category TEXT,
    facilitator TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    conversation_id INTEGER NOT NULL,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS scheduling_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'manual_only', 'prevent_pair', 'no_oncall', 'manual_weekend_consecutive', 'no_weekends'
    guide_id INTEGER NOT NULL,
    guide2_id INTEGER, -- nullable, only for prevent_pair
    created_by INTEGER,
    created_at TEXT,
    description TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS shabbat_status (
    date TEXT PRIMARY KEY, -- שבת date (YYYY-MM-DD)
    status TEXT NOT NULL -- 'סגורה' or 'פתוחה'
  )
`).run();

// Create coordinator rules table for dynamic scheduling rules
db.prepare(`
  CREATE TABLE IF NOT EXISTS coordinator_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_type TEXT NOT NULL,
    guide1_id INTEGER,
    guide2_id INTEGER,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_by INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guide1_id) REFERENCES users(id),
    FOREIGN KEY (guide2_id) REFERENCES users(id)
  )
`).run();

// Create indexes for coordinator rules
db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_coordinator_rules_type 
  ON coordinator_rules(rule_type, is_active)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_coordinator_rules_guides 
  ON coordinator_rules(guide1_id, guide2_id, is_active)
`).run();

// No automatic rule insertion - rules should only be created by users

app.use(cors());
app.use(express.json());

// --- Add password column to users if missing ---
try {
  db.prepare('ALTER TABLE users ADD COLUMN password TEXT').run();
  console.log('Added password column to users table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding password column:', e.message);
  }
}
// --- Add email column to users if missing ---
try {
  db.prepare('ALTER TABLE users ADD COLUMN email TEXT').run();
  console.log('Added email column to users table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding email column:', e.message);
  }
}
// --- Add phone column to users if missing ---
try {
  db.prepare('ALTER TABLE users ADD COLUMN phone TEXT').run();
  console.log('Added phone column to users table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding phone column:', e.message);
  }
}
// --- Add percent column to users if missing ---
try {
  db.prepare('ALTER TABLE users ADD COLUMN percent INTEGER').run();
  console.log('Added percent column to users table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding percent column:', e.message);
  }
}

// =====================================================
// STEP 1: DATABASE SCHEMA UPDATES FOR AUTO-SCHEDULING
// =====================================================

console.log('Starting database schema updates for auto-scheduling...');

// Add missing columns to schedule table
try {
  db.prepare('ALTER TABLE schedule ADD COLUMN guide1_name TEXT').run();
  console.log('✓ Added guide1_name column to schedule table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding guide1_name column:', e.message);
  }
}

try {
  db.prepare('ALTER TABLE schedule ADD COLUMN guide1_role TEXT').run();
  console.log('✓ Added guide1_role column to schedule table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding guide1_role column:', e.message);
  }
}

try {
  db.prepare('ALTER TABLE schedule ADD COLUMN guide2_name TEXT').run();
  console.log('✓ Added guide2_name column to schedule table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding guide2_name column:', e.message);
  }
}

try {
  db.prepare('ALTER TABLE schedule ADD COLUMN guide2_role TEXT').run();
  console.log('✓ Added guide2_role column to schedule table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding guide2_role column:', e.message);
  }
}

try {
  db.prepare('ALTER TABLE schedule ADD COLUMN is_manual INTEGER DEFAULT 0').run();
  console.log('✓ Added is_manual column to schedule table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding is_manual column:', e.message);
  }
}

try {
  db.prepare('ALTER TABLE schedule ADD COLUMN is_locked INTEGER DEFAULT 0').run();
  console.log('✓ Added is_locked column to schedule table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding is_locked column:', e.message);
  }
}

try {
  db.prepare('ALTER TABLE schedule ADD COLUMN created_by INTEGER').run();
  console.log('✓ Added created_by column to schedule table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding created_by column:', e.message);
  }
}

try {
  db.prepare('ALTER TABLE schedule ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
  console.log('✓ Added created_at column to schedule table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding created_at column:', e.message);
  }
}

try {
  db.prepare('ALTER TABLE schedule ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
  console.log('✓ Added updated_at column to schedule table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding updated_at column:', e.message);
  }
}

// Add missing columns to users table
try {
  db.prepare('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1').run();
  console.log('✓ Added is_active column to users table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding is_active column:', e.message);
  }
}

try {
  db.prepare('ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
  console.log('✓ Added created_at column to users table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding created_at column:', e.message);
  }
}

try {
  db.prepare('ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
  console.log('✓ Added updated_at column to users table.');
} catch (e) {
  if (!e.message.includes('duplicate column name')) {
    console.error('Error adding updated_at column:', e.message);
  }
}

console.log('✅ Step 1: Database schema updates completed');

// =====================================================
// STEP 2: CREATE ADDITIONAL REQUIRED TABLES
// =====================================================

console.log('Creating additional tables for auto-scheduling...');

// Create weekend_types table for better API consistency
db.prepare(`
  CREATE TABLE IF NOT EXISTS weekend_types (
    date TEXT PRIMARY KEY,
    is_closed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Create drafts table for draft management
db.prepare(`
  CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    version INTEGER NOT NULL,
    name TEXT,
    data TEXT NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`).run();

// Create assignment_types table
db.prepare(`
  CREATE TABLE IF NOT EXISTS assignment_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Create shift_types table
db.prepare(`
  CREATE TABLE IF NOT EXISTS shift_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    guides_required INTEGER DEFAULT 2,
    roles_required TEXT,
    start_time TEXT,
    end_time TEXT,
    duration_hours DECIMAL(4,2),
    salary_factor DECIMAL(3,2) DEFAULT 1.0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Create audit_log table
db.prepare(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    old_values TEXT,
    new_values TEXT,
    user_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`).run();

// Create indexes for better performance
db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_schedule_date 
  ON schedule(date)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_schedule_guides 
  ON schedule(guide1_id, guide2_id)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_schedule_manual 
  ON schedule(is_manual, is_locked)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_constraints_user_date 
  ON constraints(user_id, date)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_fixed_constraints_user_weekday 
  ON fixed_constraints(user_id, weekday)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_vacations_user_dates 
  ON vacations(user_id, date_start, date_end)
`).run();

// Insert default assignment types
db.prepare(`
  INSERT OR IGNORE INTO assignment_types (id, name, description) VALUES
  (1, 'רגיל', 'משמרת רגילה - 09:00 עד 09:00 למחרת'),
  (2, 'חפיפה', 'משמרת חפיפה - 09:00 עד 10:00 למחרת'),
  (3, 'כונן', 'כונן שבת סגורה - שישי 09:00 עד שבת 17:00'),
  (4, 'מוצ״ש', 'מוצאי שבת - שבת 17:00 עד ראשון 09:00')
`).run();

// Insert default shift types (using existing schema)
db.prepare(`
  INSERT OR IGNORE INTO shift_types (id, name, description, guides_required, roles_required) VALUES
  (1, 'weekday', 'יום חול רגיל', 2, '["רגיל", "חפיפה"]'),
  (2, 'weekend_open', 'סוף שבוע פתוח', 2, '["רגיל", "חפיפה"]'),
  (3, 'weekend_closed', 'סוף שבוע סגור', 1, '["כונן"]'),
  (4, 'holiday', 'חג', 2, '["רגיל", "חפיפה"]')
`).run();

// Migrate shabbat_status to weekend_types for API consistency
try {
  const shabbatStatuses = db.prepare('SELECT * FROM shabbat_status').all();
  const insertWeekendType = db.prepare(`
    INSERT OR REPLACE INTO weekend_types (date, is_closed, created_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
  `);
  
  shabbatStatuses.forEach(status => {
    const isClosed = status.status === 'סגורה' ? 1 : 0;
    insertWeekendType.run(status.date, isClosed);
  });
  
  console.log(`✓ Migrated ${shabbatStatuses.length} weekend types from shabbat_status`);
} catch (error) {
  console.error('Error migrating weekend types:', error);
}

console.log('✅ Step 2: Additional tables created successfully');

// =====================================================
// WORKFLOW SYSTEM DATABASE TABLES
// Add this after your existing CREATE TABLE statements
// =====================================================

console.log('Creating workflow tables...');

// Create official_schedules table for finalized schedules
db.prepare(`
  CREATE TABLE IF NOT EXISTS official_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    schedule_data TEXT NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    notes TEXT,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`).run();

// Create schedule_history table for all past schedules
db.prepare(`
  CREATE TABLE IF NOT EXISTS schedule_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    schedule_type TEXT NOT NULL, -- 'draft', 'official'
    version INTEGER NOT NULL,
    schedule_data TEXT NOT NULL,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    action TEXT, -- 'created', 'modified', 'sent_to_guides', 'finalized'
    notes TEXT,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`).run();

// Create email_logs table to track email sending
db.prepare(`
  CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    draft_version INTEGER NOT NULL,
    recipient_id INTEGER,
    recipient_email TEXT,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    email_content TEXT,
    FOREIGN KEY (recipient_id) REFERENCES users(id)
  )
`).run();

// Create workflow_status table to track current workflow state
db.prepare(`
  CREATE TABLE IF NOT EXISTS workflow_status (
    month TEXT PRIMARY KEY,
    current_draft_version INTEGER DEFAULT 0,
    is_finalized INTEGER DEFAULT 0,
    finalized_at DATETIME,
    finalized_by INTEGER,
    last_email_sent_version INTEGER DEFAULT 0,
    last_email_sent_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (finalized_by) REFERENCES users(id)
  )
`).run();

console.log('✅ Workflow tables created successfully');

// --- Database is now primary data source (no guides.json) ---
console.log('Using database for all data - no JSON files needed');

const users = db.prepare('SELECT * FROM users').all();

// --- GUIDES ---
app.get('/api/guides', (req, res) => {
  // Fetch all users for conversation mapping
  const guides = db.prepare("SELECT * FROM users").all();
  res.json(guides);
});
app.post('/api/guides', (req, res) => {
  const { name, role, password, email, phone, percent } = req.body;
  if (!name || !role) return res.status(400).json({ error: 'Missing name or role' });
  const stmt = db.prepare(`INSERT INTO users (name, role, password, email, phone, percent) VALUES (?, ?, ?, ?, ?, ?)`);
  const info = stmt.run(name, role, password || '', email || '', phone || '', percent || 100);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(user);
});
app.put('/api/guides/:id', (req, res) => {
  const { name, role, password, email, phone, percent } = req.body;
  const id = req.params.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'לא נמצא' });
  const stmt = db.prepare(`UPDATE users SET name = ?, role = ?, password = ?, email = ?, phone = ?, percent = ? WHERE id = ?`);
  stmt.run(name || user.name, role || user.role, password || user.password, email || user.email, phone || user.phone, percent || user.percent || 100, id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  res.json(updated);
});
app.delete('/api/guides/:id', (req, res) => {
  const id = req.params.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'לא נמצא' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// --- CONSTRAINTS ---
const CONSTRAINTS_FILE = './constraints.json';
function loadConstraints() {
    if (!fs.existsSync(CONSTRAINTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(CONSTRAINTS_FILE));
}
function saveConstraints(constraints) {
    fs.writeFileSync(CONSTRAINTS_FILE, JSON.stringify(constraints, null, 2));
}
app.get('/api/constraints', (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.name as guideName
    FROM constraints c
    LEFT JOIN users u ON c.user_id = u.id
  `).all();
  const constraints = rows.map(row => ({
    ...row,
    guideId: row.user_id, // always provide guideId
    note: row.details // map details to note for frontend compatibility
  }));
  res.json(constraints);
});
app.post('/api/constraints', (req, res) => {
  const { guideId, date, hourStart, hourEnd, note, type } = req.body;
  const stmt = db.prepare('INSERT INTO constraints (user_id, type, date, details) VALUES (?, ?, ?, ?)');
  const info = stmt.run(guideId, type || 'constraint', date, note || '');
  const constraint = db.prepare('SELECT * FROM constraints WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...constraint, guideId: constraint.user_id, note: constraint.details });
});
app.put('/api/constraints/:id', (req, res) => {
  const { guideId, date, hourStart, hourEnd, note, type } = req.body;
  const id = req.params.id;
  const constraint = db.prepare('SELECT * FROM constraints WHERE id = ?').get(id);
  if (!constraint) return res.status(404).json({ error: 'לא נמצא' });
  db.prepare('UPDATE constraints SET user_id = ?, type = ?, date = ?, details = ? WHERE id = ?')
    .run(guideId, type || 'constraint', date, note || '', id);
  const updated = db.prepare('SELECT * FROM constraints WHERE id = ?').get(id);
  res.json({ ...updated, guideId: updated.user_id, note: updated.details });
});
app.delete('/api/constraints/:id', (req, res) => {
  const id = req.params.id;
  const constraint = db.prepare('SELECT * FROM constraints WHERE id = ?').get(id);
  if (!constraint) return res.status(404).json({ error: 'לא נמצא' });
  db.prepare('DELETE FROM constraints WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ------- SCHEDULE (שיבוץ חודשי אוטומטי לפי שבתות מהפרונט) -------

function runScheduler({year, month, weekendsType}) {
    const guides = loadGuides();
    const constraints = loadConstraints();
    const fixedConstraints = loadFixedConstraints();
    const vacations = loadVacations();
    let manualAssignments = [];
    try {
        manualAssignments = require('./manual_assignments.json');
    } catch (e) { manualAssignments = []; }

    const hebrewWeekdays = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

    function getAllDaysInMonth(year, month) {
        let days = [];
        for (
            let d = new Date(year, month-1, 1);
            d.getMonth() === month-1;
            d.setDate(d.getDate() + 1)
        ) {
            days.push(new Date(d));
        }
        return days;
    }
    const days = getAllDaysInMonth(year, month);

    function hasConstraint(guideId, date) {
        if (constraints.some(c => c.guideId === guideId && c.date === date)) return true;
        if (fixedConstraints.some(fc => fc.guideId === guideId && fc.weekday === new Date(date).getDay())) return true;
        if (vacations.some(v => v.guideId === guideId && v.status === 'approved' && v.dateStart <= date && v.dateEnd >= date)) return true;
        return false;
    }

    function getManualAssignment(date) {
        return manualAssignments.find(m => m.date === date);
    }

    let guideQueue = guides.filter(g => g.role === 'מדריך');
    let guideCursor = 0;

    function getNextAvailableGuides(date, howMany, skipGuides=[]) {
        let found = [];
        let checked = 0, i = guideCursor;
        while (found.length < howMany && checked < guideQueue.length * 2) {
            let g = guideQueue[i % guideQueue.length];
            if (
                !hasConstraint(g.id, date) &&
                !found.includes(g) &&
                !skipGuides.includes(g.name)
            ) {
                found.push(g);
            }
            i++;
            checked++;
        }
        guideCursor = (guideCursor + 1) % guideQueue.length;
        return found;
    }

    const result = days.map(d => {
        const iso = d.toISOString().slice(0,10);
        return {
            date: iso,
            weekday: 'יום ' + hebrewWeekdays[d.getDay()],
            weekendType: weekendsType[iso] || null
        };
    });

    let schedule = [];
    let lastShabbatConan = null;

    for (let i = 0; i < result.length; i++) {
        let day = result[i];
        let date = day.date;
        let weekdayNum = new Date(date).getDay();
        let guidesCount = 2;
        let roles = ['רגיל', 'רגיל'];

        if (day.weekendType === 'שבת סגורה') {
            guidesCount = 1;
            roles = ['כונן'];
        }

        const manual = getManualAssignment(date);
        if (manual) {
            let guidesNames = manual.guides.map(id => {
                const g = guides.find(g=>g.id === id);
                return g ? g.name : '';
            });
            schedule.push({
                date,
                weekday: day.weekday,
                weekendType: day.weekendType,
                guides: guidesNames,
                roles: manual.roles,
                alert: false,
                manual: true
            });
            if (day.weekendType === 'שבת סגורה' && guidesNames[0]) {
                lastShabbatConan = {
                    guideName: guidesNames[0],
                    date: date
                };
            }
            continue;
        }

        let skipGuides = [];
        if (
            weekdayNum === 0 &&
            lastShabbatConan &&
            new Date(date) - new Date(lastShabbatConan.date) === 24*60*60*1000
        ) {
            skipGuides = [lastShabbatConan.guideName];
            lastShabbatConan = null;
        }

        let available = getNextAvailableGuides(date, guidesCount, skipGuides);

        let alert = false;
        if (available.length < guidesCount) {
            alert = true;
            while (available.length < guidesCount) {
                available.push({ name: "" });
            }
        }

        schedule.push({
            date,
            weekday: day.weekday,
            weekendType: day.weekendType,
            guides: available.map(g=>g.name),
            roles: roles.slice(0, guidesCount),
            alert
        });

        if (day.weekendType === 'שבת סגורה' && available[0] && available[0].name) {
            lastShabbatConan = {
                guideName: available[0].name,
                date: date
            };
        }
    }

    return schedule;
}

// =====================================================
// STEP 3: COMPLETE AUTO-SCHEDULING ALGORITHM
// =====================================================

console.log('Loading auto-scheduling algorithm...');

// Auto-scheduling endpoint
app.post('/api/schedule/auto-schedule/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    console.log(`Starting auto-scheduling for ${year}-${month}`);
    
    const result = await runCompleteAutoScheduling(parseInt(year), parseInt(month));
    
    if (result.success) {
      res.json({
        success: true,
        message: `Auto-scheduling completed: ${result.stats.assigned} assignments created`,
        stats: result.stats,
        warnings: result.warnings,
        assignments: result.assignments
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: result.error,
        warnings: result.warnings || []
      });
    }
  } catch (error) {
    console.error('Auto-scheduling error:', error);
    res.status(500).json({ error: 'Auto-scheduling failed', details: error.message });
  }
});

// =====================================================
// MAIN AUTO-SCHEDULING FUNCTION
// =====================================================

async function runCompleteAutoScheduling(year, month) {
  try {
    console.log(`Initializing auto-scheduling for ${year}-${month}`);
    
    // Phase 1: Prepare all data
    const context = await prepareSchedulingData(year, month);
    console.log(`Loaded ${context.guides.length} guides, ${context.days.length} days`);
    
    // Phase 2: Process each day
    const assignments = [];
    const warnings = [];
    
    for (const dayInfo of context.days) {
      console.log(`Processing ${dayInfo.date} (${dayInfo.weekday})`);
      
      try {
        const assignment = await assignDayOptimal(dayInfo, context);
        if (assignment) {
          assignments.push(assignment);
          updateContextWithAssignment(context, assignment);
          console.log(`✓ Assigned ${dayInfo.date}: ${assignment.guide1_name || 'none'} + ${assignment.guide2_name || 'none'}`);
        } else {
          warnings.push({
            type: 'assignment_failed',
            date: dayInfo.date,
            message: `Failed to assign guides for ${dayInfo.date}`
          });
          console.log(`✗ Failed to assign ${dayInfo.date}`);
        }
      } catch (error) {
        console.error(`Error assigning ${dayInfo.date}:`, error);
        warnings.push({
          type: 'assignment_error',
          date: dayInfo.date,
          message: `Error assigning ${dayInfo.date}: ${error.message}`
        });
      }
    }
    
    // Phase 3: Save to database
    if (assignments.length > 0) {
      await saveAssignmentsToDatabase(assignments, year, month);
    }
    
    // Phase 4: Generate final statistics
    const finalStats = generateFinalStatistics(context, assignments);
    
    return {
      success: true,
      stats: finalStats,
      warnings: warnings,
      assignments: assignments
    };
    
  } catch (error) {
    console.error('Auto-scheduling failed:', error);
    return {
      success: false,
      error: error.message,
      warnings: []
    };
  }
}

// =====================================================
// PHASE 1: DATA PREPARATION
// =====================================================

async function prepareSchedulingData(year, month) {
  // Load all required data
  const guides = db.prepare("SELECT * FROM users WHERE role = 'מדריך' AND COALESCE(is_active, 1) = 1").all();
  const constraints = db.prepare("SELECT * FROM constraints").all();
  const fixedConstraints = db.prepare("SELECT * FROM fixed_constraints").all();
  const vacations = db.prepare("SELECT * FROM vacations WHERE status = 'approved'").all();
  const coordinatorRules = db.prepare("SELECT * FROM coordinator_rules WHERE is_active = 1").all();
  const existingSchedule = db.prepare("SELECT * FROM schedule WHERE date LIKE ?").all(`${year}-${String(month).padStart(2, '0')}-%`);
  
  // Load weekend types
  const weekendTypes = {};
  const weekendRows = db.prepare("SELECT * FROM weekend_types WHERE strftime('%Y-%m', date) = ?").all(`${year}-${String(month).padStart(2, '0')}`);
  weekendRows.forEach(row => {
    weekendTypes[row.date] = row.is_closed === 1 ? 'סגורה' : 'פתוחה';
  });
  
  // Generate all days in month
  const days = getAllDaysInMonth(year, month).map(date => {
    const dateStr = date.toISOString().split('T')[0];
    const weekday = getHebrewWeekday(date.getDay());
    const weekendType = weekendTypes[dateStr] || null;
    
    return {
      date: dateStr,
      weekday: weekday,
      weekdayNum: date.getDay(),
      weekendType: weekendType,
      isWeekend: date.getDay() === 5 || date.getDay() === 6, // Friday or Saturday
      requirements: null // Will be calculated later
    };
  });
  
  // Initialize guide statistics
  const guideStats = {};
  guides.forEach(guide => {
    guideStats[guide.id] = {
      totalShifts: 0,
      weekdayShifts: 0,
      weekendShifts: 0,
      standbyShifts: 0,
      regularShifts: 0,
      overlapShifts: 0,
      motzashShifts: 0,
      lastShiftDate: null,
      totalHours: 0,
      totalSalaryFactor: 0,
      weeklyShifts: {}, // week start date -> count
      consecutiveDays: []
    };
  });
  
  // Process existing manual assignments
  const manualAssignments = {};
  existingSchedule.forEach(assignment => {
    if (assignment.is_manual) {
      manualAssignments[assignment.date] = assignment;
      
      // Update statistics for manual assignments
      if (assignment.guide1_id) {
        updateGuideStatsForAssignment(guideStats[assignment.guide1_id], assignment.date, assignment.guide1_role || 'רגיל');
      }
      if (assignment.guide2_id) {
        updateGuideStatsForAssignment(guideStats[assignment.guide2_id], assignment.date, assignment.guide2_role || 'רגיל');
      }
    }
  });
  
  return {
    guides,
    constraints,
    fixedConstraints,
    vacations,
    coordinatorRules,
    weekendTypes,
    days,
    guideStats,
    manualAssignments,
    year,
    month,
    averageShiftsPerGuide: 0 // Will be calculated during assignment
  };
}

// Helper function to get Hebrew weekday name
function getHebrewWeekday(dayIndex) {
  const weekdays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return weekdays[dayIndex];
}

console.log('✅ Step 3: Auto-scheduling algorithm core loaded');

// =====================================================
// STEP 4: DAY-BY-DAY ASSIGNMENT LOGIC
// =====================================================

// =====================================================
// PHASE 2: DAY-BY-DAY ASSIGNMENT
// =====================================================

async function assignDayOptimal(dayInfo, context) {
  const { date, weekday, weekdayNum, weekendType } = dayInfo;
  
  // Skip if manually assigned
  if (context.manualAssignments[date]) {
    console.log(`Skipping manually assigned day: ${date}`);
    return context.manualAssignments[date];
  }
  
  // Determine requirements for this day
  const requirements = getDayRequirements(dayInfo, context);
  dayInfo.requirements = requirements;
  
  console.log(`Day ${date} requirements:`, requirements);
  
  // Handle special case: closed Saturday weekend
  if (requirements.isClosedSaturday) {
    return await handleClosedSaturdayWeekend(dayInfo, context);
  }
  
  // Get available guides with scores
  const guidesWithAvailability = await Promise.all(
    context.guides.map(async guide => {
      const availability = await validateGuideAvailability(guide, date, context);
      return {
        ...guide,
        availability
      };
    })
  );
  
  // Filter available guides and sort by score
  const availableGuides = guidesWithAvailability
    .filter(guide => guide.availability.available)
    .sort((a, b) => a.availability.score - b.availability.score);
  
  console.log(`Available guides for ${date}: ${availableGuides.length}/${context.guides.length}`);
  
  // If no guides available, try override soft constraints
  if (availableGuides.length === 0) {
    console.log(`No available guides for ${date}, trying soft constraint override`);
    const overrideGuides = await tryOverrideSoftConstraints(guidesWithAvailability, date, context);
    if (overrideGuides.length > 0) {
      return await selectOptimalGuides(overrideGuides, requirements, context, date);
    } else {
      console.log(`Cannot assign any guides for ${date} - will notify coordinator`);
      return null; // Will create warning
    }
  }
  
  // Select optimal guides
  return await selectOptimalGuides(availableGuides, requirements, context, date);
}

function getDayRequirements(dayInfo, context) {
  const { date, weekday, weekdayNum, weekendType } = dayInfo;
  
  // Check if this is a closed Saturday Friday
  if (weekdayNum === 5) { // Friday
    const saturdayDate = new Date(date);
    saturdayDate.setDate(saturdayDate.getDate() + 1);
    const saturdayDateStr = saturdayDate.toISOString().split('T')[0];
    const saturdayWeekendType = context.weekendTypes[saturdayDateStr];
    
    if (saturdayWeekendType === 'סגורה') {
      return {
        guidesNeeded: 1,
        roles: ['כונן'],
        type: 'standby',
        isClosedSaturdayFriday: true,
        linkedSaturday: saturdayDateStr
      };
    }
  }
  
  // Check if this is a closed Saturday
  if (weekdayNum === 6 && weekendType === 'סגורה') { // Saturday
    return {
      guidesNeeded: 2, // conan from Friday + motzash
      roles: ['כונן', 'מוצ״ש'],
      type: 'closed_saturday',
      isClosedSaturday: true,
      requiresMotzash: true
    };
  }
  
  // Regular days (including open Saturday, holidays)
  return {
    guidesNeeded: 2,
    roles: ['רגיל', 'חפיפה'],
    type: 'regular',
    isWeekend: weekdayNum === 5 || weekdayNum === 6
  };
}

async function handleClosedSaturdayWeekend(fridayInfo, context) {
  const { date: fridayDate } = fridayInfo;
  
  // Get Saturday date
  const saturdayDate = new Date(fridayDate);
  saturdayDate.setDate(saturdayDate.getDate() + 1);
  const saturdayDateStr = saturdayDate.toISOString().split('T')[0];
  
  console.log(`Handling closed Saturday weekend: ${fridayDate} -> ${saturdayDateStr}`);
  
  // Find best standby guide for Friday
  const fridayAvailable = await Promise.all(
    context.guides.map(async guide => {
      const availability = await validateGuideAvailability(guide, fridayDate, context);
      // Additional check: standby limit
      if (availability.available && context.guideStats[guide.id].standbyShifts >= 2) {
        availability.available = false;
        availability.reason = 'כבר עבד כונן פעמיים החודש';
      }
      return { ...guide, availability };
    })
  );
  
  const availableForStandby = fridayAvailable
    .filter(guide => guide.availability.available)
    .sort((a, b) => a.availability.score - b.availability.score);
  
  if (availableForStandby.length === 0) {
    console.log(`No available standby guides for closed Saturday ${fridayDate}`);
    return null;
  }
  
  const standbyGuide = availableForStandby[0];
  console.log(`Selected standby guide: ${standbyGuide.name} for ${fridayDate}-${saturdayDateStr}`);
  
  // Return Friday assignment
  return {
    date: fridayDate,
    weekday: getHebrewWeekday(new Date(fridayDate).getDay()),
    type: 'כונן',
    guide1_id: standbyGuide.id,
    guide1_name: standbyGuide.name,
    guide1_role: 'כונן',
    guide2_id: null,
    guide2_name: null,
    guide2_role: null,
    is_manual: false,
    is_locked: false,
    created_by: null,
    linkedSaturday: saturdayDateStr,
    standbyGuideId: standbyGuide.id, // For Saturday processing
  };
}

async function selectOptimalGuides(availableGuides, requirements, context, date) {
  if (availableGuides.length === 0) {
    return null;
  }
  
  const { guidesNeeded, roles, type } = requirements;
  
  // Handle closed Saturday (Saturday day)
  if (type === 'closed_saturday') {
    // Find the standby guide from Friday
    const fridayDate = new Date(date);
    fridayDate.setDate(fridayDate.getDate() - 1);
    const fridayDateStr = fridayDate.toISOString().split('T')[0];
    
    const fridayAssignment = context.manualAssignments[fridayDateStr];
    let standbyGuide = null;
    
    if (fridayAssignment && fridayAssignment.standbyGuideId) {
      standbyGuide = context.guides.find(g => g.id === fridayAssignment.standbyGuideId);
    }
    
    // Select motzash guide
    const motzashCandidates = availableGuides.filter(g => g.id !== standbyGuide?.id);
    const motzashGuide = motzashCandidates[0];
    
    return {
      date: date,
      weekday: getHebrewWeekday(new Date(date).getDay()),
      type: 'מוצ״ש',
      guide1_id: standbyGuide?.id || null,
      guide1_name: standbyGuide?.name || null,
      guide1_role: 'כונן',
      guide2_id: motzashGuide?.id || null,
      guide2_name: motzashGuide?.name || null,
      guide2_role: 'מוצ״ש',
      is_manual: false,
      is_locked: false,
      created_by: null
    };
  }
  
  // Handle standby assignment (Friday for closed Saturday)
  if (type === 'standby') {
    const standbyGuide = availableGuides[0];
    return {
      date: date,
      weekday: getHebrewWeekday(new Date(date).getDay()),
      type: 'כונן',
      guide1_id: standbyGuide.id,
      guide1_name: standbyGuide.name,
      guide1_role: 'כונן',
      guide2_id: null,
      guide2_name: null,
      guide2_role: null,
      is_manual: false,
      is_locked: false,
      created_by: null
    };
  }
  
  // Handle regular assignment (1 or 2 guides)
  const guide1 = availableGuides[0];
  let guide2 = null;
  
  if (guidesNeeded >= 2 && availableGuides.length >= 2) {
    // Find best second guide that doesn't conflict with first
    const guide2Candidates = availableGuides
      .filter(g => g.id !== guide1.id)
      .filter(g => !hasCoordinatorConflict(guide1, g, context));
    
    guide2 = guide2Candidates[0];
  }
  
  return {
    date: date,
    weekday: getHebrewWeekday(new Date(date).getDay()),
    type: roles.join('+'),
    guide1_id: guide1.id,
    guide1_name: guide1.name,
    guide1_role: roles[0],
    guide2_id: guide2?.id || null,
    guide2_name: guide2?.name || null,
    guide2_role: guide2 ? roles[1] : null,
    is_manual: false,
    is_locked: false,
    created_by: null
  };
}

function hasCoordinatorConflict(guide1, guide2, context) {
  // Check no_together rule
  const noTogetherRule = context.coordinatorRules.find(r => 
    r.rule_type === 'no_together' &&
    ((r.guide1_id === guide1.id && r.guide2_id === guide2.id) ||
     (r.guide1_id === guide2.id && r.guide2_id === guide1.id))
  );
  
  return !!noTogetherRule;
}

console.log('✅ Step 4: Day-by-day assignment logic loaded');

// =====================================================
// COMPLETE AUTO-SCHEDULING ALGORITHM IMPLEMENTATION
// Add this to your existing app.js file
// =====================================================

// Missing functions for auto-scheduling
async function validateGuideAvailability(guide, date, context) {
  try {
    const availability = {
      available: true,
      score: 0,
      reasons: []
    };

    // Check constraints
    const hasConstraint = context.constraints.some(c => 
      c.user_id === guide.id && c.date === date
    );
    if (hasConstraint) {
      availability.available = false;
      availability.reasons.push('אילוץ אישי');
      return availability;
    }

    // Check fixed constraints (weekly recurring)
    const dateObj = new Date(date);
    const weekday = dateObj.getDay();
    const hasFixedConstraint = context.fixedConstraints.some(fc => 
      fc.user_id === guide.id && fc.weekday === weekday
    );
    if (hasFixedConstraint) {
      availability.available = false;
      availability.reasons.push('אילוץ קבוע');
      return availability;
    }

    // Check vacations
    const hasVacation = context.vacations.some(v => 
      v.user_id === guide.id && 
      v.status === 'approved' && 
      v.date_start <= date && 
      v.date_end >= date
    );
    if (hasVacation) {
      availability.available = false;
      availability.reasons.push('חופשה');
      return availability;
    }

    // Check consecutive days rule
    const yesterdayDate = new Date(date);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
    
    const workedYesterday = checkIfGuideWorkedOn(guide.id, yesterdayStr, context);
    if (workedYesterday) {
      availability.available = false;
      availability.reasons.push('עבד אתמול');
      return availability;
    }

    // Calculate score for balancing (lower is better)
    const guideStats = context.guideStats[guide.id];
    if (guideStats) {
      availability.score += guideStats.totalShifts * 10;
      availability.score += guideStats.weekendShifts * 5;
      availability.score += guideStats.standbyShifts * 8;
    }

    return availability;
  } catch (error) {
    console.error('Error validating guide availability:', error);
    return {
      available: false,
      score: 1000,
      reasons: ['שגיאה בבדיקת זמינות']
    };
  }
}

function checkIfGuideWorkedOn(guideId, date, context) {
  // Check in manual assignments
  const manualAssignment = context.manualAssignments[date];
  if (manualAssignment) {
    return manualAssignment.guide1_id === guideId || manualAssignment.guide2_id === guideId;
  }
  return false;
}

// Enhanced auto-scheduling with configuration
app.post('/api/schedule/auto-schedule-enhanced/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const {
      preserve_manual = true,
      balance_workload = true,
      optimize_spacing = true,
      max_conan_per_guide = 2,
      max_consecutive_days = 0,
      weekend_balance = true,
      dry_run = false
    } = req.body;
    
    console.log(`🚀 Enhanced auto-scheduling for ${year}-${month}`);
    
    // Get current schedule to preserve manual assignments
    const currentSchedule = await fetchMonthlyScheduleFromDB(year, month);
    
    // Get all guides
    const guides = db.prepare("SELECT * FROM users WHERE role = 'מדריך' AND COALESCE(is_active, 1) = 1").all();
    
    // Run simplified auto-scheduling algorithm
    const result = await runSimplifiedAutoScheduling(year, month, guides, currentSchedule, {
      preserveManual: preserve_manual,
      balanceWorkload: balance_workload,
      maxConanPerGuide: max_conan_per_guide,
      maxConsecutiveDays: max_consecutive_days,
      dryRun: dry_run
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Enhanced auto-scheduling error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      warnings: []
    });
  }
});

// Remove auto-scheduled assignments endpoint
app.delete('/api/schedule/remove-auto-scheduled/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    
    console.log(`🗑️ Removing auto-scheduled assignments for ${year}-${month}`);
    
    // Delete only auto-scheduled assignments (is_manual = 0)
    const deleteStmt = db.prepare(`
      DELETE FROM schedule 
      WHERE date LIKE ? AND is_manual = 0
    `);
    
    const result = deleteStmt.run(`${year}-${String(month).padStart(2, '0')}-%`);
    
    console.log(`✅ Removed ${result.changes} auto-scheduled assignments`);
    
    res.json({
      success: true,
      message: `Removed ${result.changes} auto-scheduled assignments`,
      removedCount: result.changes
    });
    
  } catch (error) {
    console.error('Error removing auto-scheduled assignments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove auto-scheduled assignments',
      details: error.message
    });
  }
});

async function fetchMonthlyScheduleFromDB(year, month) {
  return db.prepare(`
    SELECT * FROM schedule 
    WHERE date LIKE ? 
    ORDER BY date
  `).all(`${year}-${String(month).padStart(2, '0')}-%`);
}

// =====================================================
// FIXED AUTO-SCHEDULER WITH PROPER CONSTRAINT CHECKING
// Replace the runSimplifiedAutoScheduling function in your app.js
// =====================================================

async function runSimplifiedAutoScheduling(year, month, guides, currentSchedule, options) {
  try {
    console.log('🔍 Loading constraint data...');
    
    // Load all constraint data
    const constraints = db.prepare("SELECT * FROM constraints").all();
    const fixedConstraints = db.prepare("SELECT * FROM fixed_constraints").all();
    const vacations = db.prepare("SELECT * FROM vacations WHERE status = 'approved'").all();
    const coordinatorRules = db.prepare("SELECT * FROM coordinator_rules WHERE is_active = 1").all();
    
    console.log(`Loaded constraints: ${constraints.length} regular, ${fixedConstraints.length} fixed, ${vacations.length} vacations, ${coordinatorRules.length} coordinator rules`);
    
    const days = getAllDaysInMonth(year, month);
    const assignments = [];
    const warnings = [];
    const guideWorkload = {}; // Track workload for balancing
    
    // Initialize guide workload tracking
    guides.forEach(guide => {
      guideWorkload[guide.id] = {
        totalShifts: 0,
        lastShiftDate: null,
        conanShifts: 0
      };
    });
    
    // Load existing workload from current schedule (manual assignments only)
    currentSchedule.forEach(assignment => {
      if (assignment.is_manual) {
        if (assignment.guide1_id && guideWorkload[assignment.guide1_id]) {
          guideWorkload[assignment.guide1_id].totalShifts++;
          if (assignment.guide1_role === 'כונן') {
            guideWorkload[assignment.guide1_id].conanShifts++;
          }
          // Track most recent manual date as lastShiftDate
          const prev = guideWorkload[assignment.guide1_id].lastShiftDate;
          if (!prev || prev < assignment.date) {
            guideWorkload[assignment.guide1_id].lastShiftDate = assignment.date;
          }
        }
        if (assignment.guide2_id && guideWorkload[assignment.guide2_id]) {
          guideWorkload[assignment.guide2_id].totalShifts++;
          if (assignment.guide2_role === 'כונן') {
            guideWorkload[assignment.guide2_id].conanShifts++;
          }
          // Track most recent manual date as lastShiftDate
          const prev2 = guideWorkload[assignment.guide2_id].lastShiftDate;
          if (!prev2 || prev2 < assignment.date) {
            guideWorkload[assignment.guide2_id].lastShiftDate = assignment.date;
          }
        }
      }
    });
    
    // Load actual last shift dates from database (not from workload tracking)
    guides.forEach(guide => {
      const lastShift = db.prepare(`
        SELECT date FROM schedule 
        WHERE (guide1_id = ? OR guide2_id = ?) AND date < ?
        ORDER BY date DESC LIMIT 1
      `).get(guide.id, guide.id, `${year}-${String(month).padStart(2, '0')}-01`);
      
      if (lastShift) {
        guideWorkload[guide.id].lastShiftDate = lastShift.date;
      }
    });
    
    console.log('📊 Current workload:', guideWorkload);
    
    // Track weekend assignments for linking
    const weekendAssignments = {};
    
    // First pass: process all Fridays to establish כונן assignments
    console.log('\n🔒 FIRST PASS: Processing Fridays for כונן assignments...');
    for (const day of days) {
      const dateStr = day.toISOString().split('T')[0];
      const weekdayNum = day.getDay();
      
      // Only process Fridays in first pass
      if (weekdayNum !== 5) continue;
      
      const weekendType = await getWeekendType(dateStr, weekdayNum);
      if (weekendType === 'closed_friday') {
        console.log(`\n🔒 Processing CLOSED Friday ${dateStr} (FIRST PASS)`);
        
        // Skip if manually assigned and preserving
        const existingAssignment = currentSchedule.find(s => s.date === dateStr);
        if (existingAssignment && existingAssignment.is_manual && options.preserveManual) {
          console.log(`⏭️  Skipping ${dateStr} - manual assignment preserved`);
          continue;
        }
        
        const availableGuides = await findAvailableGuides(
          dateStr, 
          weekdayNum, 
          guides, 
          constraints, 
          fixedConstraints, 
          vacations, 
          coordinatorRules,
          guideWorkload,
          options
        );
        
        if (availableGuides.length > 0) {
          const conanGuide = selectOptimalGuides(availableGuides, 1, guideWorkload, options)[0];
          
          // Store for Saturday linking - use the Friday date as key for easier lookup
          weekendAssignments[dateStr] = {
            conanGuide: conanGuide,
            conanRole: 'כונן',
            saturdayDate: new Date(dateStr).setDate(new Date(dateStr).getDate() + 1)
          };
          
          console.log(`🔗 Friday כונן ${conanGuide.name} will continue to Saturday ${new Date(dateStr).toISOString().split('T')[0]}`);
          console.log(`📝 Weekend assignments tracking:`, Object.keys(weekendAssignments));
        }
      }
    }
    
    // Second pass: process all days with weekend linking
    console.log('\n🌅 SECOND PASS: Processing all days with weekend logic...');
    for (const day of days) {
      const dateStr = day.toISOString().split('T')[0];
      const weekdayNum = day.getDay();
      
      console.log(`\n📅 Processing ${dateStr} (${getHebrewWeekday(weekdayNum)})`);
      
      // Skip if manually assigned and preserving
      const existingAssignment = currentSchedule.find(s => s.date === dateStr);
      if (existingAssignment && existingAssignment.is_manual && options.preserveManual) {
        console.log(`⏭️  Skipping ${dateStr} - manual assignment preserved`);
        continue;
      }
      
      // Check if this is a special weekend type
      const weekendType = await getWeekendType(dateStr, weekdayNum);
      const { guidesNeeded, roles } = determineShiftRequirements(weekdayNum, weekendType);
      
      console.log(`🎯 Need ${guidesNeeded} guides with roles: ${roles.join(', ')}`);
      
      // Handle weekend linking logic
      let selectedGuides = [];
      
      if (weekendType === 'closed_friday') {
        // Friday: כונן already assigned in first pass, now create the assignment
        console.log(`🔒 Processing CLOSED Friday ${dateStr} (SECOND PASS - creating assignment)`);
        
        // Get the כונן guide that was assigned in first pass (keyed by FRIDAY date)
        const fridayAssignment = weekendAssignments[dateStr];
        
        if (fridayAssignment && fridayAssignment.conanGuide) {
          const conanGuide = fridayAssignment.conanGuide;
          selectedGuides = [conanGuide];
          console.log(`✅ Friday כונן assignment: ${conanGuide.name}`);
        } else {
          console.log(`⚠️  No stored כונן from FIRST PASS for Friday ${dateStr}. Selecting now and storing for Saturday link...`);
          // Fallback to selecting now, and persist to weekendAssignments so Saturday links correctly
          const availableGuides = await findAvailableGuides(
            dateStr, 
            weekdayNum, 
            guides, 
            constraints, 
            fixedConstraints, 
            vacations, 
            coordinatorRules,
            guideWorkload,
            options
          );
          selectedGuides = selectOptimalGuides(availableGuides, 1, guideWorkload, options);
          if (selectedGuides[0]) {
            weekendAssignments[dateStr] = {
              conanGuide: selectedGuides[0],
              conanRole: 'כונן',
              saturdayDate: new Date(dateStr).setDate(new Date(dateStr).getDate() + 1)
            };
            console.log(`📝 Stored Friday כונן ${selectedGuides[0].name} for Saturday linking`);
          }
        }
        
      } else if (weekendType === 'closed_saturday') {
        // Saturday: כונן continues from Friday + מוצ״ש joins
        console.log(`🔒 Processing CLOSED Saturday ${dateStr}`);
        const fridayDate = new Date(dateStr);
        fridayDate.setDate(fridayDate.getDate() - 1);
        const fridayDateStr = fridayDate.toISOString().split('T')[0];
        
        console.log(`🔍 Looking for Friday assignment on ${fridayDateStr}`);
        console.log(`📝 Available weekend assignments:`, Object.keys(weekendAssignments));
        
        const fridayAssignment = weekendAssignments[fridayDateStr];
        if (fridayAssignment && fridayAssignment.conanGuide) {
          // כונן continues from Friday
          const conanGuide = fridayAssignment.conanGuide;
          console.log(`✅ Found Friday כונן: ${conanGuide.name}, continuing to Saturday`);
          
          // Find מוצ״ש guide (must be different from כונן)
          const availableGuides = await findAvailableGuides(
            dateStr, 
            weekdayNum, 
            guides, 
            constraints, 
            fixedConstraints, 
            vacations, 
            coordinatorRules,
            guideWorkload,
            options
          );
          
          // Filter out the כונן guide to ensure different person
          const motzashCandidates = availableGuides.filter(g => g.id !== conanGuide.id);
          console.log(`🔍 Found ${motzashCandidates.length} candidates for מוצ״ש (excluding כונן ${conanGuide.name})`);
          
          if (motzashCandidates.length > 0) {
            const motzashGuide = selectOptimalGuides(motzashCandidates, 1, guideWorkload, options)[0];
            selectedGuides = [conanGuide, motzashGuide];
            
            console.log(`🔗 Saturday: כונן ${conanGuide.name} continues + מוצ״ש ${motzashGuide.name} joins`);
          } else {
            // Fallback: use same guide if no alternatives
            selectedGuides = [conanGuide];
            console.log(`⚠️  No alternative guides for מוצ״ש, using כונן guide only`);
          }
        } else {
          console.log(`⚠️  No Friday כונן found for Saturday ${dateStr}, treating as regular day`);
          console.log(`🔍 Friday date: ${fridayDateStr}, weekend assignments:`, weekendAssignments);
          // Fallback to regular assignment
          const availableGuides = await findAvailableGuides(
            dateStr, 
            weekdayNum, 
            guides, 
            constraints, 
            fixedConstraints, 
            vacations, 
            coordinatorRules,
            guideWorkload,
            options
          );
          selectedGuides = selectOptimalGuides(availableGuides, guidesNeeded, guideWorkload, options);
        }
        
      } else {
        // Regular days (including open weekends)
        console.log(`🌅 Processing ${weekendType === 'open_saturday' ? 'OPEN Saturday' : 'regular day'} ${dateStr}`);
        const availableGuides = await findAvailableGuides(
          dateStr, 
          weekdayNum, 
          guides, 
          constraints, 
          fixedConstraints, 
          vacations, 
          coordinatorRules,
          guideWorkload,
          options
        );
        
        selectedGuides = selectOptimalGuides(availableGuides, guidesNeeded, guideWorkload, options);
      }
      
      console.log(`✅ Found ${selectedGuides.length} guides:`, selectedGuides.map(g => g.name));
      
      if (selectedGuides.length < guidesNeeded) {
        warnings.push({
          date: dateStr,
          type: 'insufficient_guides',
          message: `רק ${selectedGuides.length} מדריכים זמינים מתוך ${guidesNeeded} נדרשים`
        });
        console.log(`⚠️  Insufficient guides for ${dateStr}: need ${guidesNeeded}, have ${selectedGuides.length}`);
      }
      
      // Create assignment
      if (selectedGuides.length > 0) {
        const assignment = {
          date: dateStr,
          guide1_id: selectedGuides[0]?.id || null,
          guide1_name: selectedGuides[0]?.name || null,
          guide1_role: roles[0] || 'רגיל',
          guide2_id: selectedGuides[1]?.id || null,
          guide2_name: selectedGuides[1]?.name || null,
          guide2_role: selectedGuides[1] ? roles[1] : null,
          is_manual: false,
          is_locked: false
        };
        
        assignments.push(assignment);
        
        // Update workload tracking
        if (selectedGuides[0]) {
          guideWorkload[selectedGuides[0].id].totalShifts++;
          guideWorkload[selectedGuides[0].id].lastShiftDate = dateStr;
          if (roles[0] === 'כונן') {
            guideWorkload[selectedGuides[0].id].conanShifts++;
          }
        }
        if (selectedGuides[1]) {
          guideWorkload[selectedGuides[1].id].totalShifts++;
          guideWorkload[selectedGuides[1].id].lastShiftDate = dateStr;
          if (roles[1] === 'כונן') {
            guideWorkload[selectedGuides[1].id].conanShifts++;
          }
        }
        
        // Special handling for כונן workload on closed weekends
        if (weekendType === 'closed_friday' && selectedGuides[0] && roles[0] === 'כונן') {
          // כונן guide will also work Saturday, so count it as 2 shifts
          guideWorkload[selectedGuides[0].id].totalShifts++;
          console.log(`📊 כונן ${selectedGuides[0].name} workload updated for Friday+Saturday`);
        }
        
        console.log(`✅ Assigned ${dateStr}: ${selectedGuides.map(g => g.name).join(' + ')}`);
      } else {
        warnings.push({
          date: dateStr,
          type: 'no_assignment',
          message: `לא ניתן לשבץ מדריכים ליום ${dateStr}`
        });
        console.log(`❌ Could not assign anyone for ${dateStr}`);
      }
    }
    
    // Save assignments if not dry run
    if (!options.dryRun && assignments.length > 0) {
      await saveAssignmentsToDatabase(assignments, year, month);
    }
    
    console.log(`\n📈 Final stats: ${assignments.length} assignments created, ${warnings.length} warnings`);
    
    return {
      success: true,
      stats: {
        assigned: assignments.length,
        total: days.length,
        guides: guides.length,
        workloadBalance: calculateWorkloadBalance(guideWorkload)
      },
      warnings: warnings,
      assignments: assignments
    };
    
  } catch (error) {
    console.error('Error in auto-scheduling:', error);
    return {
      success: false,
      error: error.message,
      warnings: []
    };
  }
}

// =====================================================
// CONSTRAINT CHECKING FUNCTIONS
// =====================================================

async function findAvailableGuides(date, weekdayNum, guides, constraints, fixedConstraints, vacations, coordinatorRules, guideWorkload, options) {
  const availableGuides = [];
  
  for (const guide of guides) {
    if (guide.role !== 'מדריך') continue;
    
    const availability = await checkGuideAvailability(
      guide, 
      date, 
      weekdayNum, 
      constraints, 
      fixedConstraints, 
      vacations, 
      coordinatorRules,
      guideWorkload,
      options
    );
    
    if (availability.available) {
      availableGuides.push({
        ...guide,
        availabilityScore: availability.score,
        availabilityReasons: availability.reasons
      });
    } else {
      console.log(`🚫 ${guide.name} not available: ${availability.reasons.join(', ')}`);
    }
  }
  
  // Sort by availability score (lower is better)
  availableGuides.sort((a, b) => a.availabilityScore - b.availabilityScore);
  
  return availableGuides;
}

async function checkGuideAvailability(guide, date, weekdayNum, constraints, fixedConstraints, vacations, coordinatorRules, guideWorkload, options) {
  const result = {
    available: true,
    score: 0,
    reasons: []
  };
  
  const guideId = guide.id;
  const workload = guideWorkload[guideId] || { totalShifts: 0, lastShiftDate: null, conanShifts: 0 };
  
  // 1. Check regular constraints (specific date)
  const hasConstraint = constraints.some(c => 
    c.user_id === guideId && c.date === date
  );
  if (hasConstraint) {
    result.available = false;
    result.reasons.push('אילוץ אישי');
    return result;
  }
  
  // 2. Check fixed constraints (weekly recurring)
  const hasFixedConstraint = fixedConstraints.some(fc => 
    fc.user_id === guideId && fc.weekday === weekdayNum
  );
  if (hasFixedConstraint) {
    result.available = false;
    result.reasons.push('אילוץ קבוע');
    return result;
  }
  
  // 3. Check vacations
  const hasVacation = vacations.some(v => 
    v.user_id === guideId && 
    v.date_start <= date && 
    v.date_end >= date
  );
  if (hasVacation) {
    result.available = false;
    result.reasons.push('חופשה');
    return result;
  }
  
  // 4. Check coordinator rules
  const hasCoordinatorBlock = coordinatorRules.some(rule => 
    rule.rule_type === 'no_auto_scheduling' && 
    rule.guide1_id === guideId
  );
  if (hasCoordinatorBlock) {
    result.available = false;
    result.reasons.push('חוק רכז - לא באוטומטי');
    return result;
  }
  
  // 5. Check consecutive days rule
  // Block if guide worked the previous day OR is scheduled the next day
  // Exception: closed Friday כונן may continue to Saturday

  // 5a. Check previous day (worked yesterday)
  const prevDay = new Date(date);
  prevDay.setDate(prevDay.getDate() - 1);
  const prevDayStr = prevDay.toISOString().split('T')[0];
  
  // Block if in this run the guide's lastShiftDate equals prevDay (covers dry-run/not-yet-persisted)
  if (workload.lastShiftDate === prevDayStr) {
    result.available = false;
    result.reasons.push('עבד אתמול (חוק ימים ברצף)');
    return result;
  }
  const prevDayAssignment = db.prepare(`
    SELECT * FROM schedule 
    WHERE date = ? AND (guide1_id = ? OR guide2_id = ?)
  `).get(prevDayStr, guideId, guideId);
  if (prevDayAssignment) {
    result.available = false;
    result.reasons.push('עבד אתמול (חוק ימים ברצף)');
    return result;
  }

  // 5b. Check next day (working tomorrow)
  // Only check if guide is already scheduled for the day AFTER (to prevent day-after-day)
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split('T')[0];
  
  const nextDayAssignment = db.prepare(`
    SELECT * FROM schedule 
    WHERE date = ? AND (guide1_id = ? OR guide2_id = ?)
  `).get(nextDayStr, guideId, guideId);
  
  if (nextDayAssignment) {
    // Exception: Allow כונן guide to continue to Saturday on closed weekends
    const isFriday = weekdayNum === 5;
    const isClosedWeekend = await getWeekendType(date, weekdayNum) === 'closed_friday';
    
    if (isFriday && isClosedWeekend) {
      // This is a closed Friday - כונן guide is allowed to continue to Saturday
      console.log(`✅ כונן ${guide.name} allowed to continue to Saturday on closed weekend`);
    } else {
      result.available = false;
      result.reasons.push('עובד מחר (חוק ימים ברצף)');
      return result;
    }
  }
  
  // Add score penalty for recent work (within 3 days) - prefer 2-day gap
  if (workload.lastShiftDate) {
    const lastShift = new Date(workload.lastShiftDate);
    const currentDate = new Date(date);
    const diffDays = Math.ceil((currentDate - lastShift) / (1000 * 60 * 60 * 24));
    
    if (diffDays > 0 && diffDays <= 3) {
      result.score += (4 - diffDays) * 5;
      result.reasons.push(`עבד לפני ${diffDays} ימים`);
    }
  }
  
  // 6. Check if guide is already scheduled for the current day (manual assignments)
  const currentDayAssignment = db.prepare(`
    SELECT * FROM schedule 
    WHERE date = ? AND (guide1_id = ? OR guide2_id = ?)
  `).get(date, guideId, guideId);
  
  if (currentDayAssignment) {
    result.available = false;
    result.reasons.push('כבר שובץ ליום זה');
    return result;
  }
  
  // 7. Check conan limit
  if (workload.conanShifts >= options.maxConanPerGuide) {
    // Don't block completely, but add high penalty for conan roles
    result.score += 100;
    result.reasons.push(`כבר ${workload.conanShifts} כוננויות החודש`);
  }
  
  // 8. Workload balancing score
  result.score += workload.totalShifts * 5; // Prefer guides with fewer shifts
  
  // 9. Add small random factor to break ties
  result.score += Math.random() * 2;
  
  return result;
}

// =====================================================
// GUIDE SELECTION AND OPTIMIZATION
// =====================================================

function selectOptimalGuides(availableGuides, guidesNeeded, guideWorkload, options) {
  if (availableGuides.length === 0) return [];
  
  const selected = [];
  const remaining = [...availableGuides];
  
  // Select guides one by one, updating scores after each selection
  for (let i = 0; i < guidesNeeded && remaining.length > 0; i++) {
    // Sort remaining guides by current score
    remaining.sort((a, b) => a.availabilityScore - b.availabilityScore);
    
    const bestGuide = remaining.shift();
    selected.push(bestGuide);
    
    // Update scores for remaining guides to avoid pairing conflicts
    updateScoresAfterSelection(remaining, bestGuide, options);
  }
  
  return selected;
}

function updateScoresAfterSelection(remainingGuides, selectedGuide, options) {
  // Add penalty for guides that shouldn't work together
  remainingGuides.forEach(guide => {
    // You can add coordinator rules for "no_together" here
    // For now, just a small penalty to encourage variety
    guide.availabilityScore += 1;
  });
}

// =====================================================
// WEEKEND AND SHIFT TYPE DETECTION
// =====================================================

async function getWeekendType(date, weekdayNum) {
  try {
    // Check if this is a Friday
    if (weekdayNum === 5) {
      const weekendTypeRow = db.prepare('SELECT is_closed FROM weekend_types WHERE date = ?').get(date);
      if (weekendTypeRow && weekendTypeRow.is_closed === 1) {
        return 'closed_friday';
      }
      
      // Also check shabbat_status table for backward compatibility
      const shabbatRow = db.prepare('SELECT status FROM shabbat_status WHERE date = ?').get(date);
      if (shabbatRow && shabbatRow.status === 'סגורה') {
        return 'closed_friday';
      }
    }
    
    // Check if this is a Saturday
    if (weekdayNum === 6) {
      // Check the previous day (Friday) for weekend type
      const fridayDate = new Date(date);
      fridayDate.setDate(fridayDate.getDate() - 1);
      const fridayDateStr = fridayDate.toISOString().split('T')[0];
      
      const weekendTypeRow = db.prepare('SELECT is_closed FROM weekend_types WHERE date = ?').get(fridayDateStr);
      if (weekendTypeRow && weekendTypeRow.is_closed === 1) {
        return 'closed_saturday';
      }
      
      // Also check shabbat_status table
      const shabbatRow = db.prepare('SELECT status FROM shabbat_status WHERE date = ?').get(fridayDateStr);
      if (shabbatRow && shabbatRow.status === 'סגורה') {
        return 'closed_saturday';
      }
      
      return 'open_saturday';
    }
    
    return 'regular';
  } catch (error) {
    console.error('Error getting weekend type:', error);
    return 'regular';
  }
}

function determineShiftRequirements(weekdayNum, weekendType) {
  // Friday for closed Saturday = 1 conan
  if (weekendType === 'closed_friday') {
    return { guidesNeeded: 1, roles: ['כונן'] };
  }
  
  // Closed Saturday = 2 guides: כונן continues from Friday + מוצ״ש joins
  if (weekendType === 'closed_saturday') {
    return { guidesNeeded: 2, roles: ['כונן', 'מוצ״ש'] };
  }
  
  // Open Friday = 2 guides (weekend but open)
  if (weekdayNum === 5 && weekendType === 'regular') {
    return { guidesNeeded: 2, roles: ['רגיל', 'חפיפה'] };
  }
  
  // Open Saturday = 2 guides (weekend but open)
  if (weekendType === 'open_saturday') {
    return { guidesNeeded: 2, roles: ['רגיל', 'חפיפה'] };
  }
  
  // Regular weekdays = 2 guides
  return { guidesNeeded: 2, roles: ['רגיל', 'חפיפה'] };
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function calculateWorkloadBalance(guideWorkload) {
  const workloads = Object.values(guideWorkload).map(w => w.totalShifts);
  const min = Math.min(...workloads);
  const max = Math.max(...workloads);
  const avg = workloads.reduce((a, b) => a + b, 0) / workloads.length;
  
  return { min, max, avg: Math.round(avg * 100) / 100 };
}

console.log('✅ Fixed Auto-Scheduler with Constraints loaded');

async function saveAssignmentsToDatabase(assignments, year, month) {
  console.log(`Saving ${assignments.length} assignments to database`);
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO schedule 
    (date, weekday, type, guide1_id, guide2_id, guide1_name, guide2_name, guide1_role, guide2_role, is_manual, is_locked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const assignment of assignments) {
    const weekday = getHebrewWeekday(new Date(assignment.date).getDay());
    
    insertStmt.run(
      assignment.date,
      weekday,
      'רגיל',
      assignment.guide1_id,
      assignment.guide2_id,
      assignment.guide1_name,
      assignment.guide2_name,
      assignment.guide1_role,
      assignment.guide2_role,
      assignment.is_manual ? 1 : 0,
      assignment.is_locked ? 1 : 0
    );
  }
  
  console.log(`Successfully saved ${assignments.length} assignments`);
}

function getHebrewWeekday(dayIndex) {
  const weekdays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return weekdays[dayIndex];
}

function getAllDaysInMonth(year, month) {
  const days = [];
  const date = new Date(year, month - 1, 1);
  
  while (date.getMonth() === month - 1) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  
  return days;
}

console.log('✅ Enhanced Auto-Scheduling loaded');

// =====================================================
// HELPER FUNCTIONS FOR AUTO-SCHEDULING
// =====================================================

// Helper function to update guide statistics for an assignment
function updateGuideStatsForAssignment(stats, date, role) {
  if (!stats) return;
  
  stats.totalShifts++;
  stats.lastShiftDate = date;
  
  // Update role-specific counts
  switch (role) {
    case 'רגיל':
      stats.regularShifts++;
      break;
    case 'חפיפה':
      stats.overlapShifts++;
      break;
    case 'כונן':
      stats.standbyShifts++;
      break;
    case 'מוצ״ש':
      stats.motzashShifts++;
      break;
  }
  
  // Update weekly counts
  const weekStart = getWeekStart(date);
  const weekKey = weekStart.toISOString().split('T')[0];
  stats.weeklyShifts[weekKey] = (stats.weeklyShifts[weekKey] || 0) + 1;
}

// Helper function to get week start date
function getWeekStart(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day; // Adjust to Sunday
  return new Date(date.setDate(diff));
}

// These functions are now implemented in Step 4 above
// Keeping placeholders for any remaining functions

function updateContextWithAssignment(context, assignment) {
  // Update guide statistics with the new assignment
  if (assignment.guide1_id) {
    updateGuideStatsForAssignment(context.guideStats[assignment.guide1_id], assignment.date, assignment.guide1_role);
  }
  if (assignment.guide2_id) {
    updateGuideStatsForAssignment(context.guideStats[assignment.guide2_id], assignment.date, assignment.guide2_role);
  }
  
  // Add to manual assignments if it's manual
  if (assignment.is_manual) {
    context.manualAssignments[assignment.date] = assignment;
  }
  
  console.log(`Updated context with assignment for ${assignment.date}`);
}

async function saveAssignmentsToDatabase(assignments, year, month) {
  console.log(`Saving ${assignments.length} assignments to database`);
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO schedule 
    (date, weekday, type, guide1_id, guide2_id, guide1_name, guide2_name, guide1_role, guide2_role, is_manual, is_locked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const assignment of assignments) {
    const weekday = getHebrewWeekday(new Date(assignment.date).getDay());
    
    insertStmt.run(
      assignment.date,
      weekday,
      'רגיל',
      assignment.guide1_id,
      assignment.guide2_id,
      assignment.guide1_name,
      assignment.guide2_name,
      assignment.guide1_role,
      assignment.guide2_role,
      assignment.is_manual ? 1 : 0,
      assignment.is_locked ? 1 : 0
    );
  }
  
  console.log(`Successfully saved ${assignments.length} assignments`);
}

function generateFinalStatistics(context, assignments) {
  // This will be implemented in the next step
  return {
    assigned: assignments.length,
    total: context.days.length,
    guides: context.guides.length
  };
}

// =====================================================
// WORKFLOW API ENDPOINTS
// Add this before app.listen()
// =====================================================

// Get workflow status for a month
app.get('/api/workflow/status/:month', (req, res) => {
  try {
    const { month } = req.params;
    
    const status = db.prepare('SELECT * FROM workflow_status WHERE month = ?').get(month);
    
    if (!status) {
      return res.json({
        month: month,
        current_draft_version: 0,
        is_finalized: false,
        can_edit: true,
        drafts_available: [],
        last_email_sent: null
      });
    }
    
    // Get available drafts
    const drafts = db.prepare(`
      SELECT d.version, d.name, d.created_at, d.created_by, u.name as created_by_name
      FROM drafts d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.month = ?
      ORDER BY d.version DESC
    `).all(month);
    
    res.json({
      month: month,
      current_draft_version: status.current_draft_version,
      is_finalized: status.is_finalized === 1,
      can_edit: status.is_finalized === 0,
      drafts_available: drafts,
      finalized_at: status.finalized_at,
      finalized_by: status.finalized_by
    });
    
  } catch (error) {
    console.error('Error getting workflow status:', error);
    res.status(500).json({ error: 'Failed to get workflow status' });
  }
});

// Create first draft
app.post('/api/workflow/create-draft/:month', (req, res) => {
  try {
    const { month } = req.params;
    const { created_by = 1, notes = '' } = req.body;
    
    // Check if month is finalized
    const status = db.prepare('SELECT is_finalized FROM workflow_status WHERE month = ?').get(month);
    if (status && status.is_finalized === 1) {
      return res.status(400).json({ error: 'Cannot create draft - month is already finalized' });
    }
    
    // Get current schedule data
    const scheduleData = db.prepare(`
      SELECT s.*, u1.name as guide1_name, u2.name as guide2_name
      FROM schedule s
      LEFT JOIN users u1 ON s.guide1_id = u1.id
      LEFT JOIN users u2 ON s.guide2_id = u2.id
      WHERE s.date LIKE ?
      ORDER BY s.date
    `).all(`${month}-%`);
    
    if (scheduleData.length === 0) {
      return res.status(400).json({ error: 'No schedule data found for this month' });
    }
    
    // Get next draft version
    const lastDraft = db.prepare('SELECT MAX(version) as max_version FROM drafts WHERE month = ?').get(month);
    const newVersion = (lastDraft?.max_version || 0) + 1;
    
    const draftName = `Draft ${newVersion} - ${new Date().toLocaleDateString('he-IL')}`;
    
    // Save draft
    db.prepare(`
      INSERT INTO drafts (month, version, name, data, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(month, newVersion, draftName, JSON.stringify(scheduleData), created_by);
    
    // Update workflow status
    db.prepare(`
      INSERT OR REPLACE INTO workflow_status 
      (month, current_draft_version, is_finalized, updated_at)
      VALUES (?, ?, 0, CURRENT_TIMESTAMP)
    `).run(month, newVersion);
    
    res.json({
      success: true,
      message: `Draft ${newVersion} created successfully`,
      draft_version: newVersion,
      draft_name: draftName
    });
    
  } catch (error) {
    console.error('Error creating draft:', error);
    res.status(500).json({ error: 'Failed to create draft' });
  }
});

// Send draft to guides via email
app.post('/api/workflow/send-to-guides/:month/:version', (req, res) => {
  try {
    const { month, version } = req.params;
    const { sent_by = 1, custom_message = '' } = req.body;
    
    // Get draft data
    const draft = db.prepare('SELECT data, name FROM drafts WHERE month = ? AND version = ?').get(month, version);
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    
    const scheduleData = JSON.parse(draft.data);
    
    // Get all guides with email addresses
    const guides = db.prepare("SELECT id, name, email FROM users WHERE role = 'מדריך'").all();
    
    const emailsSent = [];
    
    guides.forEach(guide => {
      // Find guide's personal shifts
      const personalShifts = scheduleData.filter(day => 
        day.guide1_id === guide.id || day.guide2_id === guide.id
      );
      
      // Generate email content (simplified)
      const emailContent = `Email for ${guide.name}: ${personalShifts.length} shifts in ${month}`;
      
      // Log email
      db.prepare(`
        INSERT INTO email_logs (month, draft_version, recipient_id, recipient_email, email_content, status)
        VALUES (?, ?, ?, ?, ?, 'sent')
      `).run(month, version, guide.id, guide.email || `${guide.name}@example.com`, emailContent);
      
      emailsSent.push({
        guide_id: guide.id,
        guide_name: guide.name,
        email: guide.email || `${guide.name}@example.com`,
        shifts_count: personalShifts.length
      });
    });
    
    res.json({
      success: true,
      message: `Draft ${version} sent to ${emailsSent.length} guides`,
      emails_sent: emailsSent,
      emails_failed: [],
      total_recipients: emailsSent.length
    });
    
  } catch (error) {
    console.error('Error sending draft to guides:', error);
    res.status(500).json({ error: 'Failed to send draft to guides' });
  }
});

// Finalize schedule
app.post('/api/workflow/finalize/:month', (req, res) => {
  try {
    const { month } = req.params;
    const { finalized_by = 1, notes = '' } = req.body;
    
    // Get current schedule data
    const scheduleData = db.prepare(`
      SELECT s.*, u1.name as guide1_name, u2.name as guide2_name
      FROM schedule s
      LEFT JOIN users u1 ON s.guide1_id = u1.id
      LEFT JOIN users u2 ON s.guide2_id = u2.id
      WHERE s.date LIKE ?
      ORDER BY s.date
    `).all(`${month}-%`);
    
    if (scheduleData.length === 0) {
      return res.status(400).json({ error: 'No schedule data found for this month' });
    }
    
    // Save to official_schedules
    db.prepare(`
      INSERT INTO official_schedules (month, version, schedule_data, created_by, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(month, 1, JSON.stringify(scheduleData), finalized_by, notes);
    
    // Update workflow status to finalized
    db.prepare(`
      UPDATE workflow_status 
      SET is_finalized = 1, finalized_at = CURRENT_TIMESTAMP, finalized_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE month = ?
    `).run(finalized_by, month);
    
    res.json({
      success: true,
      message: `Schedule for ${month} has been finalized`,
      final_version: 1,
      assignments_count: scheduleData.length
    });
    
  } catch (error) {
    console.error('Error finalizing schedule:', error);
    res.status(500).json({ error: 'Failed to finalize schedule' });
  }
});

console.log('✅ Workflow API endpoints loaded');

// Get official schedule for finalized month
app.get('/api/schedule/official/:month', (req, res) => {
  try {
    const { month } = req.params;
    
    // Get the latest official schedule for this month
    const officialSchedule = db.prepare(`
      SELECT schedule_data, version, created_by, created_at, notes
      FROM official_schedules 
      WHERE month = ? 
      ORDER BY version DESC 
      LIMIT 1
    `).get(month);
    
    if (!officialSchedule) {
      return res.status(404).json({ error: 'No official schedule found for this month' });
    }
    
    // Parse the schedule data
    const scheduleData = JSON.parse(officialSchedule.schedule_data);
    
    res.json(scheduleData);
    
  } catch (error) {
    console.error('Error fetching official schedule:', error);
    res.status(500).json({ error: 'Failed to fetch official schedule' });
  }
});

// =====================================================
// ENHANCED STATISTICS API ENDPOINTS
// Add this code to app.js before app.listen(PORT, ...)
// =====================================================

// Enhanced statistics endpoint with detailed calculations
app.get('/api/schedule/enhanced-statistics/:year/:month', (req, res) => {
  try {
    const { year, month } = req.params;
    console.log(`🔍 Fetching enhanced statistics for ${year}-${month}`);
    
    // Get all guides
    const guides = db.prepare(`
      SELECT * FROM users 
      WHERE role = 'מדריך' AND COALESCE(is_active, 1) = 1
      ORDER BY name
    `).all();
    
            // Get schedule data for the month - try official schedule first, fallback to regular schedule
        let schedule = [];
        
        // Try to get official schedule first
        const officialSchedule = db.prepare(`
            SELECT schedule_data 
            FROM official_schedules 
            WHERE month = ? 
            ORDER BY version DESC 
            LIMIT 1
        `).get(`${year}-${String(month).padStart(2, '0')}`);
        
        if (officialSchedule && officialSchedule.schedule_data) {
            try {
                const officialData = JSON.parse(officialSchedule.schedule_data);
                schedule = officialData.map(item => ({
                    date: item.date,
                    guide1_id: item.guide1_id,
                    guide1_name: item.guide1_name,
                    guide1_role: item.guide1_role || (item.type === 'כונן' ? 'כונן' : item.type === 'מוצ״ש' ? 'מוצ״ש' : 'רגיל'),
                    guide2_id: item.guide2_id,
                    guide2_name: item.guide2_name,
                    guide2_role: item.guide2_role || (item.type === 'מוצ״ש' && item.guide2_id ? 'מוצ״ש' : item.type === 'חפיפה' ? 'חפיפה' : null),
                    is_manual: item.is_manual || 0,
                    is_locked: item.is_locked || 0
                }));
                console.log(`✅ Using official schedule for ${year}-${month} with ${schedule.length} assignments`);
            } catch (e) {
                console.log(`❌ Error parsing official schedule: ${e.message}`);
            }
        }
        
        // Fallback to regular schedule if no official schedule found
        if (schedule.length === 0) {
            schedule = db.prepare(`
                SELECT 
                    s.*,
                    u1.name as guide1_name,
                    u2.name as guide2_name
                FROM schedule s
                LEFT JOIN users u1 ON s.guide1_id = u1.id
                LEFT JOIN users u2 ON s.guide2_id = u2.id
                WHERE s.date LIKE ?
                ORDER BY s.date
            `).all(`${year}-${String(month).padStart(2, '0')}-%`);
            console.log(`📋 Using regular schedule for ${year}-${month} with ${schedule.length} assignments`);
        }
    
    // Get weekend types for accurate hour calculations
    const weekendTypes = {};
    
    // Try weekend_types table first
    try {
        const weekendRows = db.prepare(`
          SELECT date, is_closed 
          FROM weekend_types 
          WHERE strftime('%Y-%m', date) = ?
        `).all(`${year}-${String(month).padStart(2, '0')}`);
        
        weekendRows.forEach(row => {
            weekendTypes[row.date] = row.is_closed === 1;
        });
        console.log(`Found ${weekendRows.length} weekend types from weekend_types table`);
    } catch (e) {
        console.log('weekend_types table not found, trying shabbat_status');
    }
    
    // Fallback to shabbat_status table
    if (Object.keys(weekendTypes).length === 0) {
        try {
            const shabbatRows = db.prepare(`
              SELECT date, status 
              FROM shabbat_status 
              WHERE strftime('%Y-%m', date) = ?
            `).all(`${year}-${String(month).padStart(2, '0')}`);
            
            shabbatRows.forEach(row => {
                weekendTypes[row.date] = row.status === 'סגורה';
            });
            console.log(`Found ${shabbatRows.length} weekend types from shabbat_status table`);
        } catch (e) {
            console.log('No weekend type data found');
        }
    }
    
    // Calculate detailed statistics for each guide
    const guideStatistics = guides.map(guide => {
      const stats = calculateDetailedGuideStats(guide, schedule, weekendTypes);
      return {
        id: guide.id,
        name: guide.name,
        ...stats
      };
    });
    
    // Calculate day statistics
    const dayStatistics = calculateDayStatistics(schedule, year, month);
    
    // Calculate averages
    const averages = calculateAverages(guideStatistics);
    
    // Generate recommendations
    const recommendations = generateRecommendations(guideStatistics, averages);
    
    // Calculate balance metrics
    const balanceMetrics = calculateBalanceMetrics(guideStatistics);
    
    res.json({
      success: true,
      guide_statistics: guideStatistics,
      day_statistics: dayStatistics,
      averages: averages,
      recommendations: recommendations,
      balance_metrics: balanceMetrics,
      month: `${year}-${month}`,
      generated_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error generating enhanced statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate enhanced statistics',
      details: error.message
    });
  }
});

// Quick statistics endpoint for the minimal modal
app.get('/api/schedule/quick-statistics/:year/:month', (req, res) => {
  try {
    const { year, month } = req.params;
    
    // Get basic data - try official schedule first, fallback to regular schedule
    let schedule = [];
    
    // Try to get official schedule first
    const officialSchedule = db.prepare(`
        SELECT schedule_data 
        FROM official_schedules 
        WHERE month = ? 
        ORDER BY version DESC 
        LIMIT 1
    `).get(`${year}-${String(month).padStart(2, '0')}`);
    
    if (officialSchedule && officialSchedule.schedule_data) {
        try {
            const officialData = JSON.parse(officialSchedule.schedule_data);
            schedule = officialData.map(item => ({
                date: item.date,
                guide1_id: item.guide1_id,
                guide1_name: item.guide1_name,
                guide1_role: item.guide1_role || (item.type === 'כונן' ? 'כונן' : item.type === 'מוצ״ש' ? 'מוצ״ש' : 'רגיל'),
                guide2_id: item.guide2_id,
                guide2_name: item.guide2_name,
                guide2_role: item.guide2_role || (item.type === 'מוצ״ש' && item.guide2_id ? 'מוצ״ש' : item.type === 'חפיפה' ? 'חפיפה' : null),
                is_manual: item.is_manual || 0,
                is_locked: item.is_locked || 0
            }));
        } catch (e) {
            console.log(`❌ Error parsing official schedule for quick stats: ${e.message}`);
        }
    }
    
    // Fallback to regular schedule if no official schedule found
    if (schedule.length === 0) {
        schedule = db.prepare(`
            SELECT s.*, u1.name as guide1_name, u2.name as guide2_name
            FROM schedule s
            LEFT JOIN users u1 ON s.guide1_id = u1.id
            LEFT JOIN users u2 ON s.guide2_id = u2.id
            WHERE s.date LIKE ?
            ORDER BY s.date
        `).all(`${year}-${String(month).padStart(2, '0')}-%`);
    }
    
    const guides = db.prepare("SELECT * FROM users WHERE role = 'מדריך'").all();
    
    // Calculate quick stats
    const quickStats = {
      total_days: new Date(year, month, 0).getDate(),
      assigned_days: schedule.filter(s => s.guide1_id || s.guide2_id).length,
      manual_assignments: schedule.filter(s => s.is_manual).length,
      auto_assignments: schedule.filter(s => !s.is_manual).length,
      
      guides: guides.map(guide => {
        const guideShifts = schedule.filter(s => s.guide1_id === guide.id || s.guide2_id === guide.id);
        const weekdayShifts = guideShifts.filter(s => {
          const day = new Date(s.date).getDay();
          return day >= 1 && day <= 4; // Monday to Thursday
        }).length;
        const weekendShifts = guideShifts.filter(s => {
          const day = new Date(s.date).getDay();
          return day === 5 || day === 6; // Friday or Saturday
        }).length;
        const conanShifts = guideShifts.filter(s => 
          (s.guide1_id === guide.id && s.guide1_role === 'כונן') ||
          (s.guide2_id === guide.id && s.guide2_role === 'כונן')
        ).length;
        const motzashShifts = guideShifts.filter(s => 
          (s.guide1_id === guide.id && s.guide1_role === 'מוצ״ש') ||
          (s.guide2_id === guide.id && s.guide2_role === 'מוצ״ש')
        ).length;
        
        // Quick hour calculation
        const totalHours = guideShifts.length * 16; // Simplified: 16 hours average per shift
        const salaryFactor = totalHours * 1.2; // Simplified calculation
        
        return {
          name: guide.name,
          total_shifts: guideShifts.length,
          weekday_shifts: weekdayShifts,
          weekend_shifts: weekendShifts,
          conan_shifts: conanShifts,
          motzash_shifts: motzashShifts,
          total_hours: totalHours,
          salary_factor: salaryFactor
        };
      })
    };
    
    // Calculate average
    const avgShifts = quickStats.guides.reduce((sum, g) => sum + g.total_shifts, 0) / quickStats.guides.length;
    
    // Generate quick alerts
    const quickAlerts = [];
    
    // Empty days
    if (quickStats.assigned_days < quickStats.total_days) {
      quickAlerts.push({
        type: 'empty_days',
        severity: 'critical',
        message: `${quickStats.total_days - quickStats.assigned_days} ימים לא שובצו`
      });
    }
    
    // Imbalanced guides
    const imbalanced = quickStats.guides.filter(g => Math.abs(g.total_shifts - avgShifts) > 2);
    if (imbalanced.length > 0) {
      const overloaded = imbalanced.filter(g => g.total_shifts > avgShifts + 2);
      const underloaded = imbalanced.filter(g => g.total_shifts < avgShifts - 2);
      
      if (overloaded.length > 0 && underloaded.length > 0) {
        quickAlerts.push({
          type: 'imbalance',
          severity: 'warning',
          message: `חוסר איזון: ${overloaded[0].name} +${Math.round(overloaded[0].total_shifts - avgShifts)} משמרות, ${underloaded[0].name} ${Math.round(underloaded[0].total_shifts - avgShifts)} משמרות`
        });
      }
    }
    
    // Quick recommendations
    const quickRecommendations = [];
    if (imbalanced.length > 0) {
      const over = imbalanced.find(g => g.total_shifts > avgShifts + 2);
      const under = imbalanced.find(g => g.total_shifts < avgShifts - 2);
      
      if (over && under) {
        quickRecommendations.push(`להעביר משמרת מ${over.name} ל${under.name}`);
      }
    }
    
    res.json({
      success: true,
      quick_stats: quickStats,
      average_shifts: avgShifts.toFixed(1),
      alerts: quickAlerts,
      recommendations: quickRecommendations
    });
    
  } catch (error) {
    console.error('Error generating quick statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate quick statistics'
    });
  }
});

// Helper functions for calculations
// Enhanced hour calculation function with accurate salary factors
function calculateDetailedGuideStats(guide, schedule, weekendTypes) {
    const guideId = guide.id;
    const stats = {
        total_shifts: 0,
        manual_shifts: 0,
        auto_shifts: 0,
        regular_shifts: 0,
        overlap_shifts: 0,
        conan_shifts: 0,
        motzash_shifts: 0,
        weekend_shifts: 0,
        weekday_shifts: 0,
        
        // Hour categories
        regular_hours: 0,
        night_hours: 0,
        shabbat_hours: 0,
        conan_hours: 0,
        conan_shabbat_hours: 0,
        motzash_hours: 0,
        total_hours: 0,
        
        // Salary calculation
        salary_factor: 0
    };
    
    // Process each day in the schedule
    schedule.forEach((day, index) => {
        const isGuide1 = day.guide1_id === guideId;
        const isGuide2 = day.guide2_id === guideId;
        
        if (!isGuide1 && !isGuide2) return;
        
        stats.total_shifts++;
        
        // Track manual vs auto assignments
        if (day.is_manual) {
            stats.manual_shifts++;
        } else {
            stats.auto_shifts++;
        }
        
        // Get role for this guide
        const role = isGuide1 ? (day.guide1_role || 'רגיל') : (day.guide2_role || 'רגיל');
        
        // Count shifts by role
        switch (role) {
            case 'רגיל': stats.regular_shifts++; break;
            case 'חפיפה': stats.overlap_shifts++; break;
            case 'כונן': stats.conan_shifts++; break;
            case 'מוצ״ש': stats.motzash_shifts++; break;
        }
        
        // Determine day type
        const dayOfWeek = new Date(day.date).getDay();
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6; // Friday or Saturday
        const isFriday = dayOfWeek === 5;
        const isSaturday = dayOfWeek === 6;
        
        if (isWeekend) {
            stats.weekend_shifts++;
        } else {
            stats.weekday_shifts++;
        }
        
        // Calculate hours based on role and day type
        const hours = calculateHoursForShift(day, role, weekendTypes, schedule, index);
        
        stats.regular_hours += hours.regular;
        stats.night_hours += hours.night;
        stats.shabbat_hours += hours.shabbat;
        stats.conan_hours += hours.conan;
        stats.conan_shabbat_hours += hours.conan_shabbat;
        stats.motzash_hours += hours.motzash;
    });
    
    // Calculate totals
    stats.total_hours = stats.regular_hours + stats.night_hours + stats.shabbat_hours + 
                       stats.conan_hours + stats.conan_shabbat_hours + stats.motzash_hours;
    
    // Calculate salary factor with accurate multipliers
    stats.salary_factor = (stats.regular_hours * 1.0) +      // Regular hours: 1x
                         (stats.night_hours * 1.5) +         // Night hours: 1.5x
                         (stats.shabbat_hours * 2.0) +       // Shabbat hours: 2x
                         (stats.conan_hours * 0.3) +         // Conan weekday: 0.3x
                         (stats.conan_shabbat_hours * 0.6) + // Conan Shabbat: 0.6x
                         (stats.motzash_hours * 1.0);        // Motzash: 1x
    
    return stats;
}

// Calculate hours for a specific shift
function calculateHoursForShift(day, role, weekendTypes, schedule, dayIndex) {
    const hours = {
        regular: 0,
        night: 0,
        shabbat: 0,
        conan: 0,
        conan_shabbat: 0,
        motzash: 0
    };
    
    const dayOfWeek = new Date(day.date).getDay();
    const isFriday = dayOfWeek === 5;
    const isSaturday = dayOfWeek === 6;
    
    // Check if this is a closed Saturday weekend
    let isClosedSaturday = false;
    if (isFriday) {
        // Check Saturday status
        const saturdayDate = new Date(day.date);
        saturdayDate.setDate(saturdayDate.getDate() + 1);
        const saturdayDateStr = saturdayDate.toISOString().split('T')[0];
        isClosedSaturday = weekendTypes[saturdayDateStr] === true; // true means closed
    } else if (isSaturday) {
        // Check this Saturday's status
        isClosedSaturday = weekendTypes[day.date] === true;
    }
    
    // Calculate hours based on role and day
    switch (role) {
        case 'כונן':
            if (isFriday && isClosedSaturday) {
                // Friday conan for closed Saturday: Friday 09:00 - Saturday 17:00
                hours.conan = 10;           // Friday 09:00-19:00 (10 hours weekday conan)
                hours.conan_shabbat = 22;   // Friday 19:00 - Saturday 17:00 (22 hours Shabbat conan)
            } else {
                // Regular conan (shouldn't happen in weekdays)
                hours.conan = 24;
            }
            break;
            
        case 'מוצ״ש':
            if (isSaturday && isClosedSaturday) {
                // Motzash for closed Saturday: Saturday 17:00 - Sunday 08:00
                hours.shabbat = 2;    // Saturday 17:00-19:00 (2 hours Shabbat)
                hours.regular = 5;    // Saturday 19:00-24:00 (5 hours regular)
                hours.night = 8;      // Sunday 00:00-08:00 (8 hours night)
                hours.motzash = 15;   // Total motzash hours for salary calculation
            } else {
                // Regular Saturday (open)
                hours.shabbat = 16;   // Saturday shift in open Shabbat
            }
            break;
            
        case 'רגיל':
            if (isFriday && !isClosedSaturday) {
                // Regular Friday (open Shabbat)
                hours.regular = 10;   // Friday 09:00-19:00
                hours.shabbat = 14;   // Friday 19:00 - Saturday 09:00
            } else if (isSaturday && !isClosedSaturday) {
                // Regular Saturday (open Shabbat)
                hours.shabbat = 24;   // Full Saturday shift
            } else if (dayOfWeek >= 0 && dayOfWeek <= 4) {
                // Weekday (Sunday-Thursday)
                hours.regular = 16;   // Day shift 09:00 - next day 09:00 (15+1)
                hours.night = 8;      // Night shift 00:00 - 08:00
            }
            break;
            
        case 'חפיפה':
            if (isFriday && !isClosedSaturday) {
                // Handover Friday (open Shabbat)
                hours.regular = 10;   // Friday 09:00-19:00
                hours.shabbat = 15;   // Friday 19:00 - Saturday 10:00 (includes handover)
            } else if (isSaturday && !isClosedSaturday) {
                // Handover Saturday (open Shabbat)
                hours.shabbat = 25;   // Full Saturday + handover hour
            } else if (dayOfWeek >= 0 && dayOfWeek <= 4) {
                // Weekday handover (Sunday-Thursday)
                hours.regular = 17;   // Day shift 09:00 - next day 10:00 (15+2)
                hours.night = 8;      // Night shift 00:00 - 08:00
            }
            break;
    }
    
    return hours;
}

function calculateDayStatistics(schedule, year, month) {
    // Get total days in month
    const totalDays = new Date(year, month, 0).getDate();
    
    // Create set of all dates that should exist
    const allDates = new Set();
    for (let day = 1; day <= totalDays; day++) {
        const date = new Date(year, month - 1, day);
        allDates.add(date.toISOString().split('T')[0]);
    }
    
    // Get assigned dates
    const assignedDates = new Set();
    let manualDays = 0;
    let autoDays = 0;
    
    schedule.forEach(day => {
        if (day.guide1_id || day.guide2_id) {
            assignedDates.add(day.date);
            if (day.is_manual) {
                manualDays++;
            } else {
                autoDays++;
            }
        }
    });
    
    return {
        total_days: totalDays,
        assigned_days: assignedDates.size,
        empty_days: totalDays - assignedDates.size,
        manual_days: manualDays,
        auto_days: autoDays
    };
}

function calculateAverages(guideStatistics) {
    const count = guideStatistics.length;
    if (count === 0) return {};
    
    const totals = guideStatistics.reduce((acc, guide) => {
        Object.keys(guide).forEach(key => {
            if (typeof guide[key] === 'number') {
                acc[key] = (acc[key] || 0) + guide[key];
            }
        });
        return acc;
    }, {});
    
    const averages = {};
    Object.keys(totals).forEach(key => {
        if (key !== 'id') { // Skip id field
            averages[key + '_per_guide'] = totals[key] / count;
        }
    });
    
    // Add convenient aliases
    averages.shifts_per_guide = averages.total_shifts_per_guide || 0;
    averages.hours_per_guide = averages.total_hours_per_guide || 0;
    averages.weekend_per_guide = averages.weekend_shifts_per_guide || 0;
    averages.manual_per_guide = averages.manual_shifts_per_guide || 0;
    averages.auto_per_guide = averages.auto_shifts_per_guide || 0;
    averages.regular_per_guide = averages.regular_shifts_per_guide || 0;
    averages.overlap_per_guide = averages.overlap_shifts_per_guide || 0;
    averages.conan_per_guide = averages.conan_shifts_per_guide || 0;
    averages.motzash_per_guide = averages.motzash_shifts_per_guide || 0;
    
    return averages;
}

function generateRecommendations(guideStatistics, averages) {
    const recommendations = [];
    const avgShifts = averages.shifts_per_guide || 0;
    
    const overloaded = guideStatistics.filter(g => g.total_shifts > avgShifts + 2);
    const underloaded = guideStatistics.filter(g => g.total_shifts < avgShifts - 2);
    
    if (overloaded.length > 0 && underloaded.length > 0) {
        overloaded.forEach(over => {
            underloaded.forEach(under => {
                const difference = over.total_shifts - under.total_shifts;
                if (difference > 3) {
                    recommendations.push({
                        type: 'transfer_shifts',
                        priority: 'high',
                        from_guide: over.name,
                        to_guide: under.name,
                        shifts_to_transfer: Math.ceil(difference / 2),
                        reason: `איזון עומסים: ${over.name} עובד/ת ${over.total_shifts} משמרות, ${under.name} עובד/ת ${under.total_shifts} משמרות`
                    });
                }
            });
        });
    }
    
    // Add vacation recommendations for overloaded guides
    if (overloaded.length > 0) {
        recommendations.push({
            type: 'vacation_suggestion',
            priority: 'medium',
            guide: overloaded[0].name,
            reason: `${overloaded[0].name} עובד/ת ${overloaded[0].total_shifts} משמרות - יותר מהממוצע`
        });
    }
    
    // Add additional shift recommendations for underloaded guides
    if (underloaded.length > 0) {
        recommendations.push({
            type: 'additional_shifts',
            priority: 'medium',
            guide: underloaded[0].name,
            reason: `${underloaded[0].name} עובד/ת ${underloaded[0].total_shifts} משמרות - פחות מהממוצע`
        });
    }
    
    return recommendations;
}

function calculateBalanceMetrics(guideStatistics) {
  const shifts = guideStatistics.map(g => g.total_shifts);
  
  return {
    shifts: {
      min: Math.min(...shifts),
      max: Math.max(...shifts),
      range: Math.max(...shifts) - Math.min(...shifts),
      std_deviation: calculateStandardDeviation(shifts)
    }
  };
}

function calculateStandardDeviation(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
  const variance = squaredDifferences.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
}

console.log('✅ Enhanced Statistics API endpoints loaded successfully');

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Health check endpoint for Fly.io
app.get('/health', (req, res) => {
    try {
        // Check if database is accessible
        const result = db.prepare('SELECT 1 as test').get();
        if (result && result.test === 1) {
            res.status(200).json({ 
                status: 'healthy', 
                timestamp: new Date().toISOString(),
                database: 'connected',
                environment: process.env.NODE_ENV || 'development'
            });
        } else {
            res.status(500).json({ 
                status: 'unhealthy', 
                database: 'error',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({ 
            status: 'unhealthy', 
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log("Node.js API עובד על http://localhost:" + PORT);
    console.log("Frontend available at http://localhost:" + PORT);
});

// ------- fixed constraints API --------

const FIXED_CONSTRAINTS_FILE = './fixed_constraints.json';

// Helper: טען אילוצים קבועים
function loadFixedConstraints() {
    if (!fs.existsSync(FIXED_CONSTRAINTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(FIXED_CONSTRAINTS_FILE));
}

// Helper: שמור אילוצים קבועים
function saveFixedConstraints(list) {
    fs.writeFileSync(FIXED_CONSTRAINTS_FILE, JSON.stringify(list, null, 2));
}

// שלוף את כל האילוצים הקבועים
app.get('/api/fixed-constraints', (req, res) => {
  const rows = db.prepare(`
    SELECT f.id, f.user_id, f.weekday, f.details, u.name as guideName
    FROM fixed_constraints f
    LEFT JOIN users u ON f.user_id = u.id
  `).all();
  const fixed = rows.map(row => ({
    id: row.id,
    guideId: row.user_id,
    weekday: row.weekday,
    note: row.details,
    name: row.guideName
  }));
  res.json(fixed);
});

// הוסף אילוץ קבוע חדש
app.post('/api/fixed-constraints', (req, res) => {
  const { guideId, weekday, hourStart, hourEnd, note } = req.body;
  const stmt = db.prepare('INSERT INTO fixed_constraints (user_id, weekday, hour_start, hour_end, details) VALUES (?, ?, ?, ?, ?)');
  const info = stmt.run(guideId, weekday, hourStart || '', hourEnd || '', note || '');
  const constraint = db.prepare('SELECT * FROM fixed_constraints WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...constraint, guideId: constraint.user_id });
});

// עדכן אילוץ קבוע קיים
app.put('/api/fixed-constraints/:id', (req, res) => {
  const { guideId, weekday, hourStart, hourEnd, note } = req.body;
  const id = req.params.id;
  const constraint = db.prepare('SELECT * FROM fixed_constraints WHERE id = ?').get(id);
  if (!constraint) return res.status(404).json({ error: 'לא נמצא' });
  db.prepare('UPDATE fixed_constraints SET user_id = ?, weekday = ?, hour_start = ?, hour_end = ?, details = ? WHERE id = ?')
    .run(guideId, weekday, hourStart || '', hourEnd || '', note || '', id);
  const updated = db.prepare('SELECT * FROM fixed_constraints WHERE id = ?').get(id);
  res.json({ ...updated, guideId: updated.user_id });
});

// מחק אילוץ קבוע
app.delete('/api/fixed-constraints/:id', (req, res) => {
  const id = req.params.id;
  const constraint = db.prepare('SELECT * FROM fixed_constraints WHERE id = ?').get(id);
  if (!constraint) return res.status(404).json({ error: 'לא נמצא' });
  db.prepare('DELETE FROM fixed_constraints WHERE id = ?').run(id);
  res.json({ ok: true });
});

// --- VACATIONS API (SQLite) ---
app.get('/api/vacations', (req, res) => {
  const rows = db.prepare('SELECT * FROM vacations').all();
  const mapped = rows.map(v => ({
    ...v,
    guideId: v.user_id,
    dateStart: v.date_start,
    dateEnd: v.date_end,
    responseNote: v.response_note
  }));
  res.json(mapped);
});
app.post('/api/vacations', (req, res) => {
  const { guideId, dateStart, dateEnd, note } = req.body;
  const stmt = db.prepare('INSERT INTO vacations (user_id, date_start, date_end, note, status, response_note) VALUES (?, ?, ?, ?, ?, ?)');
  const info = stmt.run(guideId, dateStart, dateEnd, note, 'pending', '');
  const vacation = db.prepare('SELECT * FROM vacations WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({
    ...vacation,
    guideId: vacation.user_id,
    dateStart: vacation.date_start,
    dateEnd: vacation.date_end,
    responseNote: vacation.response_note
  });
});

// עדכן בקשת חופשה (למשל: שינוי סטטוס ע"י רכז)
app.put('/api/vacations/:id', (req, res) => {
    const list = loadVacations();
    const idx = list.findIndex(v => v.id == req.params.id);
    if (idx === -1) return res.status(404).json({error: "לא נמצא"});
    list[idx] = {...list[idx], ...req.body};
    saveVacations(list);
    res.json(list[idx]);
});

// מחק בקשת חופשה
app.delete('/api/vacations/:id', (req, res) => {
  const id = req.params.id;
  const vacation = db.prepare('SELECT * FROM vacations WHERE id = ?').get(id);
  if (!vacation) return res.status(404).json({ error: 'לא נמצא' });
  db.prepare('DELETE FROM vacations WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
    const { role, password, guide } = req.body;
    // Find user in DB by name and role
    const user = db.prepare('SELECT * FROM users WHERE name = ? AND role = ?').get(guide, role);
    if (!user) {
        return res.status(401).json({ error: 'משתמש לא נמצא' });
    }
    if (user.password !== password) {
        return res.status(401).json({ error: 'סיסמה שגויה' });
    }
    return res.json({ ok: true, name: user.name, role: user.role, userId: user.id });
});

// --- Conversation API (SQLite) ---

// Get all conversations for a user (by user_id)
app.get('/api/conversations', (req, res) => {
  const userId = Number(req.query.user);
  if (!userId) return res.status(400).json({ error: 'Missing user param' });
  // Find all conversation_ids for this user
  const convIds = db.prepare('SELECT conversation_id FROM conversation_participants WHERE user_id = ?').all(userId).map(r => r.conversation_id);
  if (!convIds.length) return res.json([]);
  // Get conversation details
  const conversations = convIds.map(cid => {
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(cid);
    if (!conv) return null;
    // Get participants
    const participants = db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id = ?').all(cid).map(r => r.user_id);
    return { ...conv, participants };
  }).filter(Boolean);
  res.json(conversations);
});

// Create a new conversation
app.post('/api/conversations', (req, res) => {
  const { participants } = req.body;
  if (!participants || !Array.isArray(participants) || participants.length < 2) {
    return res.status(400).json({ error: 'Must provide at least two participants' });
  }
  // Check if a conversation with exactly these participants already exists
  const candidateConvs = db.prepare('SELECT c.id FROM conversations c JOIN conversation_participants p ON c.id = p.conversation_id WHERE p.user_id IN (' + participants.map(() => '?').join(',') + ') GROUP BY c.id HAVING COUNT(DISTINCT p.user_id) = ?').all(...participants, participants.length);
  for (const row of candidateConvs) {
    // Check if this conversation has only these participants
    const convParts = db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id = ?').all(row.id).map(r => r.user_id);
    if (convParts.length === participants.length && convParts.every(id => participants.includes(id))) {
      // Conversation already exists
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(row.id);
      return res.json({ ...conv, participants: convParts });
    }
  }
  // Create new conversation
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO conversations (updated_at) VALUES (?)').run(now);
  const convId = info.lastInsertRowid;
  for (const userId of participants) {
    db.prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)').run(convId, userId);
  }
  res.status(201).json({ id: convId, updated_at: now, participants });
});

// Get all messages in a conversation
app.get('/api/conversations/:id/messages', (req, res) => {
  const convId = Number(req.params.id);
  if (!req.params.id || isNaN(convId) || convId <= 0) {
    return res.status(400).json({ error: 'Missing or invalid conversation id' });
  }
  // Optionally, check if conversation exists
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(convId);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC').all(convId);
  res.json(messages);
});

// Send a new message to a conversation
app.post('/api/conversations/:id/messages', (req, res) => {
  const convId = Number(req.params.id);
  const { from, text } = req.body;
  if (!convId || !from || !text) return res.status(400).json({ error: 'Missing fields' });
  // Find the other participant
  const participants = db.prepare('SELECT user_id FROM conversation_participants WHERE conversation_id = ?').all(convId).map(r => r.user_id);
  const to = participants.find(uid => uid !== from);
  if (!to) return res.status(400).json({ error: 'Could not determine recipient' });
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO messages (conversation_id, from_user_id, to_user_id, text, timestamp) VALUES (?, ?, ?, ?, ?)').run(convId, from, to, text, now);
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, convId);
  res.json({ success: true, message: { id: info.lastInsertRowid, conversation_id: convId, from_user_id: from, to_user_id: to, text, timestamp: now } });
});

// ------- tasks API --------

// Get all tasks from the database with user names
app.get('/api/tasks', (req, res) => {
    const rows = db.prepare(`
        SELECT 
            t.*,
            u1.name as creator_name,
            u2.name as assigned_to_name,
            u3.name as closed_by_name
        FROM tasks t
        LEFT JOIN users u1 ON t.creator_id = u1.id
        LEFT JOIN users u2 ON t.assigned_to_id = u2.id  
        LEFT JOIN users u3 ON t.closed_by_id = u3.id
        ORDER BY t.created_at DESC
    `).all();
    res.json(rows);
});

// Add a new task to the database
app.post('/api/tasks', (req, res) => {
    const { text, created_at, creator_id, assigned_to_id, status, shift_date, notes } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing task text' });

    const stmt = db.prepare(`
        INSERT INTO tasks (text, created_at, creator_id, assigned_to_id, status, shift_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
        text,
        created_at || new Date().toISOString(),
        creator_id || null,
        assigned_to_id || null,
        status || 'פתוח',
        shift_date || null,
        notes || null
    );
    const newTask = db.prepare(`
        SELECT 
            t.*,
            u1.name as creator_name,
            u2.name as assigned_to_name,
            u3.name as closed_by_name
        FROM tasks t
        LEFT JOIN users u1 ON t.creator_id = u1.id
        LEFT JOIN users u2 ON t.assigned_to_id = u2.id  
        LEFT JOIN users u3 ON t.closed_by_id = u3.id
        WHERE t.id = ?
    `).get(info.lastInsertRowid);
    res.status(201).json(newTask);
});

// Update an existing task in the database
app.put('/api/tasks/:id', (req, res) => {
    const id = req.params.id;
    const fields = [
        'text', 'created_at', 'creator_id', 'assigned_to_id', 'status',
        'shift_date', 'notes', 'closed_by_id', 'closed_at'
    ];
    const updates = [];
    const values = [];

    fields.forEach(field => {
        if (req.body[field] !== undefined) {
            updates.push(`${field} = ?`);
            values.push(req.body[field]);
        }
    });

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);

    const stmt = db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    if (result.changes === 0) {
        return res.status(404).json({ error: 'Task not found' });
    }

    const updatedTask = db.prepare(`
        SELECT 
            t.*,
            u1.name as creator_name,
            u2.name as assigned_to_name,
            u3.name as closed_by_name
        FROM tasks t
        LEFT JOIN users u1 ON t.creator_id = u1.id
        LEFT JOIN users u2 ON t.assigned_to_id = u2.id  
        LEFT JOIN users u3 ON t.closed_by_id = u3.id
        WHERE t.id = ?
    `).get(id);
    res.json(updatedTask);
});

// Delete a task from the database
app.delete('/api/tasks/:id', (req, res) => {
    const id = req.params.id;
    const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
        return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ ok: true });
});

// --- WEEKLY ACTIVITIES ---
function loadWeeklyActivities() {
    try {
        const rows = db.prepare('SELECT * FROM weekly_activities ORDER BY weekday, time').all();
        return rows.map(row => ({
            id: row.id,
            weekday: row.weekday,
            time: row.time,
            duration: row.duration,
            title: row.title,
            category: row.category,
            facilitator: row.facilitator
        }));
    } catch (error) {
        console.error('Error loading weekly activities:', error);
        return [];
    }
}

function saveWeeklyActivities(list) {
    try {
        // Clear existing data
        db.prepare('DELETE FROM weekly_activities').run();
        
        // Insert new data
        const insert = db.prepare('INSERT INTO weekly_activities (id, weekday, time, duration, title, category, facilitator) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const activity of list) {
            insert.run(
                activity.id,
                activity.weekday,
                activity.time,
                activity.duration || null,
                activity.title,
                activity.category || null,
                activity.facilitator || null
            );
        }
    } catch (error) {
        console.error('Error saving weekly activities:', error);
    }
}

// קבלת כל הלו"ז השבועי
app.get('/api/weekly-activities', (req, res) => {
    res.json(loadWeeklyActivities());
});

// הוספת פעילות חדשה
app.post('/api/weekly-activities', (req, res) => {
    const list = loadWeeklyActivities();
    const newActivity = req.body;
    newActivity.id = Date.now();
    list.push(newActivity);
    saveWeeklyActivities(list);
    res.status(201).json(newActivity);
});

// עדכון פעילות קיימת
app.put('/api/weekly-activities/:id', (req, res) => {
    const list = loadWeeklyActivities();
    const idx = list.findIndex(a => a.id == req.params.id);
    if (idx === -1) return res.status(404).json({error: "לא נמצא"});
    list[idx] = {...list[idx], ...req.body};
    saveWeeklyActivities(list);
    res.json(list[idx]);
});

// מחיקת פעילות
app.delete('/api/weekly-activities/:id', (req, res) => {
    let list = loadWeeklyActivities();
    const prevLength = list.length;
    list = list.filter(a => a.id != req.params.id);
    if (list.length === prevLength) return res.status(404).json({error: "לא נמצא"});
    saveWeeklyActivities(list);
    res.json({ok: true});
});

const WEEKLY_OVERRIDES_FILE = './overrides_activities.json';

function loadWeeklyOverrides() {
    if (!fs.existsSync(WEEKLY_OVERRIDES_FILE)) return [];
    return JSON.parse(fs.readFileSync(WEEKLY_OVERRIDES_FILE));
}
function saveWeeklyOverrides(list) {
    fs.writeFileSync(WEEKLY_OVERRIDES_FILE, JSON.stringify(list, null, 2));
}

app.get('/api/weekly-overrides', (req, res) => {
    res.json(loadWeeklyOverrides());
});
app.post('/api/weekly-overrides', (req, res) => {
    const list = loadWeeklyOverrides();
    const newOverride = req.body;
    newOverride.id = Date.now();
    list.push(newOverride);
    saveWeeklyOverrides(list);
    res.status(201).json(newOverride);
});
app.put('/api/weekly-overrides/:id', (req, res) => {
    const list = loadWeeklyOverrides();
    const idx = list.findIndex(a => a.id == req.params.id);
    if (idx === -1) return res.status(404).json({error: "לא נמצא"});
    list[idx] = {...list[idx], ...req.body};
    saveWeeklyOverrides(list);
    res.json(list[idx]);
});
app.delete('/api/weekly-overrides/:id', (req, res) => {
    let list = loadWeeklyOverrides();
    const prevLength = list.length;
    list = list.filter(a => a.id != req.params.id);
    if (list.length === prevLength) return res.status(404).json({error: "לא נמצא"});
    saveWeeklyOverrides(list);
    res.json({ok: true});
});
// -- SCHEDULE DRAFT API --
// Remove old file-based saveScheduleDraft
// function saveScheduleDraft(draft) { ... }
// app.post('/api/schedule-draft', ...)

// New: Save draft to DB
app.post('/api/schedule-draft', (req, res) => {
  const { name, data } = req.body;
  if (!name || !Array.isArray(data)) {
      return res.status(400).json({ error: 'Missing name or data' });
  }
  // Remove any existing draft with this name
  db.prepare('DELETE FROM schedule_draft WHERE name = ?').run(name);
  // Insert each day in the draft with the name
  const insert = db.prepare('INSERT INTO schedule_draft (date, weekday, type, guide1_id, guide2_id, name) VALUES (?, ?, ?, ?, ?, ?)');
  for (const row of data) {
      insert.run(row.date, row.weekday, row.type, row.guide1_id || null, row.guide2_id || null, name);
  }
  res.json({ ok: true });
});
app.get('/api/schedule-draft', (req, res) => {
    const name = req.query.name;
    if (name) {
        // Get specific draft by name
        const rows = db.prepare('SELECT * FROM schedule_draft WHERE name = ? ORDER BY date').all(name);
        res.json(rows);
    } else {
        // Get all drafts
        const rows = db.prepare('SELECT * FROM schedule_draft ORDER BY date').all();
        res.json(rows);
    }
});

// List all unique draft names
app.get('/api/schedule-drafts', (req, res) => {
    const rows = db.prepare('SELECT DISTINCT name FROM schedule_draft WHERE name IS NOT NULL AND name != ?').all('');
    const names = rows.map(r => r.name);
    res.json(names);
});

// Delete a draft by name
app.delete('/api/schedule-draft', (req, res) => {
    const name = req.query.name;
    if (!name) {
        return res.status(400).json({ error: 'Missing name parameter' });
    }
    
    try {
        const result = db.prepare('DELETE FROM schedule_draft WHERE name = ?').run(name);
        if (result.changes > 0) {
            res.json({ ok: true, message: `Draft "${name}" deleted successfully` });
        } else {
            res.status(404).json({ error: 'Draft not found' });
        }
    } catch (err) {
        console.error('Error deleting draft:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

console.log("Schedule draft API loaded");
// ------- schedule API (using database) --------

// שלוף את כל הסידור הרשמי מהמסד
app.get('/api/schedule', (req, res) => {
    try {
        const month = req.query.month; // אופציונלי: סינון לפי חודש
        let query = `
            SELECT 
                s.date, 
                s.weekday, 
                s.type,
                u1.name as guide1,
                u2.name as guide2
            FROM schedule s
            LEFT JOIN users u1 ON s.guide1_id = u1.id
            LEFT JOIN users u2 ON s.guide2_id = u2.id
            ORDER BY s.date ASC
        `;
        let params = [];
        
        if (month) {
            query = `
                SELECT 
                    s.date, 
                    s.weekday, 
                    s.type,
                    u1.name as guide1,
                    u2.name as guide2
                FROM schedule s
                LEFT JOIN users u1 ON s.guide1_id = u1.id
                LEFT JOIN users u2 ON s.guide2_id = u2.id
                WHERE s.date LIKE ?
                ORDER BY s.date ASC
            `;
            params = [month + '%'];
        }
        
        const rows = db.prepare(query).all(...params);
        // Convert nulls to empty strings for frontend compatibility
        const schedule = rows.map(row => ({
            ...row,
            guide1: row.guide1 || '',
            guide2: row.guide2 || ''
        }));
        
        res.json(schedule);
    } catch (err) {
        console.error('Error fetching schedule:', err);
        res.status(500).json({ error: 'Failed to fetch schedule' });
    }
});

// שמור סידור רשמי חדש (מחיקה/דריסה של הקודם)
app.post('/api/schedule', (req, res) => {
    const list = req.body;
    
    try {
        // --- ENFORCE no_oncall RULE ---
        // Load all no_oncall rules from DB
        const noOncallRules = db.prepare("SELECT guide_id FROM scheduling_rules WHERE type = 'no_oncall'").all().map(r => String(r.guide_id));
        
        // Convert guide names to IDs for validation
        const allGuides = db.prepare('SELECT * FROM users WHERE role = ?').all('מדריך');
        const guideNameToId = {};
        allGuides.forEach(g => guideNameToId[g.name] = g.id);
        
        // Validate each day in the schedule
        for (const day of list) {
            if (day.type === 'שבת סגורה' && day.guide1) {
                const guide1Id = guideNameToId[day.guide1];
                if (guide1Id && noOncallRules.includes(String(guide1Id))) {
                    return res.status(400).json({
                        error: `Guide ${day.guide1} is blocked from on-call assignment on closed Shabbat (שבת סגורה) due to a custom rule.`
                    });
                }
            }
        }
        
        // מחק את הסידור הקיים
        db.prepare('DELETE FROM schedule').run();
        
        // הכנס את הסידור החדש
        const insertStmt = db.prepare('INSERT INTO schedule (date, weekday, type, guide1_id, guide2_id) VALUES (?, ?, ?, ?, ?)');
        
        for (const day of list) {
            const guide1_id = day.guide1 ? guideNameToId[day.guide1] || null : null;
            const guide2_id = day.guide2 ? guideNameToId[day.guide2] || null : null;
            
            insertStmt.run(day.date, day.weekday, day.type, guide1_id, guide2_id);
        }
        
        res.status(201).json({ok: true});
    } catch (err) {
        console.error('Error saving schedule:', err);
        res.status(500).json({ error: 'Failed to save schedule' });
    }
});

// ------- doctor referrals API --------
const REFERRALS_FILE = './referrals.json';

function loadReferrals() {
    if (!fs.existsSync(REFERRALS_FILE)) return [];
    return JSON.parse(fs.readFileSync(REFERRALS_FILE));
}

function saveReferrals(list) {
    fs.writeFileSync(REFERRALS_FILE, JSON.stringify(list, null, 2));
}

// שלוף לפי תאריך
app.get('/api/doctor-referrals', (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "חסר תאריך" });
    const all = loadReferrals();
    const filtered = all.filter(r => r.date === date);
    res.json(filtered);
});

// הוסף הפנייה חדשה
app.post('/api/doctor-referrals', (req, res) => {
    const { patient, reason, doctor, date, createdBy } = req.body;
    if (!patient || !reason || !doctor || !date) {
        return res.status(400).json({ error: "שדות חסרים" });
    }

    const all = loadReferrals();
    const newReferral = {
        id: Date.now(),
        patient,
        reason,
        doctor,
        date,
        createdBy,
        createdAt: new Date().toISOString()
    };

    all.push(newReferral);
    saveReferrals(all);
    res.status(201).json(newReferral);
});
// עדכון הפנייה (לסימון כבוצע או להעברה לתאריך אחר)
app.put('/api/doctor-referrals/:id', (req, res) => {
    const referrals = loadReferrals();
    const idx = referrals.findIndex(r => r.id == req.params.id);
    if (idx === -1) return res.status(404).json({ error: "לא נמצא" });

    referrals[idx] = { ...referrals[idx], ...req.body };
    saveReferrals(referrals);
    res.json(referrals[idx]);
});

// --- Scheduling Rules API ---
app.get('/api/scheduling-rules', (req, res) => {
  const rules = db.prepare('SELECT * FROM scheduling_rules').all();
  res.json(rules);
});

app.post('/api/scheduling-rules', (req, res) => {
  const { type, guide_id, guide2_id, created_by, description, role } = req.body;
  if (role !== 'רכז') return res.status(403).json({ error: 'Unauthorized' });
  if (!type || !guide_id) return res.status(400).json({ error: 'Missing required fields' });
  const now = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO scheduling_rules (type, guide_id, guide2_id, created_by, created_at, description) VALUES (?, ?, ?, ?, ?, ?)');
  const info = stmt.run(type, guide_id, guide2_id || null, created_by || null, now, description || '');
  const rule = db.prepare('SELECT * FROM scheduling_rules WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(rule);
});

app.delete('/api/scheduling-rules/:id', (req, res) => {
  const { role } = req.body;
  if (role !== 'רכז') return res.status(403).json({ error: 'Unauthorized' });
  const id = req.params.id;
  const rule = db.prepare('SELECT * FROM scheduling_rules WHERE id = ?').get(id);
  if (!rule) return res.status(404).json({ error: 'לא נמצא' });
  db.prepare('DELETE FROM scheduling_rules WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Get status for a specific שבת
app.get('/api/shabbat-status', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  const row = db.prepare('SELECT * FROM shabbat_status WHERE date = ?').get(date);
  res.json(row || { date, status: 'פתוחה' }); // default: פתוחה
});

// Set status for a specific שבת
app.post('/api/shabbat-status', (req, res) => {
  const { date, status } = req.body;
  if (!date || !status) return res.status(400).json({ error: 'Missing date or status' });
  db.prepare('INSERT OR REPLACE INTO shabbat_status (date, status) VALUES (?, ?)').run(date, status);
  res.json({ ok: true });
});

// Get all שבת statuses
app.get('/api/shabbat-status/all', (req, res) => {
  const rows = db.prepare('SELECT * FROM shabbat_status').all();
  res.json(rows);
});

// --- REPORTS SUMMARY API ---
app.get('/api/reports/summary', (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });
  // Load guides from database
  const guides = db.prepare('SELECT * FROM users WHERE role = ?').all('מדריך');
  const guideMap = {};
  guides.forEach(g => { guideMap[g.name] = g; });
  // Load schedule from database
  const schedule = db.prepare('SELECT * FROM schedule WHERE date >= ? AND date <= ? ORDER BY date ASC').all(from, to);
  // Filter by date
  const filtered = schedule.filter(s => s.date >= from && s.date <= to);
  // Init summary
  const summary = {};
  guides.forEach(g => {
    summary[g.name] = {
      guideId: g.id,
      name: g.name,
      totalHours: 0,
      totalFactored: 0,
      regular: 0,
      night: 0,
      shabbat: 0,
      conan: 0,
      motzash: 0
    };
  });
  // Placeholder logic: count 1 hour per assignment per day per type
  filtered.forEach(day => {
    // רגיל: ימים א'-ה'
    if (["ראשון","שני","שלישי","רביעי","חמישי"].includes(day.weekday)) {
      if (day.guide1 && summary[day.guide1]) summary[day.guide1].regular += 8;
      if (day.guide2 && summary[day.guide2]) summary[day.guide2].regular += 8;
    }
    // שישי
    if (day.weekday === "שישי") {
      if (day.guide1 && summary[day.guide1]) summary[day.guide1].regular += 8;
      if (day.guide2 && summary[day.guide2]) summary[day.guide2].regular += 8;
    }
    // שבת
    if (day.weekday === "שבת") {
      if (day.guide1 && summary[day.guide1]) summary[day.guide1].shabbat += 8;
      if (day.guide2 && summary[day.guide2]) summary[day.guide2].shabbat += 8;
    }
    // TODO: refine logic for night, conan, motzash based on your rules
  });
  // Calculate totals (placeholder factors)
  Object.values(summary).forEach(s => {
    s.totalHours = s.regular + s.night + s.shabbat + s.conan + s.motzash;
    s.totalFactored = s.regular + 1.5*s.night + 2*s.shabbat + 0.3*s.conan + s.motzash; // motzash = רגיל
  });
  res.json(Object.values(summary));
});

// --- REPORTS SUMMARY DRAFT API ---
app.get('/api/reports/summary-draft', (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });
  // Load guides
  const guides = db.prepare('SELECT * FROM users WHERE role = ?').all('מדריך');
  const guideMap = {};
  guides.forEach(g => { guideMap[g.id] = g; });
  // Load schedule_draft
  const schedule = db.prepare('SELECT * FROM schedule_draft WHERE date >= ? AND date <= ? ORDER BY date ASC').all(from, to);
  // Load shabbat status from database (TODO: migrate to DB table)
  let shabbatStatus = {};
  try {
    shabbatStatus = JSON.parse(fs.readFileSync('shabbat_status.json', 'utf8'));
  } catch (e) {
    console.log('shabbat_status.json not found, using empty object');
  }
  // Init summary
  const summary = {};
  guides.forEach(g => {
    summary[g.id] = {
      guideId: g.id,
      name: g.name,
      totalHours: 0,
      totalFactored: 0,
      regular: 0,
      night: 0,
      shabbat: 0,
      conan: 0,
      conan_shabbat: 0,
      motzash: 0
    };
  });
  // Helper: add hours to summary
  function addHours(guideId, type, hours) {
    if (!summary[guideId]) return;
    summary[guideId][type] += hours;
  }
  // Accurate logic per day/role
  schedule.forEach((day, idx) => {
    const weekday = day.weekday;
    const date = day.date;
    const type = day.type;
    const isShabbatClosed = shabbatStatus[date] === 'סגורה' || type === 'שבת סגורה';
    // Friday
    if (weekday === 'שישי') {
      // Find next day (Saturday)
      const nextDay = schedule[idx+1];
      const isClosed = nextDay && (shabbatStatus[nextDay.date] === 'סגורה' || nextDay.type === 'שבת סגורה');
      // Conan (שבת סגורה): guide1 is conan from Fri 09:00 to Sat 17:00
      if (isClosed && day.guide1_id && summary[day.guide1_id]) {
        // 09:00-19:00 Friday (10h regular conan)
        addHours(day.guide1_id, 'conan', 10);
        // 19:00-24:00 Friday (5h shabbat conan)  
        addHours(day.guide1_id, 'conan_shabbat', 5);
        // Saturday 00:00-17:00 (17h shabbat conan)
        if (nextDay && nextDay.guide1_id === day.guide1_id) {
          addHours(day.guide1_id, 'conan_shabbat', 17);
        }
        // 17:00-19:00 Saturday (2h shabbat, motzash guide)
        if (nextDay && nextDay.guide2_id && summary[nextDay.guide2_id]) {
          addHours(nextDay.guide2_id, 'motzash', 2);
        }
        // 19:00-24:00 Saturday (5h regular, motzash guide)
        if (nextDay && nextDay.guide2_id && summary[nextDay.guide2_id]) {
          addHours(nextDay.guide2_id, 'regular', 5);
        }
      } else {
        // Not closed: regular Friday
        if (day.guide1_id && summary[day.guide1_id]) addHours(day.guide1_id, 'regular', 8);
        if (day.guide2_id && summary[day.guide2_id]) addHours(day.guide2_id, 'regular', 8);
      }
    }
    // Saturday
    else if (weekday === 'שבת') {
      const prevDay = schedule[idx-1];
      const isClosed = shabbatStatus[date] === 'סגורה' || type === 'שבת סגורה';
      if (isClosed && prevDay && prevDay.weekday === 'שישי') {
        // Already handled in Friday logic
        // Only add motzash/regular for guide2 (motzash)
        // (handled above)
      } else {
        // Open shabbat: guide1+guide2 get 24h shabbat
        if (day.guide1_id && summary[day.guide1_id]) addHours(day.guide1_id, 'shabbat', 12);
        if (day.guide2_id && summary[day.guide2_id]) addHours(day.guide2_id, 'shabbat', 12);
      }
    }
    // Weekdays
    else if (["ראשון","שני","שלישי","רביעי","חמישי"].includes(weekday)) {
      if (day.guide1_id && summary[day.guide1_id]) addHours(day.guide1_id, 'regular', 8);
      if (day.guide2_id && summary[day.guide2_id]) addHours(day.guide2_id, 'regular', 8);
      // Night: 00:00-08:00 (8h) for both guides
      if (day.guide1_id && summary[day.guide1_id]) addHours(day.guide1_id, 'night', 8);
      if (day.guide2_id && summary[day.guide2_id]) addHours(day.guide2_id, 'night', 8);
    }
  });
  // Calculate totals (accurate factors)
  Object.values(summary).forEach(s => {
    s.totalHours = s.regular + s.night + s.shabbat + s.conan + s.conan_shabbat + s.motzash;
    s.totalFactored = s.regular + 1.5*s.night + 2*s.shabbat + 0.3*s.conan + 0.6*s.conan_shabbat + s.motzash;
  });
  res.json(Object.values(summary));
});

// =====================================================
// PHASE 1 TASK 2: ENHANCED API ENDPOINTS
// =====================================================

// Helper function to get weekday name
function getWeekday(dateStr) {
  const date = new Date(dateStr);
  const weekdays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return weekdays[date.getDay()];
}

// =====================================================
// 1. ENHANCED GUIDE MANAGEMENT ENDPOINTS
// =====================================================

// Get all guides with enhanced information
app.get('/api/guides/enhanced', (req, res) => {
  try {
    const guides = db.prepare(`
      SELECT 
        u.id, u.name, u.role, u.email, u.phone, u.percent, 
        COALESCE(u.is_active, 1) as is_active,
        u.created_at, u.updated_at,
        COUNT(s.id) as total_shifts,
        COUNT(CASE WHEN s.is_manual = 1 THEN 1 END) as manual_shifts,
        COUNT(CASE WHEN s.is_manual = 0 THEN 1 END) as auto_shifts
      FROM users u
      LEFT JOIN schedule s ON (u.id = s.guide1_id OR u.id = s.guide2_id)
      WHERE u.role = 'מדריך'
      GROUP BY u.id, u.name, u.role
      ORDER BY u.name
    `).all();
    
    res.json(guides);
  } catch (error) {
    console.error('Error fetching enhanced guides:', error);
    res.status(500).json({ error: 'Failed to fetch guides' });
  }
});

// Get guide availability for a specific date
app.get('/api/guides/availability/:date', (req, res) => {
  try {
    const { date } = req.params;
    
    const availability = db.prepare(`
      SELECT 
        u.id as guide_id,
        u.name as guide_name,
        u.role as guide_role,
        CASE 
          WHEN v.id IS NOT NULL OR c.id IS NOT NULL OR fc.id IS NOT NULL OR consecutive_prev.id IS NOT NULL OR consecutive_next.id IS NOT NULL THEN 'blocked'
          ELSE 'available'
        END as status,
        CASE 
          WHEN v.id IS NOT NULL THEN 'חופשה מאושרת'
          WHEN c.id IS NOT NULL THEN COALESCE(c.details, 'אילוץ אישי')
          WHEN fc.id IS NOT NULL THEN COALESCE(fc.details, 'אילוץ קבוע')
          WHEN consecutive_prev.id IS NOT NULL THEN 'עבד אתמול'
          WHEN consecutive_next.id IS NOT NULL THEN 'עובד מחר'
          WHEN cr_no_conan.id IS NOT NULL THEN COALESCE(cr_no_conan.description, 'לא לשבץ ככונן')
          ELSE NULL
        END as reason,
        CASE 
          WHEN v.id IS NOT NULL THEN 0
          WHEN c.id IS NOT NULL THEN 1
          WHEN fc.id IS NOT NULL THEN 1
          WHEN consecutive_prev.id IS NOT NULL THEN 1
          WHEN consecutive_next.id IS NOT NULL THEN 1
          WHEN cr_no_conan.id IS NOT NULL THEN 1
          ELSE 0
        END as override_enabled,
        CASE 
          WHEN v.id IS NOT NULL THEN 'vacation'
          WHEN c.id IS NOT NULL THEN 'constraint'
          WHEN fc.id IS NOT NULL THEN 'fixed_constraint'
          WHEN consecutive_prev.id IS NOT NULL THEN 'consecutive'
          WHEN consecutive_next.id IS NOT NULL THEN 'consecutive'
          WHEN cr_no_conan.id IS NOT NULL THEN 'coordinator_rule'
          ELSE NULL
        END as constraint_type,
        COALESCE((
          SELECT COUNT(*) 
          FROM schedule 
          WHERE (guide1_id = u.id OR guide2_id = u.id) 
          AND strftime('%Y-%m', date) = strftime('%Y-%m', ?)
        ), 0) as total_shifts,
        v.id as vacation_id,
        c.id as constraint_id,
        fc.id as fixed_constraint_id,
        consecutive_prev.id as consecutive_prev_id,
        consecutive_next.id as consecutive_next_id,
        cr_no_auto.id as coordinator_rule_no_auto_id,
        cr_no_conan.id as coordinator_rule_no_conan_id
      FROM users u
      LEFT JOIN constraints c ON u.id = c.user_id AND c.date = ?
      LEFT JOIN fixed_constraints fc ON u.id = fc.user_id AND CAST(strftime('%w', ?) AS INTEGER) = fc.weekday
      LEFT JOIN vacations v ON u.id = v.user_id AND ? BETWEEN v.date_start AND v.date_end AND v.status = 'approved'
      LEFT JOIN schedule consecutive_prev ON (consecutive_prev.guide1_id = u.id OR consecutive_prev.guide2_id = u.id) 
        AND consecutive_prev.date = date(?, '-1 day')
      LEFT JOIN schedule consecutive_next ON (consecutive_next.guide1_id = u.id OR consecutive_next.guide2_id = u.id) 
        AND consecutive_next.date = date(?, '+1 day')
      LEFT JOIN coordinator_rules cr_no_auto ON u.id = cr_no_auto.guide1_id AND cr_no_auto.rule_type = 'no_auto_scheduling' AND cr_no_auto.is_active = 1
      LEFT JOIN coordinator_rules cr_no_conan ON u.id = cr_no_conan.guide1_id AND cr_no_conan.rule_type = 'no_conan' AND cr_no_conan.is_active = 1
      WHERE u.role = 'מדריך' AND COALESCE(u.is_active, 1) = 1
      ORDER BY u.name
    `).all(date, date, date, date, date, date);
    
    res.json(availability);
  } catch (error) {
    console.error('Error fetching guide availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// =====================================================
// 2. ENHANCED SCHEDULE MANAGEMENT ENDPOINTS
// =====================================================

// Get weekend type for a specific date
app.get('/api/weekend-type/:date', (req, res) => {
  try {
    const { date } = req.params;
    
    const weekendType = db.prepare(`
      SELECT is_closed FROM weekend_types WHERE date = ?
    `).get(date);
    
    res.json({ is_closed: weekendType ? weekendType.is_closed : 0 });
  } catch (error) {
    console.error('Error fetching weekend type:', error);
    res.status(500).json({ error: 'Failed to fetch weekend type' });
  }
});

// Set weekend type for a specific date
app.post('/api/weekend-type/:date', (req, res) => {
  try {
    const { date } = req.params;
    const { is_closed } = req.body;
    
    db.prepare(`
      INSERT OR REPLACE INTO weekend_types (date, is_closed, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(date, is_closed ? 1 : 0);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting weekend type:', error);
    res.status(500).json({ error: 'Failed to set weekend type' });
  }
});

// Clear all assignments for a month
app.delete('/api/schedule/clear-month', (req, res) => {
  try {
    const { year, month } = req.body;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    
    console.log(`Clearing all data for month: ${monthKey}`);
    
    // Start transaction for data consistency
    const transaction = db.transaction(() => {
      let totalChanges = 0;
      
      // 1. Clear all schedule entries for the specified month
      const scheduleResult = db.prepare(`
        DELETE FROM schedule 
        WHERE date LIKE ?
      `).run(`${monthKey}-%`);
      totalChanges += scheduleResult.changes;
      console.log(`Cleared ${scheduleResult.changes} schedule assignments`);
      
      // 2. Clear workflow status for the month
      const workflowResult = db.prepare(`
        DELETE FROM workflow_status 
        WHERE month = ?
      `).run(monthKey);
      console.log(`Cleared workflow status for ${monthKey}`);
      
      // 3. Clear official schedules for the month
      const officialResult = db.prepare(`
        DELETE FROM official_schedules 
        WHERE month = ?
      `).run(monthKey);
      console.log(`Cleared official schedules for ${monthKey}`);
      
      // 4. Clear schedule history for the month
      const historyResult = db.prepare(`
        DELETE FROM schedule_history 
        WHERE month = ?
      `).run(monthKey);
      console.log(`Cleared schedule history for ${monthKey}`);
      
      // 5. Clear email logs for the month
      const emailResult = db.prepare(`
        DELETE FROM email_logs 
        WHERE month = ?
      `).run(monthKey);
      console.log(`Cleared email logs for ${monthKey}`);
      
      return totalChanges;
    });
    
    const totalChanges = transaction();
    
    console.log(`Total cleared: ${totalChanges} assignments + all workflow data for ${monthKey}`);
    
    res.json({ 
      success: true, 
      message: `Cleared ${totalChanges} assignments and all workflow data`,
      changes: totalChanges,
      workflowCleared: true
    });
  } catch (error) {
    console.error('Error clearing month assignments and workflow:', error);
    res.status(500).json({ error: 'Failed to clear month assignments and workflow' });
  }
});

// Get monthly schedule with enhanced information
app.get('/api/schedule/enhanced/:year/:month', (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = `${year}-${month.padStart(2, '0')}-31`;
    
    const schedule = db.prepare(`
      SELECT 
        s.*,
        u1.name as guide1_name,
        u1.role as guide1_role,
        u2.name as guide2_name,
        u2.role as guide2_role,
        COALESCE(s.is_manual, 0) as is_manual,
        COALESCE(s.is_locked, 0) as is_locked,
        CASE 
          WHEN COALESCE(s.is_manual, 0) = 1 THEN 'manual'
          ELSE 'auto'
        END as assignment_type
      FROM schedule s
      LEFT JOIN users u1 ON s.guide1_id = u1.id
      LEFT JOIN users u2 ON s.guide2_id = u2.id
      WHERE s.date >= ? AND s.date <= ?
      ORDER BY s.date ASC
    `).all(startDate, endDate);
    
    res.json(schedule);
  } catch (error) {
    console.error('Error fetching enhanced schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Create manual assignment
app.post('/api/schedule/manual', (req, res) => {
  try {
    const { date, guide1_id, guide2_id, type, created_by, guide1_name, guide2_name } = req.body;
    
    // Support free-text reserve guide for emergencies (מילואים)
    // If a guide name is provided without an ID, we persist the name and leave ID null
    // Validate assignment based on day type and weekend status
    const dayOfWeek = new Date(date).getDay();
    const isSaturday = dayOfWeek === 6;
    const isFriday = dayOfWeek === 5;
    
    if (isSaturday) {
      // Check weekend type for Friday
      const fridayDate = new Date(date);
      fridayDate.setDate(fridayDate.getDate() - 1);
      const fridayString = fridayDate.toISOString().split('T')[0];
      
      const weekendType = db.prepare('SELECT is_closed FROM weekend_types WHERE date = ?').get(fridayString);
      const isClosedSaturday = weekendType && weekendType.is_closed === 1;
      
      if (isClosedSaturday) {
        // Closed Saturday - can have 1 additional guide (מוצ״ש) in addition to the conan from Friday
        if (!guide1_id) {
          return res.status(400).json({ error: 'חובה לשבץ לפחות מדריך אחד (מוצ״ש)' });
        }
        if (guide1_id && guide2_id && type !== 'מוצ״ש') {
          return res.status(400).json({ error: 'שבת סגורה עם 2 מדריכים דורשת סוג מוצ״ש' });
        }
        // For closed Saturday, we need to preserve the conan from Friday
        // The additional guide (מוצ״ש) should be added, not replace the conan
      } else {
        // Open Saturday - can have 1 or 2 guides (auto will complete)
        if (!guide1_id) {
          return res.status(400).json({ error: 'חובה לשבץ לפחות מדריך אחד' });
        }
        if (guide1_id && guide2_id && type !== 'חפיפה') {
          return res.status(400).json({ error: 'שבת פתוחה עם 2 מדריכים דורשת סוג חפיפה' });
        }
      }
    } else if (isFriday) {
      // Check if this Friday is for a closed Saturday
      const weekendType = db.prepare('SELECT is_closed FROM weekend_types WHERE date = ?').get(date);
      const isClosedSaturday = weekendType && weekendType.is_closed === 1;
      
      if (isClosedSaturday) {
        // Closed Saturday Friday - requires exactly 1 guide (כונן)
        if (!guide1_id || guide2_id) {
          return res.status(400).json({ error: 'שישי לשבת סגורה דורש כונן אחד בלבד' });
        }
        if (type !== 'כונן') {
          return res.status(400).json({ error: 'שישי לשבת סגורה דורש סוג כונן' });
        }
      } else {
        // Regular Friday - can have 1 or 2 guides (auto will complete)
        if (!guide1_id) {
          return res.status(400).json({ error: 'חובה לשבץ לפחות מדריך אחד' });
        }
        if (guide1_id && guide2_id && type !== 'חפיפה') {
          return res.status(400).json({ error: 'שישי רגיל עם 2 מדריכים דורש סוג חפיפה' });
        }
      }
    } else {
      // Regular weekday (Sunday-Thursday) - can have 1 or 2 guides (auto will complete)
      if (!guide1_id) {
        return res.status(400).json({ error: 'חובה לשבץ לפחות מדריך אחד' });
      }
      if (guide1_id && guide2_id && type !== 'חפיפה') {
        return res.status(400).json({ error: 'יום חול עם 2 מדריכים דורש סוג חפיפה' });
      }
    }
    
    // Check if assignment already exists
    const existing = db.prepare('SELECT id FROM schedule WHERE date = ?').get(date);
    
    if (existing) {
      // For closed Saturday, we need to preserve the conan from Friday
      if (isSaturday) {
        // Check if this is a closed Saturday
        const fridayDate = new Date(date);
        fridayDate.setDate(fridayDate.getDate() - 1);
        const fridayString = fridayDate.toISOString().split('T')[0];
        const weekendType = db.prepare('SELECT is_closed FROM weekend_types WHERE date = ?').get(fridayString);
        const isClosedSaturday = weekendType && weekendType.is_closed === 1;
        
        if (isClosedSaturday) {
          // Get the conan guide from Friday
          const fridayAssignment = db.prepare('SELECT guide1_id, type FROM schedule WHERE date = ?').get(fridayString);
          
          if (fridayAssignment && fridayAssignment.type === 'כונן') {
            // Check if there's already a conan assignment on Saturday
            const saturdayAssignment = db.prepare('SELECT guide1_id, guide2_id, type FROM schedule WHERE date = ?').get(date);
            
            if (saturdayAssignment && saturdayAssignment.type === 'כונן') {
              // There's already a conan on Saturday, add the מוצ״ש guide as guide2
              console.log('Conan already exists on Saturday, adding מוצ״ש guide as guide2');
              db.prepare(`
                UPDATE schedule 
                SET guide2_id = ?, guide2_name = ?, type = ?, is_manual = 1, is_locked = 1, 
                    created_by = ?, updated_at = CURRENT_TIMESTAMP
                WHERE date = ?
              `).run(guide1_id || null, guide2_name || null, 'מוצ״ש', created_by, date);
            } else {
              // Preserve the conan from Friday and add the מוצ״ש guide
              console.log('Preserving conan from Friday:', fridayAssignment.guide1_id);
              console.log('Adding מוצ״ש guide:', guide1_id);
              
              db.prepare(`
                UPDATE schedule 
                SET guide1_id = ?, guide1_name = (SELECT name FROM users WHERE id = ?),
                    guide2_id = ?, guide2_name = ?, type = ?, is_manual = 1, is_locked = 1, 
                    created_by = ?, updated_at = CURRENT_TIMESTAMP
                WHERE date = ?
              `).run(fridayAssignment.guide1_id, fridayAssignment.guide1_id, guide1_id || null, guide2_name || null, 'מוצ״ש', created_by, date);
            }
          } else {
            // Regular update
            db.prepare(`
            UPDATE schedule 
            SET guide1_id = ?, guide1_name = (SELECT name FROM users WHERE id = ?),
                guide2_id = ?, guide2_name = (SELECT name FROM users WHERE id = ?),
                type = ?, is_manual = 1, is_locked = 1, 
                created_by = ?, updated_at = CURRENT_TIMESTAMP
              WHERE date = ?
          `).run(guide1_id || null, guide1_id || null, guide2_id || null, guide2_id || null, type, created_by, date);
          }
        } else {
          // Regular update
          db.prepare(`
            UPDATE schedule 
            SET guide1_id = ?, guide2_id = ?, type = ?, is_manual = 1, is_locked = 1, 
                created_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE date = ?
          `).run(guide1_id, guide2_id, type, created_by, date);
        }
      } else {
        // Regular update
        db.prepare(`
          UPDATE schedule 
          SET guide1_id = ?, guide1_name = (SELECT name FROM users WHERE id = ?),
              guide2_id = ?, guide2_name = (SELECT name FROM users WHERE id = ?),
              type = ?, is_manual = 1, is_locked = 1, 
              created_by = ?, updated_at = CURRENT_TIMESTAMP
          WHERE date = ?
        `).run(guide1_id || null, guide1_id || null, guide2_id || null, guide2_id || null, type, created_by, date);
      }
    } else {
      // Create new assignment
      db.prepare(`
        INSERT INTO schedule (date, weekday, type, guide1_id, guide2_id, guide1_name, guide2_name, is_manual, is_locked, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, CURRENT_TIMESTAMP)
      `).run(date, getWeekday(date), type, guide1_id || null, guide2_id || null, guide1_name || null, guide2_name || null, created_by);
    }
    
    // Log the change
    db.prepare(`
      INSERT INTO audit_log (table_name, record_id, action, new_values, user_id)
      VALUES ('schedule', ?, 'create_manual', ?, ?)
    `).run(existing ? existing.id : db.prepare('SELECT last_insert_rowid()').get()['last_insert_rowid()'], 
           JSON.stringify(req.body), created_by);
    
    res.json({ success: true, message: 'Manual assignment created' });
  } catch (error) {
    console.error('Error creating manual assignment:', error);
    res.status(500).json({ error: 'Failed to create manual assignment' });
  }
});

// Unlock manual assignment
app.put('/api/schedule/unlock/:date', (req, res) => {
  try {
    const { date } = req.params;
    const { user_id } = req.body;
    
    db.prepare(`
      UPDATE schedule 
      SET is_locked = 0, updated_at = CURRENT_TIMESTAMP
      WHERE date = ? AND is_manual = 1
    `).run(date);
    
    // Log the change
    db.prepare(`
      INSERT INTO audit_log (table_name, record_id, action, new_values, user_id)
      VALUES ('schedule', ?, 'unlock_manual', ?, ?)
    `).run(db.prepare('SELECT id FROM schedule WHERE date = ?').get(date)?.id, 
           JSON.stringify({ date, unlocked: true }), user_id);
    
    res.json({ success: true, message: 'Assignment unlocked' });
  } catch (error) {
    console.error('Error unlocking assignment:', error);
    res.status(500).json({ error: 'Failed to unlock assignment' });
  }
});

// =====================================================
// 3. DRAFT MANAGEMENT ENDPOINTS
// =====================================================

// Save draft
app.post('/api/drafts', (req, res) => {
  try {
    const { month, name, data, created_by } = req.body;
    
    // Get next version number for this month
    const lastVersion = db.prepare('SELECT MAX(version) as max_version FROM drafts WHERE month = ?').get(month);
    const version = (lastVersion?.max_version || 0) + 1;
    
    db.prepare(`
      INSERT INTO drafts (month, version, name, data, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(month, version, name, JSON.stringify(data), created_by);
    
    res.json({ 
      success: true, 
      message: 'Draft saved',
      draft_id: db.prepare('SELECT last_insert_rowid()').get()['last_insert_rowid()'],
      version: version
    });
  } catch (error) {
    console.error('Error saving draft:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// Get drafts for a month
app.get('/api/drafts/:month', (req, res) => {
  try {
    const { month } = req.params;
    
    const drafts = db.prepare(`
      SELECT d.*, u.name as created_by_name
      FROM drafts d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.month = ?
      ORDER BY d.version DESC
    `).all(month);
    
    res.json(drafts);
  } catch (error) {
    console.error('Error fetching drafts:', error);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

// Load draft
app.get('/api/drafts/:month/:version', (req, res) => {
  try {
    const { month, version } = req.params;
    
    const draft = db.prepare(`
      SELECT d.*, u.name as created_by_name
      FROM drafts d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.month = ? AND d.version = ?
    `).get(month, version);
    
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    
    draft.data = JSON.parse(draft.data);
    res.json(draft);
  } catch (error) {
    console.error('Error loading draft:', error);
    res.status(500).json({ error: 'Failed to load draft' });
  }
});

// =====================================================
// 4. ASSIGNMENT TYPES AND SHIFT TYPES ENDPOINTS
// =====================================================

// Get assignment types
app.get('/api/assignment-types', (req, res) => {
  try {
    const types = db.prepare('SELECT * FROM assignment_types WHERE is_active = 1 ORDER BY name').all();
    res.json(types);
  } catch (error) {
    console.error('Error fetching assignment types:', error);
    res.status(500).json({ error: 'Failed to fetch assignment types' });
  }
});

// Get shift types
app.get('/api/shift-types', (req, res) => {
  try {
    const types = db.prepare('SELECT * FROM shift_types WHERE is_active = 1 ORDER BY name').all();
    res.json(types);
  } catch (error) {
    console.error('Error fetching shift types:', error);
    res.status(500).json({ error: 'Failed to fetch shift types' });
  }
});

// =====================================================
// 5. AUDIT LOG ENDPOINTS
// =====================================================

// Get audit log
app.get('/api/audit-log', (req, res) => {
  try {
    const { table_name, record_id, limit = 100 } = req.query;
    
    let query = `
      SELECT al.*, u.name as user_name
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (table_name) {
      conditions.push('al.table_name = ?');
      params.push(table_name);
    }
    
    if (record_id) {
      conditions.push('al.record_id = ?');
      params.push(record_id);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY al.timestamp DESC LIMIT ?';
    params.push(limit);
    
    const logs = db.prepare(query).all(...params);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// =====================================================
// PHASE 1 TASK 2 COMPLETED
// =====================================================

// =====================================================
// AUTO-SCHEDULING ENGINE
// =====================================================

// Enhanced auto-scheduling function
// Auto-scheduler function removed - manual scheduling only

// Auto-scheduling helper functions removed - manual scheduling only

// Helper function to get all days in month
function getAllDaysInMonth(year, month) {
  const days = [];
  
  // Get the number of days in the month
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    // Create date using local time to avoid timezone issues
    const date = new Date(year, month - 1, day, 12, 0, 0); // Use noon to avoid timezone shifts
    days.push(date);
  }
  
  return days;
}

// Get scheduling statistics
app.get('/api/schedule/statistics/:year/:month', (req, res) => {
  try {
    const { year, month } = req.params;
    
    // Get guide statistics
    const guideStats = db.prepare(`
      SELECT 
        u.id, u.name,
        COALESCE(COUNT(s.id), 0) as total_shifts,
        COALESCE(SUM(CASE WHEN s.is_manual = 1 THEN 1 ELSE 0 END), 0) as manual_shifts,
        COALESCE(SUM(CASE WHEN s.is_manual = 0 THEN 1 ELSE 0 END), 0) as auto_shifts,
        COALESCE(SUM(CASE WHEN s.type = 'כונן' THEN 1 ELSE 0 END), 0) as conan_shifts,
        COALESCE(SUM(CASE WHEN s.type = 'מוצ״ש' THEN 1 ELSE 0 END), 0) as motzash_shifts,
        COALESCE(SUM(CASE WHEN s.type = 'חפיפה' THEN 1 ELSE 0 END), 0) as overlap_shifts,
        COALESCE(SUM(CASE WHEN s.type = 'רגיל' THEN 1 ELSE 0 END), 0) as regular_shifts
      FROM users u
      LEFT JOIN schedule s ON (u.id = s.guide1_id OR u.id = s.guide2_id) 
        AND s.date LIKE '${year}-${String(month).padStart(2, '0')}-%'
      WHERE u.role = 'מדריך' AND COALESCE(u.is_active, 1) = 1
      GROUP BY u.id, u.name
      ORDER BY total_shifts DESC, manual_shifts DESC
    `).all();
    
    // Get day statistics
    const dayStats = db.prepare(`
      SELECT 
        COUNT(*) as total_days,
        SUM(CASE WHEN guide1_id IS NOT NULL THEN 1 ELSE 0 END) as assigned_days,
        SUM(CASE WHEN guide1_id IS NULL THEN 1 ELSE 0 END) as empty_days,
        SUM(CASE WHEN is_manual = 1 THEN 1 ELSE 0 END) as manual_days,
        SUM(CASE WHEN is_manual = 0 THEN 1 ELSE 0 END) as auto_days,
        SUM(CASE WHEN type = 'כונן' THEN 1 ELSE 0 END) as conan_days,
        SUM(CASE WHEN type = 'מוצ״ש' THEN 1 ELSE 0 END) as motzash_days,
        SUM(CASE WHEN type = 'חפיפה' THEN 1 ELSE 0 END) as overlap_days,
        SUM(CASE WHEN type = 'רגיל' THEN 1 ELSE 0 END) as regular_days
      FROM (
        SELECT 
          date,
          guide1_id,
          is_manual,
          type
        FROM schedule 
        WHERE date LIKE '${year}-${String(month).padStart(2, '0')}-%'
      )
    `).get();
    
    // Get weekend statistics
    const weekendStats = db.prepare(`
      SELECT 
        COUNT(*) as total_weekends,
        SUM(CASE WHEN is_closed = 1 THEN 1 ELSE 0 END) as closed_saturdays,
        SUM(CASE WHEN is_closed = 0 THEN 1 ELSE 0 END) as open_saturdays
      FROM weekend_types 
      WHERE date LIKE '${year}-${String(month).padStart(2, '0')}-%'
    `).get();
    
    res.json({
      success: true,
      guide_statistics: guideStats,
      day_statistics: dayStats,
      weekend_statistics: weekendStats
    });
    
  } catch (error) {
    console.error('Error getting scheduling statistics:', error);
    res.status(500).json({ error: 'Failed to get scheduling statistics' });
  }
});

// Get scheduling conflicts and issues
app.get('/api/schedule/issues/:year/:month', (req, res) => {
  try {
    const { year, month } = req.params;
    
    const issues = [];
    
    // Check for empty days
    const emptyDays = db.prepare(`
      SELECT date, weekday
      FROM (
        SELECT 
          date,
          CASE 
            WHEN strftime('%w', date) = '0' THEN 'ראשון'
            WHEN strftime('%w', date) = '1' THEN 'שני'
            WHEN strftime('%w', date) = '2' THEN 'שלישי'
            WHEN strftime('%w', date) = '3' THEN 'רביעי'
            WHEN strftime('%w', date) = '4' THEN 'חמישי'
            WHEN strftime('%w', date) = '5' THEN 'שישי'
            WHEN strftime('%w', date) = '6' THEN 'שבת'
          END as weekday
        FROM (
          SELECT date FROM (
            SELECT date('${year}-${String(month).padStart(2, '0')}-01') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+1 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+2 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+3 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+4 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+5 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+6 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+7 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+8 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+9 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+10 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+11 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+12 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+13 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+14 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+15 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+16 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+17 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+18 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+19 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+20 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+21 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+22 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+23 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+24 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+25 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+26 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+27 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+28 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+29 day') as date
            UNION ALL
            SELECT date('${year}-${String(month).padStart(2, '0')}-01', '+30 day') as date
          ) all_days
          WHERE strftime('%m', date) = '${String(month).padStart(2, '0')}'
        )
      ) month_days
      WHERE date NOT IN (
        SELECT date FROM schedule 
        WHERE date LIKE '${year}-${String(month).padStart(2, '0')}-%'
      )
    `).all();
    
    if (emptyDays.length > 0) {
      issues.push({
        type: 'empty_days',
        severity: 'high',
        message: `${emptyDays.length} ימים ללא שיבוץ`,
        details: emptyDays
      });
    }
    
    // Check for workload imbalance
    const workloadStats = db.prepare(`
      SELECT 
        MIN(total_shifts) as min_shifts,
        MAX(total_shifts) as max_shifts,
        AVG(total_shifts) as avg_shifts
      FROM (
        SELECT 
          u.id,
          COALESCE(COUNT(s.id), 0) as total_shifts
        FROM users u
        LEFT JOIN schedule s ON (u.id = s.guide1_id OR u.id = s.guide2_id) 
          AND s.date LIKE '${year}-${String(month).padStart(2, '0')}-%'
        WHERE u.role = 'מדריך' AND COALESCE(u.is_active, 1) = 1
        GROUP BY u.id
      )
    `).get();
    
    if (workloadStats.max_shifts - workloadStats.min_shifts > 3) {
      issues.push({
        type: 'workload_imbalance',
        severity: 'medium',
        message: 'חוסר איזון בעומס העבודה',
        details: {
          min_shifts: workloadStats.min_shifts,
          max_shifts: workloadStats.max_shifts,
          avg_shifts: Math.round(workloadStats.avg_shifts * 100) / 100
        }
      });
    }
    
    res.json({
      success: true,
      issues: issues,
      total_issues: issues.length
    });
    
  } catch (error) {
    console.error('Error getting scheduling issues:', error);
    res.status(500).json({ error: 'Failed to get scheduling issues' });
  }
});

// Coordinator Rules Management
app.get('/api/coordinator-rules', (req, res) => {
  try {
    const rules = db.prepare(`
      SELECT 
        cr.id, cr.rule_type, cr.description, cr.is_active,
        u1.name as guide1_name,
        u2.name as guide2_name,
        cr.created_at, cr.updated_at
      FROM coordinator_rules cr
      LEFT JOIN users u1 ON cr.guide1_id = u1.id
      LEFT JOIN users u2 ON cr.guide2_id = u2.id
      WHERE cr.is_active = 1
      ORDER BY cr.rule_type, cr.created_at DESC
    `).all();
    
    res.json({ success: true, rules });
  } catch (error) {
    console.error('Error fetching coordinator rules:', error);
    res.status(500).json({ error: 'Failed to fetch coordinator rules' });
  }
});

app.post('/api/coordinator-rules', (req, res) => {
  try {
    const { rule_type, guide1_id, guide2_id, description, created_by = 1 } = req.body;
    
    if (!rule_type || !guide1_id) {
      return res.status(400).json({ error: 'Rule type and guide1_id are required' });
    }
    
    const result = db.prepare(`
      INSERT INTO coordinator_rules (rule_type, guide1_id, guide2_id, description, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(rule_type, guide1_id, guide2_id || null, description, created_by);
    
    res.json({ 
      success: true, 
      message: 'Coordinator rule created successfully',
      rule_id: result.lastInsertRowid
    });
  } catch (error) {
    console.error('Error creating coordinator rule:', error);
    res.status(500).json({ error: 'Failed to create coordinator rule' });
  }
});

app.put('/api/coordinator-rules/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { rule_type, guide1_id, guide2_id, description, is_active } = req.body;
    
    db.prepare(`
      UPDATE coordinator_rules 
      SET rule_type = ?, guide1_id = ?, guide2_id = ?, description = ?, 
          is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(rule_type, guide1_id, guide2_id || null, description, is_active, id);
    
    res.json({ success: true, message: 'Coordinator rule updated successfully' });
  } catch (error) {
    console.error('Error updating coordinator rule:', error);
    res.status(500).json({ error: 'Failed to update coordinator rule' });
  }
});

app.delete('/api/coordinator-rules/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    db.prepare(`
      UPDATE coordinator_rules 
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    
    res.json({ success: true, message: 'Coordinator rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting coordinator rule:', error);
    res.status(500).json({ error: 'Failed to delete coordinator rule' });
  }
});

// Auto-scheduling endpoint
app.post('/api/schedule/auto-assign', (req, res) => {
  try {
    const { year, month, schedule } = req.body;
    
    if (!year || !month || !schedule) {
      return res.status(400).json({ error: 'Year, month, and schedule are required' });
    }
    
    console.log(`Auto-assigning schedule for ${year}-${month} with ${schedule.length} assignments`);
    
    // Start transaction
    const transaction = db.transaction(() => {
      let assignedCount = 0;
      
      for (const assignment of schedule) {
        const { date, guide1_id, guide1_name, guide1_role, guide2_id, guide2_name, guide2_role, is_manual, is_locked } = assignment;
        
        // Check if assignment already exists
        const existing = db.prepare('SELECT id FROM schedule WHERE date = ?').get(date);
        
        if (existing) {
          // Update existing assignment (but preserve manual assignments)
          const current = db.prepare('SELECT is_manual FROM schedule WHERE date = ?').get(date);
          
          if (current && current.is_manual) {
            console.log(`Skipping manual assignment for ${date}`);
            continue; // Don't overwrite manual assignments
          }
          
          db.prepare(`
            UPDATE schedule 
            SET guide1_id = ?, guide1_name = ?, guide1_role = ?, 
                guide2_id = ?, guide2_name = ?, guide2_role = ?,
                is_manual = ?, is_locked = ?, updated_at = CURRENT_TIMESTAMP
            WHERE date = ?
          `).run(guide1_id, guide1_name, guide1_role, guide2_id, guide2_name, guide2_role, is_manual, is_locked, date);
        } else {
          // Insert new assignment
          db.prepare(`
            INSERT INTO schedule (date, guide1_id, guide1_name, guide1_role, guide2_id, guide2_name, guide2_role, is_manual, is_locked)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(date, guide1_id, guide1_name, guide1_role, guide2_id, guide2_name, guide2_role, is_manual, is_locked);
        }
        
        assignedCount++;
      }
      
      return assignedCount;
    });
    
    const assignedCount = transaction();
    
    res.json({
      success: true,
      message: `Auto-scheduling completed successfully`,
      assigned: assignedCount,
      total: schedule.length
    });
    
  } catch (error) {
    console.error('Error in auto-scheduling:', error);
    res.status(500).json({ error: 'Failed to auto-assign schedule' });
  }
});

// Weekend types endpoint
app.get('/api/weekend-types/:year/:month', (req, res) => {
  try {
    const { year, month } = req.params;
    
    // Get weekend types from shabbat_status table
    const weekendTypes = db.prepare(`
      SELECT date, status as weekend_type
      FROM shabbat_status 
      WHERE strftime('%Y-%m', date) = ?
      ORDER BY date
    `).all(`${year}-${month.padStart(2, '0')}`);
    
    // Convert to object format
    const weekendTypesObj = {};
    weekendTypes.forEach(wt => {
      weekendTypesObj[wt.date] = wt.weekend_type === 'סגורה' ? 'שבת סגורה' : 'שבת פתוחה';
    });
    
    res.json({
      success: true,
      weekendTypes: weekendTypesObj
    });
    
  } catch (error) {
    console.error('Error fetching weekend types:', error);
    res.status(500).json({ error: 'Failed to fetch weekend types' });
  }
});

// Export hours calculation for reports
app.get('/api/reports/hours/:year/:month', (req, res) => {
    try {
        const { year, month } = req.params;
        
        // Get guides
        const guides = db.prepare(`
            SELECT * FROM users 
            WHERE role = 'מדריך' AND COALESCE(is_active, 1) = 1
            ORDER BY name
        `).all();
        
        // Get schedule
        const schedule = db.prepare(`
            SELECT s.*, u1.name as guide1_name, u2.name as guide2_name
            FROM schedule s
            LEFT JOIN users u1 ON s.guide1_id = u1.id
            LEFT JOIN users u2 ON s.guide2_id = u2.id
            WHERE s.date LIKE ?
            ORDER BY s.date
        `).all(`${year}-${String(month).padStart(2, '0')}-%`);
        
        // Get weekend types
        const weekendTypes = {};
        try {
            const rows = db.prepare(`
                SELECT date, is_closed FROM weekend_types 
                WHERE strftime('%Y-%m', date) = ?
            `).all(`${year}-${String(month).padStart(2, '0')}`);
            rows.forEach(row => {
                weekendTypes[row.date] = row.is_closed === 1;
            });
        } catch (e) {
            // Try shabbat_status table
            try {
                const rows = db.prepare(`
                    SELECT date, status FROM shabbat_status 
                    WHERE strftime('%Y-%m', date) = ?
                `).all(`${year}-${String(month).padStart(2, '0')}`);
                rows.forEach(row => {
                    weekendTypes[row.date] = row.status === 'סגורה';
                });
            } catch (e2) {
                console.log('No weekend type data found');
            }
        }
        
        // Calculate hours for each guide
        const hoursReport = guides.map(guide => {
            const stats = calculateDetailedGuideStats(guide, schedule, weekendTypes);
            return {
                guideId: guide.id,
                name: guide.name,
                percent: guide.percent || 100,
                ...stats
            };
        });
        
        res.json({
            success: true,
            hours_report: hoursReport,
            month: `${year}-${month}`,
            generated_at: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error generating hours report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate hours report'
        });
    }
});

console.log('✅ Enhanced hour calculation logic loaded successfully');
console.log('✅ Enhanced Statistics API with complete real data calculations loaded successfully');