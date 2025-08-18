-- PostgreSQL Schema Migration for Sigalit Scheduling System
-- Migrated from SQLite to PostgreSQL
-- Date: August 18, 2025

-- Enable UUID extension (might be useful for future features)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (guides and coordinators)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  password TEXT,
  email TEXT,
  phone TEXT,
  percent INTEGER DEFAULT 100,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Constraints (one-time unavailability)
CREATE TABLE IF NOT EXISTS constraints (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  date TEXT NOT NULL, -- Keep as TEXT for compatibility with existing logic
  details TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Fixed constraints (recurring weekly constraints)
CREATE TABLE IF NOT EXISTS fixed_constraints (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday >= 0 AND weekday <= 6),
  hour_start TEXT,
  hour_end TEXT,
  details TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Vacations (date range unavailability)
CREATE TABLE IF NOT EXISTS vacations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  date_start TEXT NOT NULL, -- Keep as TEXT for compatibility
  date_end TEXT NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'pending',
  response_note TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Conversations (messaging system)
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  updated_at TEXT
);

-- Conversation participants
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

-- Override activities
CREATE TABLE IF NOT EXISTS overrides_activities (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  facilitator TEXT
);

-- Referrals (medical system)
CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  patient TEXT NOT NULL,
  reason TEXT NOT NULL,
  doctor TEXT NOT NULL,
  date TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT
);

-- Main schedule table (critical for scheduling algorithms)
CREATE TABLE IF NOT EXISTS schedule (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL, -- Keep as TEXT (YYYY-MM-DD) for compatibility
  weekday TEXT NOT NULL,
  type TEXT NOT NULL,
  guide1_id INTEGER,
  guide2_id INTEGER,
  guide1_name TEXT,
  guide2_name TEXT,
  guide1_role TEXT,
  guide2_role TEXT,
  is_manual INTEGER DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guide1_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (guide2_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Schedule draft table
CREATE TABLE IF NOT EXISTS schedule_draft (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  weekday TEXT NOT NULL,
  type TEXT NOT NULL,
  guide1_id INTEGER,
  guide2_id INTEGER,
  name TEXT,
  FOREIGN KEY (guide1_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (guide2_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  day TEXT NOT NULL,
  handover_guide_id INTEGER,
  regular_guide_id INTEGER,
  FOREIGN KEY (handover_guide_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (regular_guide_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Tasks management
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  created_at TEXT,
  creator_id INTEGER,
  assigned_to_id INTEGER,
  status TEXT DEFAULT 'open',
  shift_date TEXT,
  notes TEXT,
  closed_by_id INTEGER,
  closed_at TEXT,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (closed_by_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Weekly activities
CREATE TABLE IF NOT EXISTS weekly_activities (
  id SERIAL PRIMARY KEY,
  weekday TEXT NOT NULL,
  time TEXT NOT NULL,
  duration TEXT,
  title TEXT NOT NULL,
  category TEXT,
  facilitator TEXT
);

-- Messages (conversation system)
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  from_user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Scheduling rules (coordinator rules)
CREATE TABLE IF NOT EXISTS scheduling_rules (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL, -- 'manual_only', 'prevent_pair', 'no_oncall', etc.
  guide_id INTEGER NOT NULL,
  guide2_id INTEGER, -- nullable, only for prevent_pair
  created_by INTEGER,
  created_at TEXT,
  description TEXT,
  FOREIGN KEY (guide_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (guide2_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Shabbat status (legacy - keeping for migration compatibility)
CREATE TABLE IF NOT EXISTS shabbat_status (
  date TEXT PRIMARY KEY, -- שבת date (YYYY-MM-DD)
  status TEXT NOT NULL -- 'סגורה' or 'פתוחה'
);

-- Coordinator rules for dynamic scheduling
CREATE TABLE IF NOT EXISTS coordinator_rules (
  id SERIAL PRIMARY KEY,
  rule_type TEXT NOT NULL,
  guide1_id INTEGER,
  guide2_id INTEGER,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guide1_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (guide2_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Weekend types (critical for Friday/Saturday logic)
CREATE TABLE IF NOT EXISTS weekend_types (
  date TEXT PRIMARY KEY, -- Friday dates only (YYYY-MM-DD)
  is_closed INTEGER DEFAULT 0, -- 0 = open, 1 = closed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Drafts for version management
CREATE TABLE IF NOT EXISTS drafts (
  id SERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT,
  data TEXT NOT NULL, -- JSON data
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Assignment types (role definitions)
CREATE TABLE IF NOT EXISTS assignment_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL, -- רגיל, חפיפה, כונן, מוצ״ש
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shift types
CREATE TABLE IF NOT EXISTS shift_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  duration_hours DECIMAL(4,2),
  salary_factor DECIMAL(3,2) DEFAULT 1.0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for change tracking
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE
  old_values TEXT, -- JSON
  new_values TEXT, -- JSON
  user_id INTEGER,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Official schedules (workflow system)
CREATE TABLE IF NOT EXISTS official_schedules (
  id SERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  schedule_data TEXT NOT NULL, -- JSON
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active',
  notes TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Schedule history
CREATE TABLE IF NOT EXISTS schedule_history (
  id SERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  schedule_type TEXT NOT NULL, -- 'draft', 'official'
  version INTEGER NOT NULL,
  schedule_data TEXT NOT NULL, -- JSON
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action TEXT, -- 'created', 'modified', 'sent_to_guides', 'finalized'
  notes TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Email logs
CREATE TABLE IF NOT EXISTS email_logs (
  id SERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  draft_version INTEGER NOT NULL,
  recipient_id INTEGER,
  recipient_email TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  email_content TEXT,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Workflow status tracking
CREATE TABLE IF NOT EXISTS workflow_status (
  month TEXT PRIMARY KEY,
  current_draft_version INTEGER DEFAULT 0,
  is_finalized INTEGER DEFAULT 0,
  finalized_at TIMESTAMP,
  finalized_by INTEGER,
  last_email_sent_version INTEGER DEFAULT 0,
  last_email_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (finalized_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule(date);
CREATE INDEX IF NOT EXISTS idx_schedule_guides ON schedule(guide1_id, guide2_id);
CREATE INDEX IF NOT EXISTS idx_schedule_manual ON schedule(is_manual, is_locked);
CREATE INDEX IF NOT EXISTS idx_constraints_user_date ON constraints(user_id, date);
CREATE INDEX IF NOT EXISTS idx_fixed_constraints_user_weekday ON fixed_constraints(user_id, weekday);
CREATE INDEX IF NOT EXISTS idx_vacations_user_dates ON vacations(user_id, date_start, date_end);
CREATE INDEX IF NOT EXISTS idx_coordinator_rules_type ON coordinator_rules(rule_type, is_active);
CREATE INDEX IF NOT EXISTS idx_coordinator_rules_guides ON coordinator_rules(guide1_id, guide2_id, is_active);
CREATE INDEX IF NOT EXISTS idx_weekend_types_date ON weekend_types(date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, shift_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log(table_name, record_id);

-- Insert default assignment types (Hebrew roles)
INSERT INTO assignment_types (id, name, description) VALUES
  (1, 'רגיל', 'משמרת רגילה - 09:00 עד 09:00 למחרת'),
  (2, 'חפיפה', 'משמרת חפיפה - 09:00 עד 10:00 למחרת'),
  (3, 'כונן', 'כונן שבת סגורה - שישי 09:00 עד שבת 17:00'),
  (4, 'מוצ״ש', 'מוצאי שבת - שבת 17:00 עד ראשון 09:00')
ON CONFLICT (id) DO NOTHING;

-- Insert default shift types
INSERT INTO shift_types (id, name, start_time, end_time) VALUES
  (1, 'weekday', '09:00', '09:00'),
  (2, 'weekend_open', '09:00', '09:00'),
  (3, 'weekend_closed', '09:00', '17:00'),
  (4, 'holiday', '09:00', '09:00')
ON CONFLICT (id) DO NOTHING;

-- Comments for critical tables
COMMENT ON TABLE schedule IS 'Main scheduling table - contains all shift assignments';
COMMENT ON TABLE weekend_types IS 'Weekend open/closed configuration - Friday dates only, Saturday reads Friday';
COMMENT ON TABLE constraints IS 'One-time date constraints for guide unavailability';
COMMENT ON TABLE fixed_constraints IS 'Recurring weekly constraints (e.g., Sunday unavailable)';
COMMENT ON TABLE vacations IS 'Date range vacation requests and approvals';
COMMENT ON COLUMN weekend_types.date IS 'Friday dates only - Saturday logic reads from corresponding Friday';
COMMENT ON COLUMN schedule.is_manual IS 'Manual assignments override automatic scheduling';
COMMENT ON COLUMN schedule.is_locked IS 'Locked assignments cannot be changed by auto-scheduling';

-- Schema creation completed
SELECT 'PostgreSQL schema migration completed successfully' as status;