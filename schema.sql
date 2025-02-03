-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create memories table
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'default',
    tags TEXT[] DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    embedding REAL[] DEFAULT '{}',
    source VARCHAR(100) DEFAULT 'system'
);

-- Create chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    chat_id UUID DEFAULT uuid_generate_v4() UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    chat_id UUID REFERENCES chat_sessions(chat_id) ON DELETE CASCADE,
    sender TEXT NOT NULL, -- 'user' or 'ai'
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create schema for managing addon commands
CREATE TABLE IF NOT EXISTS addons (
    id SERIAL PRIMARY KEY,
    package_name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50),
    author VARCHAR(255),
    homepage_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commands (
    id SERIAL PRIMARY KEY,
    addon_id INTEGER REFERENCES addons(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    usage_example TEXT,
    category VARCHAR(100),
    is_async BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(addon_id, name)
);

CREATE TABLE IF NOT EXISTS command_parameters (
    id SERIAL PRIMARY KEY,
    command_id INTEGER REFERENCES commands(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parameter_type VARCHAR(50) NOT NULL,
    is_required BOOLEAN DEFAULT false,
    default_value TEXT,
    validation_rules JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(command_id, name)
);


-- Create indexes
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);