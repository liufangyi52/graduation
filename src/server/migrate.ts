import { pool } from './database'

async function addColumnIfMissing(table: string, column: string, definition: string) {
  const [rows] = await pool.query<any[]>('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column])
  if (!rows.length) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
}

export async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    role ENUM('manager','member','admin','auditor') NOT NULL,
    name VARCHAR(80) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS projects (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    description TEXT NULL,
    owner_id CHAR(36) NOT NULL,
    status ENUM('active','paused','archived') NOT NULL DEFAULT 'active',
    start_date DATE NULL,
    end_date DATE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS project_members (
    project_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    project_role VARCHAR(50) NOT NULL DEFAULT 'member',
    PRIMARY KEY (project_id, user_id),
    CONSTRAINT fk_members_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
    id CHAR(36) PRIMARY KEY,
    title VARCHAR(180) NOT NULL,
    description TEXT NULL,
    project_id CHAR(36) NOT NULL,
    assignee_id CHAR(36) NOT NULL,
    priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
    status ENUM('todo','in_progress','completed','closed') NOT NULL DEFAULT 'todo',
    progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
    due_date DATE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id),
    CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS task_feedbacks (
    id CHAR(36) PRIMARY KEY,
    task_id CHAR(36) NOT NULL,
    author_id CHAR(36) NOT NULL,
    content TEXT NOT NULL,
    progress TINYINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_feedback_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_feedback_author FOREIGN KEY (author_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NULL,
    link VARCHAR(255) NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await addColumnIfMissing('users', 'is_active', 'is_active BOOLEAN NOT NULL DEFAULT TRUE')
  await addColumnIfMissing('users', 'auth_version', 'auth_version INT NOT NULL DEFAULT 0')
  await pool.query(`CREATE TABLE IF NOT EXISTS meetings (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    created_by CHAR(36) NOT NULL,
    title VARCHAR(180) NOT NULL,
    content LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_meetings_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_meetings_creator FOREIGN KEY (created_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_analyses (
    id CHAR(36) PRIMARY KEY,
    meeting_id CHAR(36) NOT NULL,
    requested_by CHAR(36) NOT NULL,
    status ENUM('pending','approved','rejected','failed') NOT NULL DEFAULT 'pending',
    model VARCHAR(100) NOT NULL,
    result_json JSON NULL,
    error_message TEXT NULL,
    reviewed_by CHAR(36) NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_analyses_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    CONSTRAINT fk_analyses_requester FOREIGN KEY (requested_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_analysis_drafts (
    analysis_id CHAR(36) PRIMARY KEY,
    draft_json JSON NOT NULL,
    updated_by CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_analysis_drafts_analysis FOREIGN KEY (analysis_id) REFERENCES ai_analyses(id) ON DELETE CASCADE,
    CONSTRAINT fk_analysis_drafts_updater FOREIGN KEY (updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS meeting_versions (
    id CHAR(36) PRIMARY KEY,
    meeting_id CHAR(36) NOT NULL,
    version_number INT NOT NULL,
    source_type ENUM('text','txt','docx','restore') NOT NULL,
    original_content LONGTEXT NOT NULL,
    desensitized_content LONGTEXT NOT NULL,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_meeting_version_number (meeting_id, version_number),
    CONSTRAINT fk_versions_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    CONSTRAINT fk_versions_creator FOREIGN KEY (created_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await addColumnIfMissing('meetings', 'current_version_id', 'current_version_id CHAR(36) NULL')
  await addColumnIfMissing('ai_analyses', 'rejection_reason', 'rejection_reason VARCHAR(500) NULL')
  await addColumnIfMissing('projects', 'deleted_at', 'deleted_at TIMESTAMP NULL')
  await addColumnIfMissing('projects', 'deleted_by', 'deleted_by CHAR(36) NULL')
  await addColumnIfMissing('ai_analyses', 'reanalysis_of_id', 'reanalysis_of_id CHAR(36) NULL')
  await addColumnIfMissing('ai_analyses', 'mode', "mode ENUM('manual','llm','rag','agent') NOT NULL DEFAULT 'llm'")
  await addColumnIfMissing('ai_analyses', 'execution_metadata', 'execution_metadata JSON NULL')
  await addColumnIfMissing('ai_analyses', 'started_at', 'started_at TIMESTAMP NULL')
  await addColumnIfMissing('ai_analyses', 'finished_at', 'finished_at TIMESTAMP NULL')
  await addColumnIfMissing('ai_analyses', 'duration_ms', 'duration_ms INT NULL')
  await addColumnIfMissing('ai_analyses', 'model_call_count', 'model_call_count INT NOT NULL DEFAULT 0')
  await pool.query('CREATE INDEX idx_projects_deleted_owner ON projects (deleted_at, owner_id)')
    .catch((error: { code?: string }) => { if (error.code !== 'ER_DUP_KEYNAME') throw error })
  await pool.query('CREATE INDEX idx_tasks_project_status_due ON tasks (project_id, status, due_date)')
    .catch((error: { code?: string }) => { if (error.code !== 'ER_DUP_KEYNAME') throw error })
  await pool.query(`CREATE TABLE IF NOT EXISTS project_tags (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    name VARCHAR(60) NOT NULL,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_project_tag_name (project_id, name),
    CONSTRAINT fk_project_tags_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_tags_creator FOREIGN KEY (created_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS project_tag_links (
    project_id CHAR(36) NOT NULL,
    tag_id CHAR(36) NOT NULL,
    PRIMARY KEY (project_id, tag_id),
    CONSTRAINT fk_tag_links_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_tag_links_tag FOREIGN KEY (tag_id) REFERENCES project_tags(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS desensitization_rules (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    name VARCHAR(60) NOT NULL,
    pattern VARCHAR(500) NOT NULL,
    replacement VARCHAR(200) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_desensitization_rules_project_enabled_created (project_id, enabled, created_at),
    CONSTRAINT fk_desensitization_rules_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT fk_desensitization_rules_creator FOREIGN KEY (created_by) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS desensitization_logs (
    id CHAR(36) PRIMARY KEY,
    meeting_version_id CHAR(36) NOT NULL,
    actor_id CHAR(36) NOT NULL,
    rule_kind ENUM('fixed','custom') NOT NULL,
    rule_id VARCHAR(64) NOT NULL,
    hit_count INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_desensitization_logs_version_created (meeting_version_id, created_at),
    CONSTRAINT fk_desensitization_logs_version FOREIGN KEY (meeting_version_id) REFERENCES meeting_versions(id) ON DELETE CASCADE,
    CONSTRAINT fk_desensitization_logs_actor FOREIGN KEY (actor_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS task_notes (
    id CHAR(36) PRIMARY KEY,
    task_id CHAR(36) NOT NULL,
    author_id CHAR(36) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_notes_task_created (task_id, created_at),
    CONSTRAINT fk_task_notes_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_notes_author FOREIGN KEY (author_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS risks (
    id CHAR(36) PRIMARY KEY,
    project_id CHAR(36) NOT NULL,
    analysis_id CHAR(36) NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    level ENUM('low','medium','high') NOT NULL,
    status ENUM('open','resolved') NOT NULL DEFAULT 'open',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_by CHAR(36) NULL,
    resolved_at TIMESTAMP NULL,
    CONSTRAINT fk_risks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id CHAR(36) PRIMARY KEY,
    actor_id CHAR(36) NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id CHAR(36) NULL,
    details JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_created_at (created_at),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`CREATE TABLE IF NOT EXISTS system_settings (
    id TINYINT PRIMARY KEY,
    model VARCHAR(100) NOT NULL DEFAULT 'DeepSeek V3',
    mode VARCHAR(100) NOT NULL DEFAULT 'RAG',
    desensitize BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_system_settings_singleton CHECK (id = 1)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  await pool.query(`INSERT IGNORE INTO system_settings (id) VALUES (1)`)
}
