-- =============================================
-- Hermes conversations and auditable task runs (v1)
-- =============================================

CREATE TABLE IF NOT EXISTS hermes_conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  owner_username TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '新的研判任务',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hermes_conversations_owner_updated
  ON hermes_conversations(user_id, owner_username, updated_at DESC);

CREATE TABLE IF NOT EXISTS hermes_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES hermes_conversations(conversation_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hermes_messages_conversation_created
  ON hermes_messages(conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS hermes_tasks (
  task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES hermes_conversations(conversation_id) ON DELETE CASCADE,
  request_message_id UUID REFERENCES hermes_messages(message_id) ON DELETE SET NULL,
  requested_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  requested_by_username TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('recheck', 'collect_logs', 'generate_report')),
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'awaiting_confirmation', 'succeeded', 'failed', 'cancelled')),
  safety_level TEXT NOT NULL DEFAULT 'read_only'
    CHECK (safety_level IN ('read_only', 'approval_required')),
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  edge_action_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hermes_tasks_conversation_created
  ON hermes_tasks(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hermes_tasks_status_created
  ON hermes_tasks(status, created_at DESC);
