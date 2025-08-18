const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./database'); // PostgreSQL database module
const app = express();
const PORT = process.env.PORT || 4000;

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve dashboard as root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Database health check endpoint
app.get('/health', async (req, res) => {
  const health = await db.healthCheck();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// Test database connection on startup
(async () => {
  try {
    const health = await db.healthCheck();
    console.log('✅ Database health check:', health);
    if (health.status === 'healthy') {
      console.log('✅ PostgreSQL database connection established - with new endpoints');
    } else {
      console.error('❌ Database connection failed:', health);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
})();

// --- GUIDES ---
app.get('/api/guides', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM users ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching guides:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/guides', async (req, res) => {
  try {
    const { name, role, password, email, phone, percent } = req.body;
    if (!name || !role) return res.status(400).json({ error: 'Missing name or role' });
    
    const result = await db.query(
      `INSERT INTO users (name, role, password, email, phone, percent) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, role, password || '', email || '', phone || '', percent || 100]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating guide:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/guides/:id', async (req, res) => {
  try {
    const { name, role, password, email, phone, percent } = req.body;
    const id = req.params.id;
    
    const result = await db.query(
      `UPDATE users SET name = $1, role = $2, password = $3, email = $4, phone = $5, percent = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`,
      [name, role, password, email, phone, percent || 100, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating guide:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/guides/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting guide:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- CONSTRAINTS ---
app.get('/api/constraints', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.*, u.name as guideName
      FROM constraints c
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.date
    `);
    
    const constraints = result.rows.map(row => ({
      ...row,
      guideId: row.user_id, // provide guideId for frontend compatibility
      note: row.details // map details to note for frontend compatibility
    }));
    res.json(constraints);
  } catch (error) {
    console.error('Error fetching constraints:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/constraints', async (req, res) => {
  try {
    const { guideId, date, hourStart, hourEnd, note, type } = req.body;
    const result = await db.query(
      'INSERT INTO constraints (user_id, type, date, details) VALUES ($1, $2, $3, $4) RETURNING *',
      [guideId, type || 'constraint', date, note || '']
    );
    
    const constraint = result.rows[0];
    res.status(201).json({ 
      ...constraint, 
      guideId: constraint.user_id, 
      note: constraint.details 
    });
  } catch (error) {
    console.error('Error creating constraint:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/constraints/:id', async (req, res) => {
  try {
    const { guideId, date, hourStart, hourEnd, note, type } = req.body;
    const id = req.params.id;
    
    const result = await db.query(
      'UPDATE constraints SET user_id = $1, type = $2, date = $3, details = $4 WHERE id = $5 RETURNING *',
      [guideId, type || 'constraint', date, note || '', id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא' });
    }
    
    const constraint = result.rows[0];
    res.json({ 
      ...constraint, 
      guideId: constraint.user_id, 
      note: constraint.details 
    });
  } catch (error) {
    console.error('Error updating constraint:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/constraints/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await db.query('DELETE FROM constraints WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'לא נמצא' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting constraint:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- SCHEDULE ---
app.get('/api/schedule/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    
    const result = await db.query(`
      SELECT s.*, 
             u1.name as guide1_name_db, 
             u2.name as guide2_name_db
      FROM schedule s
      LEFT JOIN users u1 ON s.guide1_id = u1.id
      LEFT JOIN users u2 ON s.guide2_id = u2.id
      WHERE s.date LIKE $1
      ORDER BY s.date ASC
    `, [`${monthStr}-%`]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/schedule', async (req, res) => {
  try {
    const { date, weekday, type, guide1_id, guide2_id, guide1_name, guide2_name, guide1_role, guide2_role, is_manual } = req.body;
    
    // Check if assignment already exists
    const existingResult = await db.query('SELECT id FROM schedule WHERE date = $1', [date]);
    
    if (existingResult.rows.length > 0) {
      // Update existing
      const result = await db.query(`
        UPDATE schedule 
        SET weekday = $1, type = $2, guide1_id = $3, guide2_id = $4, 
            guide1_name = $5, guide2_name = $6, guide1_role = $7, guide2_role = $8,
            is_manual = $9, updated_at = CURRENT_TIMESTAMP
        WHERE date = $10 
        RETURNING *
      `, [weekday, type, guide1_id, guide2_id, guide1_name, guide2_name, guide1_role, guide2_role, is_manual || 0, date]);
      
      res.json(result.rows[0]);
    } else {
      // Create new
      const result = await db.query(`
        INSERT INTO schedule (date, weekday, type, guide1_id, guide2_id, guide1_name, guide2_name, guide1_role, guide2_role, is_manual)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [date, weekday, type, guide1_id, guide2_id, guide1_name, guide2_name, guide1_role, guide2_role, is_manual || 0]);
      
      res.status(201).json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error creating/updating schedule:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- WEEKEND TYPES (Critical for Friday/Saturday scheduling logic) ---
app.get('/api/weekend-types/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    
    const result = await db.query(`
      SELECT date, is_closed 
      FROM weekend_types 
      WHERE date LIKE $1 
      ORDER BY date
    `, [`${monthStr}-%`]);
    
    // Convert to expected format for frontend
    const weekendTypes = {};
    result.rows.forEach(row => {
      weekendTypes[row.date] = row.is_closed ? 'סגורה' : 'פתוחה';
    });
    
    res.json(weekendTypes);
  } catch (error) {
    console.error('Error fetching weekend types:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/weekend-types', async (req, res) => {
  try {
    const { date, status } = req.body;
    const isClosed = status === 'סגורה' ? 1 : 0;
    
    const result = await db.query(`
      INSERT INTO weekend_types (date, is_closed, updated_at) 
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (date) 
      DO UPDATE SET is_closed = $2, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [date, isClosed]);
    
    res.json({ date: result.rows[0].date, status: result.rows[0].is_closed ? 'סגורה' : 'פתוחה' });
  } catch (error) {
    console.error('Error setting weekend type:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- VACATIONS ---
app.get('/api/vacations', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT v.*, u.name as guideName
      FROM vacations v
      LEFT JOIN users u ON v.user_id = u.id
      ORDER BY v.date_start
    `);
    
    const vacations = result.rows.map(row => ({
      ...row,
      guideId: row.user_id,
      dateStart: row.date_start,
      dateEnd: row.date_end
    }));
    res.json(vacations);
  } catch (error) {
    console.error('Error fetching vacations:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/vacations', async (req, res) => {
  try {
    const { guideId, dateStart, dateEnd, note, status } = req.body;
    const result = await db.query(
      'INSERT INTO vacations (user_id, date_start, date_end, note, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [guideId, dateStart, dateEnd, note || '', status || 'pending']
    );
    
    const vacation = result.rows[0];
    res.status(201).json({
      ...vacation,
      guideId: vacation.user_id,
      dateStart: vacation.date_start,
      dateEnd: vacation.date_end
    });
  } catch (error) {
    console.error('Error creating vacation:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- TASKS ---
app.get('/api/tasks', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.*, 
             u1.name as creator_name,
             u2.name as assigned_to_name,
             u3.name as closed_by_name
      FROM tasks t
      LEFT JOIN users u1 ON t.creator_id = u1.id
      LEFT JOIN users u2 ON t.assigned_to_id = u2.id  
      LEFT JOIN users u3 ON t.closed_by_id = u3.id
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { text, creator_id, assigned_to_id, shift_date, notes } = req.body;
    const result = await db.query(
      `INSERT INTO tasks (text, created_at, creator_id, assigned_to_id, shift_date, notes, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'open') RETURNING *`,
      [text, new Date().toISOString(), creator_id, assigned_to_id, shift_date, notes || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- ASSIGNMENT TYPES ---
app.get('/api/assignment-types', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM assignment_types WHERE is_active = 1 ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching assignment types:', error);
    res.status(500).json({ error: 'Failed to fetch assignment types' });
  }
});

// --- SHIFT TYPES ---
app.get('/api/shift-types', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM shift_types WHERE is_active = 1 ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching shift types:', error);
    res.status(500).json({ error: 'Failed to fetch shift types' });
  }
});

// --- GUIDES AVAILABILITY ---
app.get('/api/guides/availability/:date', async (req, res) => {
  try {
    const { date } = req.params;
    
    // Get all guides
    const guidesResult = await db.query('SELECT * FROM users WHERE role = $1', ['מדריך']);
    const guides = guidesResult.rows;
    
    const availability = [];
    
    for (const guide of guides) {
      // Check constraints for this date
      const constraintsResult = await db.query(
        'SELECT * FROM constraints WHERE user_id = $1 AND date = $2',
        [guide.id, date]
      );
      
      // Check fixed constraints for this day of week
      const dayOfWeek = new Date(date).getDay();
      const fixedConstraintsResult = await db.query(
        'SELECT * FROM fixed_constraints WHERE user_id = $1 AND weekday = $2',
        [guide.id, dayOfWeek]
      );
      
      // Check vacations
      const vacationsResult = await db.query(
        'SELECT * FROM vacations WHERE user_id = $1 AND date_start <= $2 AND date_end >= $2 AND status = $3',
        [guide.id, date, 'approved']
      );
      
      const hasConstraints = constraintsResult.rows.length > 0;
      const hasFixedConstraints = fixedConstraintsResult.rows.length > 0;
      const hasVacation = vacationsResult.rows.length > 0;
      
      const isAvailable = !hasConstraints && !hasFixedConstraints && !hasVacation;
      
      availability.push({
        guideId: guide.id,
        guideName: guide.name,
        available: isAvailable,
        constraints: constraintsResult.rows.length,
        fixedConstraints: fixedConstraintsResult.rows.length,
        vacations: vacationsResult.rows.length,
        reason: !isAvailable ? (hasVacation ? 'vacation' : 'constraint') : null
      });
    }
    
    res.json({ success: true, date, availability });
  } catch (error) {
    console.error('Error fetching guide availability:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch guide availability' });
  }
});

// --- ENHANCED GUIDES ---
app.get('/api/guides/enhanced', async (req, res) => {
  try {
    const result = await db.query(`
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
      GROUP BY u.id, u.name, u.role, u.email, u.phone, u.percent, u.is_active, u.created_at, u.updated_at
      ORDER BY u.name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching enhanced guides:', error);
    res.status(500).json({ error: 'Failed to fetch enhanced guides' });
  }
});

// --- AUTO SCHEDULE ENHANCED ---
app.post('/api/schedule/auto-schedule-enhanced/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const { preserve_manual = true, balance_workload = true } = req.body || {};
    
    console.log(`Auto-scheduling requested for ${year}-${month}`);
    
    // Get all guides
    const guidesResult = await db.query('SELECT * FROM users WHERE role = $1 ORDER BY name', ['מדריך']);
    const guides = guidesResult.rows;
    
    if (guides.length === 0) {
      return res.status(400).json({ success: false, error: 'No guides available for scheduling' });
    }
    
    // Get existing schedule for this month
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const existingResult = await db.query(`
      SELECT * FROM schedule 
      WHERE date LIKE $1 
      ORDER BY date
    `, [`${monthStr}-%`]);
    
    const existing = existingResult.rows;
    let scheduled = 0;
    let conflicts = 0;
    
    // Get all days in month
    const daysInMonth = new Date(year, month, 0).getDate();
    const assignments = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const weekdayName = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][dayOfWeek];
      
      // Check if this day already has an assignment
      const existingAssignment = existing.find(s => s.date === date);
      
      // Skip if preserving manual assignments and this is manual
      if (preserve_manual && existingAssignment && existingAssignment.is_manual) {
        continue;
      }
      
      // Simple round-robin assignment for demo
      const guide1 = guides[scheduled % guides.length];
      const guide2 = guides.length > 1 ? guides[(scheduled + 1) % guides.length] : null;
      
      const assignment = {
        date,
        weekday: weekdayName,
        type: dayOfWeek === 5 || dayOfWeek === 6 ? 'כונן' : 'רגיל', // Friday/Saturday special
        guide1_id: guide1.id,
        guide2_id: guide2?.id || null,
        guide1_name: guide1.name,
        guide2_name: guide2?.name || null,
        guide1_role: guide1.role,
        guide2_role: guide2?.role || null,
        is_manual: 0
      };
      
      assignments.push(assignment);
      scheduled++;
    }
    
    // Save assignments to database
    for (const assignment of assignments) {
      try {
        // Check if assignment already exists
        const existingCheck = await db.query('SELECT id FROM schedule WHERE date = $1', [assignment.date]);
        
        if (existingCheck.rows.length > 0) {
          // Update existing
          await db.query(`
            UPDATE schedule SET
              weekday = $1, type = $2, guide1_id = $3, guide2_id = $4,
              guide1_name = $5, guide2_name = $6, guide1_role = $7, guide2_role = $8,
              is_manual = $9, updated_at = CURRENT_TIMESTAMP
            WHERE date = $10
          `, [
            assignment.weekday, assignment.type,
            assignment.guide1_id, assignment.guide2_id,
            assignment.guide1_name, assignment.guide2_name,
            assignment.guide1_role, assignment.guide2_role,
            assignment.is_manual, assignment.date
          ]);
        } else {
          // Insert new
          await db.query(`
            INSERT INTO schedule (date, weekday, type, guide1_id, guide2_id, guide1_name, guide2_name, guide1_role, guide2_role, is_manual)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            assignment.date, assignment.weekday, assignment.type,
            assignment.guide1_id, assignment.guide2_id,
            assignment.guide1_name, assignment.guide2_name,
            assignment.guide1_role, assignment.guide2_role,
            assignment.is_manual
          ]);
        }
      } catch (error) {
        console.error(`Error saving assignment for ${assignment.date}:`, error);
        conflicts++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Auto-scheduling completed for ${year}-${month}`,
      assigned: scheduled - conflicts,
      scheduled: scheduled - conflicts,
      conflicts,
      stats: {
        assigned: scheduled - conflicts,
        conflicts: conflicts,
        total: assignments.length
      },
      assignments: assignments.slice(0, 5) // Return first 5 as preview
    });
  } catch (error) {
    console.error('Error in auto-scheduling:', error);
    res.status(500).json({ success: false, error: 'Auto-scheduling failed' });
  }
});

// --- ENHANCED SCHEDULE STATISTICS ---
app.get('/api/schedule/enhanced-statistics/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = `${year}-${month.padStart(2, '0')}-31`;
    
    // Get all schedules for the month
    const schedulesResult = await db.query(`
      SELECT s.*, u1.name as guide1_name, u2.name as guide2_name
      FROM schedule s
      LEFT JOIN users u1 ON s.guide1_id = u1.id
      LEFT JOIN users u2 ON s.guide2_id = u2.id
      WHERE s.date >= $1 AND s.date <= $2
      ORDER BY s.date ASC
    `, [startDate, endDate]);
    
    const schedules = schedulesResult.rows;
    
    // Get all guides
    const guidesResult = await db.query('SELECT * FROM users WHERE role = $1', ['מדריך']);
    const guides = guidesResult.rows;
    
    // Calculate statistics
    const totalDays = new Date(year, month, 0).getDate();
    const assignedDays = schedules.filter(s => s.guide1_id || s.guide2_id).length;
    const manualAssignments = schedules.filter(s => s.is_manual === 1).length;
    const autoAssignments = schedules.filter(s => s.is_manual === 0).length;
    
    // Guide statistics
    const guideStats = guides.map(guide => {
      const guideShifts = schedules.filter(s => s.guide1_id === guide.id || s.guide2_id === guide.id);
      const weekdayShifts = guideShifts.filter(s => {
        const dayOfWeek = new Date(s.date).getDay();
        return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday
      });
      const weekendShifts = guideShifts.filter(s => {
        const dayOfWeek = new Date(s.date).getDay();
        return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
      });
      
      return {
        guideId: guide.id,
        guideName: guide.name,
        totalShifts: guideShifts.length,
        weekdayShifts: weekdayShifts.length,
        weekendShifts: weekendShifts.length,
        manualShifts: guideShifts.filter(s => s.is_manual === 1).length,
        autoShifts: guideShifts.filter(s => s.is_manual === 0).length
      };
    });
    
    // Assignment type breakdown
    const assignmentTypes = {};
    schedules.forEach(s => {
      if (s.type) {
        assignmentTypes[s.type] = (assignmentTypes[s.type] || 0) + 1;
      }
    });
    
    // Calculate averages
    const totalShifts = guideStats.reduce((sum, g) => sum + g.totalShifts, 0);
    const avgShiftsPerGuide = guides.length > 0 ? totalShifts / guides.length : 0;
    
    // Transform guide stats to match frontend expectations
    const guide_statistics = guideStats.map(g => ({
      ...g,
      name: g.guideName,           // Frontend expects 'name' property
      total_shifts: g.totalShifts, // Frontend expects this property name
      manual_shifts: g.manualShifts,
      auto_shifts: g.autoShifts,
      regular_shifts: g.weekdayShifts,  // May be needed
      overlap_shifts: g.weekendShifts   // May be needed
    }));
    
    const statistics = {
      month: `${year}-${String(month).padStart(2, '0')}`, // Frontend splits this
      monthName: `${year}-${String(month).padStart(2, '0')}`,
      totalDays,
      assignedDays,
      unassignedDays: totalDays - assignedDays,
      assignmentPercentage: Math.round((assignedDays / totalDays) * 100),
      
      // Frontend expects these specific property names
      day_statistics: {
        assigned_days: assignedDays,
        manual_days: manualAssignments,
        auto_days: autoAssignments,
        total_days: totalDays
      },
      
      averages: {
        shifts_per_guide: avgShiftsPerGuide
      },
      
      guide_statistics,
      
      // Legacy properties
      manualAssignments,
      autoAssignments,
      assignmentTypes,
      guideStats,
      lastUpdated: new Date().toISOString(),
      guides: guideStats.map(g => g.guideName).join(','),
      types: Object.keys(assignmentTypes).join(','),
      summary: `${assignedDays}/${totalDays} days assigned (${Math.round((assignedDays / totalDays) * 100)}%)`
    };
    
    // Return statistics data at root level for frontend compatibility
    res.json({ 
      success: true, 
      ...statistics,  // Spread statistics properties to root level
      statistics, 
      data: statistics 
    });
  } catch (error) {
    console.error('Error fetching enhanced statistics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch enhanced statistics' });
  }
});

// --- CLEAR MONTH SCHEDULES ---
app.delete('/api/schedule/clear-month', async (req, res) => {
  try {
    const { year, month } = req.body;
    
    if (!year || !month) {
      return res.status(400).json({ success: false, error: 'Year and month are required' });
    }
    
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    
    // Delete all schedules for the month
    const result = await db.query(
      'DELETE FROM schedule WHERE date LIKE $1 RETURNING *',
      [`${monthStr}-%`]
    );
    
    // Also clear workflow status for this month
    await db.query(
      'DELETE FROM workflow_status WHERE month = $1',
      [monthStr]
    );
    
    res.json({ 
      success: true, 
      message: `Cleared ${result.rows.length} assignments for ${monthStr}`,
      clearedCount: result.rows.length 
    });
  } catch (error) {
    console.error('Error clearing month schedules:', error);
    res.status(500).json({ success: false, error: 'Failed to clear month schedules' });
  }
});

// --- ENHANCED SCHEDULE ---
app.get('/api/schedule/enhanced/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = `${year}-${month.padStart(2, '0')}-31`;
    
    const result = await db.query(`
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
      WHERE s.date >= $1 AND s.date <= $2
      ORDER BY s.date ASC
    `, [startDate, endDate]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching enhanced schedule:', error);
    res.status(500).json({ error: 'Failed to fetch enhanced schedule' });
  }
});

// --- WORKFLOW STATUS ---
app.get('/api/workflow/status/:month', async (req, res) => {
  try {
    const { month } = req.params;
    
    const statusResult = await db.query('SELECT * FROM workflow_status WHERE month = $1', [month]);
    const status = statusResult.rows[0];
    
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
    const draftsResult = await db.query(`
      SELECT d.version, d.name, d.created_at, d.created_by, u.name as created_by_name
      FROM drafts d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.month = $1
      ORDER BY d.version DESC
    `, [month]);
    
    res.json({
      month: month,
      current_draft_version: status.current_draft_version,
      is_finalized: status.is_finalized === 1,
      can_edit: status.is_finalized === 0,
      drafts_available: draftsResult.rows,
      finalized_at: status.finalized_at,
      finalized_by: status.finalized_by
    });
    
  } catch (error) {
    console.error('Error getting workflow status:', error);
    res.status(500).json({ error: 'Failed to get workflow status' });
  }
});

// --- FIXED CONSTRAINTS ---
app.get('/api/fixed-constraints', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT f.*, u.name as guideName
      FROM fixed_constraints f
      LEFT JOIN users u ON f.user_id = u.id
      ORDER BY f.user_id, f.weekday
    `);
    
    const constraints = result.rows.map(row => ({
      ...row,
      guideId: row.user_id
    }));
    res.json(constraints);
  } catch (error) {
    console.error('Error fetching fixed constraints:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/fixed-constraints', async (req, res) => {
  try {
    const { guideId, weekday, hourStart, hourEnd, details } = req.body;
    const result = await db.query(
      'INSERT INTO fixed_constraints (user_id, weekday, hour_start, hour_end, details) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [guideId, weekday, hourStart, hourEnd, details || '']
    );
    
    const constraint = result.rows[0];
    res.status(201).json({ 
      ...constraint, 
      guideId: constraint.user_id
    });
  } catch (error) {
    console.error('Error creating fixed constraint:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- COORDINATOR RULES ---
app.get('/api/coordinator-rules', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT r.*, 
             u1.name as guide1_name,
             u2.name as guide2_name,
             u3.name as created_by_name
      FROM coordinator_rules r
      LEFT JOIN users u1 ON r.guide1_id = u1.id
      LEFT JOIN users u2 ON r.guide2_id = u2.id
      LEFT JOIN users u3 ON r.created_by = u3.id
      ORDER BY r.created_at DESC
    `);
    res.json({ success: true, rules: result.rows });
  } catch (error) {
    console.error('Error fetching coordinator rules:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch coordinator rules' });
  }
});

app.post('/api/coordinator-rules', async (req, res) => {
  try {
    const { guide1_id, guide2_id, rule_type, description, is_active, created_by } = req.body;
    const result = await db.query(
      'INSERT INTO coordinator_rules (guide1_id, guide2_id, rule_type, description, is_active, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [guide1_id, guide2_id, rule_type, description || '', is_active !== false ? 1 : 0, created_by || 1]
    );
    res.status(201).json({ success: true, rule: result.rows[0] });
  } catch (error) {
    console.error('Error creating coordinator rule:', error);
    res.status(500).json({ success: false, error: 'Failed to create coordinator rule' });
  }
});

app.put('/api/coordinator-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { guide1_id, guide2_id, rule_type, description, is_active } = req.body;
    const result = await db.query(
      'UPDATE coordinator_rules SET guide1_id = $1, guide2_id = $2, rule_type = $3, description = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *',
      [guide1_id, guide2_id, rule_type, description || '', is_active !== false ? 1 : 0, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    res.json({ success: true, rule: result.rows[0] });
  } catch (error) {
    console.error('Error updating coordinator rule:', error);
    res.status(500).json({ success: false, error: 'Failed to update coordinator rule' });
  }
});

app.delete('/api/coordinator-rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM coordinator_rules WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }
    res.json({ success: true, message: 'Rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting coordinator rule:', error);
    res.status(500).json({ success: false, error: 'Failed to delete coordinator rule' });
  }
});

// --- WEEKEND TYPE SINGLE DATE ---
app.get('/api/weekend-type/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const result = await db.query('SELECT * FROM weekend_types WHERE date = $1', [date]);
    
    if (result.rows.length === 0) {
      return res.json({ date, status: 'פתוחה' }); // Default to open
    }
    
    const weekendType = result.rows[0];
    res.json({
      date: weekendType.date,
      status: weekendType.is_closed ? 'סגורה' : 'פתוחה'
    });
  } catch (error) {
    console.error('Error fetching weekend type:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/weekend-type/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { status } = req.body;
    const isClosed = status === 'סגורה' ? 1 : 0;
    
    const result = await db.query(`
      INSERT INTO weekend_types (date, is_closed, updated_at) 
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (date) 
      DO UPDATE SET is_closed = $2, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [date, isClosed]);
    
    res.json({ 
      date: result.rows[0].date, 
      status: result.rows[0].is_closed ? 'סגורה' : 'פתוחה' 
    });
  } catch (error) {
    console.error('Error setting weekend type:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- ERROR HANDLING ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`🚀 Sigalit PostgreSQL server running on port ${PORT}`);
  console.log(`📍 Frontend: http://localhost:${PORT}`);
  console.log(`📍 API: http://localhost:${PORT}/api/*`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await db.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await db.shutdown();
  process.exit(0);
});