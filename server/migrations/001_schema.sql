-- 001_schema.sql
-- Fabrica P1 database schema

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  scope_node_id VARCHAR(255),
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_room_assignments (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  room_key VARCHAR(255) NOT NULL,
  PRIMARY KEY (user_id, room_key)
);

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  agent_type VARCHAR(50) NOT NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_room_assignments (
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  room_key VARCHAR(255) NOT NULL,
  PRIMARY KEY (agent_id, room_key)
);

CREATE TABLE IF NOT EXISTS vsm_state (
  org_id UUID PRIMARY KEY REFERENCES organizations(id),
  model JSONB NOT NULL DEFAULT '{}',
  processors JSONB NOT NULL DEFAULT '{}',
  cables JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invites (
  token VARCHAR(255) PRIMARY KEY,
  org_id UUID REFERENCES organizations(id),
  rooms TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  redeemed_at TIMESTAMP,
  redeemed_by UUID REFERENCES users(id)
);

-- Default organization for single-tenant mode
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default')
ON CONFLICT (id) DO NOTHING;
