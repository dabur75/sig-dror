#!/usr/bin/env node
const Database = require('better-sqlite3');
const db_postgresql = require('./database');

// SQLite database connection
const db_sqlite = new Database('sigalit.db');

async function migrateData() {
  console.log('🚀 Starting data migration from SQLite to PostgreSQL...');
  
  try {
    // 1. Migrate users (guides)
    console.log('📋 Migrating users...');
    const users = db_sqlite.prepare('SELECT * FROM users').all();
    for (const user of users) {
      await db_postgresql.query(
        `INSERT INTO users (id, name, role, password, email, phone, percent, is_active, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = $2, role = $3, password = $4, email = $5, phone = $6, 
           percent = $7, is_active = $8, updated_at = $10`,
        [
          user.id, user.name, user.role, 
          user.password || '', user.email || '', user.phone || '',
          user.percent || 100, user.is_active || 1,
          user.created_at || new Date().toISOString(),
          user.updated_at || new Date().toISOString()
        ]
      );
    }
    console.log(`✅ Migrated ${users.length} users`);

    // 2. Migrate constraints
    console.log('📋 Migrating constraints...');
    const constraints = db_sqlite.prepare('SELECT * FROM constraints').all();
    for (const constraint of constraints) {
      await db_postgresql.query(
        `INSERT INTO constraints (id, user_id, type, date, details) 
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           user_id = $2, type = $3, date = $4, details = $5`,
        [constraint.id, constraint.user_id, constraint.type, constraint.date, constraint.details]
      );
    }
    console.log(`✅ Migrated ${constraints.length} constraints`);

    // 3. Migrate fixed_constraints
    console.log('📋 Migrating fixed constraints...');
    const fixedConstraints = db_sqlite.prepare('SELECT * FROM fixed_constraints').all();
    for (const fc of fixedConstraints) {
      await db_postgresql.query(
        `INSERT INTO fixed_constraints (id, user_id, weekday, hour_start, hour_end, details) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           user_id = $2, weekday = $3, hour_start = $4, hour_end = $5, details = $6`,
        [fc.id, fc.user_id, fc.weekday, fc.hour_start, fc.hour_end, fc.details]
      );
    }
    console.log(`✅ Migrated ${fixedConstraints.length} fixed constraints`);

    // 4. Migrate vacations
    console.log('📋 Migrating vacations...');
    const vacations = db_sqlite.prepare('SELECT * FROM vacations').all();
    for (const vacation of vacations) {
      await db_postgresql.query(
        `INSERT INTO vacations (id, user_id, date_start, date_end, note, status, response_note) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           user_id = $2, date_start = $3, date_end = $4, note = $5, status = $6, response_note = $7`,
        [vacation.id, vacation.user_id, vacation.date_start, vacation.date_end, 
         vacation.note, vacation.status, vacation.response_note]
      );
    }
    console.log(`✅ Migrated ${vacations.length} vacations`);

    // 5. Migrate schedule (CRITICAL - this contains all the scheduling data)
    console.log('📋 Migrating schedule...');
    const schedules = db_sqlite.prepare('SELECT * FROM schedule').all();
    for (const schedule of schedules) {
      await db_postgresql.query(
        `INSERT INTO schedule (id, date, weekday, type, guide1_id, guide2_id, guide1_name, guide2_name, 
                               guide1_role, guide2_role, is_manual, is_locked, created_by, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO UPDATE SET
           date = $2, weekday = $3, type = $4, guide1_id = $5, guide2_id = $6,
           guide1_name = $7, guide2_name = $8, guide1_role = $9, guide2_role = $10,
           is_manual = $11, is_locked = $12, created_by = $13, updated_at = $15`,
        [
          schedule.id, schedule.date, schedule.weekday, schedule.type,
          schedule.guide1_id, schedule.guide2_id, schedule.guide1_name, schedule.guide2_name,
          schedule.guide1_role, schedule.guide2_role, 
          schedule.is_manual || 0, schedule.is_locked || 0, schedule.created_by,
          schedule.created_at || new Date().toISOString(),
          schedule.updated_at || new Date().toISOString()
        ]
      );
    }
    console.log(`✅ Migrated ${schedules.length} schedule entries`);

    // 6. Migrate weekend_types (CRITICAL for Friday/Saturday logic)
    console.log('📋 Migrating weekend types...');
    
    // First try the new weekend_types table
    let weekendTypes = [];
    try {
      weekendTypes = db_sqlite.prepare('SELECT * FROM weekend_types').all();
      console.log(`Found ${weekendTypes.length} entries in weekend_types table`);
    } catch (e) {
      console.log('weekend_types table not found, checking shabbat_status...');
    }
    
    // If no weekend_types, try shabbat_status (legacy)
    if (weekendTypes.length === 0) {
      try {
        const shabbatStatuses = db_sqlite.prepare('SELECT * FROM shabbat_status').all();
        weekendTypes = shabbatStatuses.map(s => ({
          date: s.date,
          is_closed: s.status === 'סגורה' ? 1 : 0
        }));
        console.log(`Converted ${weekendTypes.length} entries from shabbat_status`);
      } catch (e) {
        console.log('No shabbat_status table found either');
      }
    }

    for (const wt of weekendTypes) {
      await db_postgresql.query(
        `INSERT INTO weekend_types (date, is_closed, created_at, updated_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (date) DO UPDATE SET
           is_closed = $2, updated_at = CURRENT_TIMESTAMP`,
        [wt.date, wt.is_closed]
      );
    }
    console.log(`✅ Migrated ${weekendTypes.length} weekend types`);

    // 7. Migrate tasks
    console.log('📋 Migrating tasks...');
    const tasks = db_sqlite.prepare('SELECT * FROM tasks').all();
    
    // Get valid user IDs to check foreign key constraints
    const validUserIds = new Set((await db_postgresql.query('SELECT id FROM users')).rows.map(row => row.id));
    
    for (const task of tasks) {
      // Validate foreign key references - set to null if user doesn't exist
      const creator_id = task.creator_id && validUserIds.has(task.creator_id) ? task.creator_id : null;
      const assigned_to_id = task.assigned_to_id && validUserIds.has(task.assigned_to_id) ? task.assigned_to_id : null;
      const closed_by_id = task.closed_by_id && validUserIds.has(task.closed_by_id) ? task.closed_by_id : null;
      
      await db_postgresql.query(
        `INSERT INTO tasks (id, text, created_at, creator_id, assigned_to_id, status, shift_date, notes, closed_by_id, closed_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           text = $2, created_at = $3, creator_id = $4, assigned_to_id = $5,
           status = $6, shift_date = $7, notes = $8, closed_by_id = $9, closed_at = $10`,
        [task.id, task.text, task.created_at, creator_id, assigned_to_id,
         task.status || 'open', task.shift_date, task.notes, closed_by_id, task.closed_at]
      );
    }
    console.log(`✅ Migrated ${tasks.length} tasks`);

    // 8. Update PostgreSQL sequences to match the highest IDs
    console.log('📋 Updating PostgreSQL sequences...');
    
    // Update sequences for tables with SERIAL primary keys
    const tables = ['users', 'constraints', 'fixed_constraints', 'vacations', 'schedule', 'tasks'];
    
    for (const table of tables) {
      try {
        const result = await db_postgresql.query(`SELECT MAX(id) as max_id FROM ${table}`);
        const maxId = result.rows[0].max_id;
        
        if (maxId) {
          await db_postgresql.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), ${maxId})`);
          console.log(`✅ Updated ${table} sequence to ${maxId}`);
        }
      } catch (error) {
        console.log(`⚠️  Could not update sequence for ${table}:`, error.message);
      }
    }

    console.log('🎉 Data migration completed successfully!');
    
    // Verify migration by counting records in PostgreSQL
    console.log('\n📊 Migration verification:');
    const verificationTables = ['users', 'constraints', 'fixed_constraints', 'vacations', 'schedule', 'weekend_types', 'tasks'];
    
    for (const table of verificationTables) {
      try {
        const result = await db_postgresql.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`${table}: ${result.rows[0].count} records`);
      } catch (error) {
        console.log(`${table}: Error - ${error.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close SQLite connection
    db_sqlite.close();
    
    // Close PostgreSQL connection
    await db_postgresql.shutdown();
  }
}

// Run migration
migrateData();