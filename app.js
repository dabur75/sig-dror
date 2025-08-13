const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 4000;
const Database = require('better-sqlite3');
const db = new Database('sigalit.db');

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
    guide2_id INTEGER
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

// --- Database is now primary data source (no guides.json) ---
console.log('Using database for all data - no JSON files needed');

const users = db.prepare('SELECT * FROM users').all();
const usersWithPasswords = db.prepare('SELECT id, name, password FROM users').all();
console.log('Users with passwords:', usersWithPasswords);

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

// --------- API להרצת שיבוץ אוטומטי ושמירה לקובץ schedule.json ----------

app.post('/api/schedule/auto', (req, res) => {
    // מצפה ל-body: { year, month, weekendsType (אובייקט תאריכים וסוג שבת) }
    const { year, month, weekendsType } = req.body;
    if (!year || !month || !weekendsType) {
        return res.status(400).json({ error: "חסר year, month או weekendsType" });
    }
    const newSchedule = runScheduler({ year, month, weekendsType });

    fs.writeFileSync('schedule.json', JSON.stringify(newSchedule, null, 2), 'utf-8');

    res.json({ ok: true, schedule: newSchedule });
});

app.listen(PORT, () => {
    console.log("Node.js API עובד על http://localhost:" + PORT);
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
const WEEKLY_ACTIVITIES_FILE = './weekly_activities.json';

function loadWeeklyActivities() {
    if (!fs.existsSync(WEEKLY_ACTIVITIES_FILE)) return [];
    return JSON.parse(fs.readFileSync(WEEKLY_ACTIVITIES_FILE));
}
function saveWeeklyActivities(list) {
    fs.writeFileSync(WEEKLY_ACTIVITIES_FILE, JSON.stringify(list, null, 2));
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

