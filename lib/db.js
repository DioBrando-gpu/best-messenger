const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('DATABASE_URL is not set');
  return p.query(text, params);
}

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      username VARCHAR(32) PRIMARY KEY,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT '👤',
      bio TEXT DEFAULT '',
      settings JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_follows (
      follower VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      following VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      PRIMARY KEY (follower, following)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id BIGINT PRIMARY KEY,
      author VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      text TEXT NOT NULL,
      image TEXT,
      timestamp TIMESTAMPTZ NOT NULL,
      likes JSONB NOT NULL DEFAULT '[]',
      favorites JSONB NOT NULL DEFAULT '[]',
      comments JSONB NOT NULL DEFAULT '[]',
      shares INT NOT NULL DEFAULT 0,
      reposts INT NOT NULL DEFAULT 0,
      original_author VARCHAR(32),
      original_post_id BIGINT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id BIGINT PRIMARY KEY,
      from_user VARCHAR(32) NOT NULL,
      to_user TEXT NOT NULL,
      group_id TEXT,
      body TEXT,
      media TEXT,
      media_type TEXT,
      voice TEXT,
      timestamp TIMESTAMPTZ NOT NULL,
      read BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS chat_groups (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'group',
      title TEXT NOT NULL,
      slug VARCHAR(32) UNIQUE,
      owner VARCHAR(32) NOT NULL,
      admins JSONB NOT NULL DEFAULT '[]',
      members JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stands (
      id BIGINT PRIMARY KEY,
      author VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      video TEXT NOT NULL,
      caption TEXT DEFAULT '',
      timestamp TIMESTAMPTZ NOT NULL,
      likes JSONB NOT NULL DEFAULT '[]',
      favorites JSONB NOT NULL DEFAULT '[]',
      comments JSONB NOT NULL DEFAULT '[]',
      shares INT NOT NULL DEFAULT 0,
      reposts INT NOT NULL DEFAULT 0,
      original_author VARCHAR(32),
      original_stand_id BIGINT
    );

    CREATE TABLE IF NOT EXISTS stories (
      id BIGINT PRIMARY KEY,
      author VARCHAR(32) NOT NULL,
      media TEXT NOT NULL,
      duration INT DEFAULT 10,
      timestamp TIMESTAMPTZ NOT NULL,
      views JSONB NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS voice_messages (
      id BIGINT PRIMARY KEY,
      from_user VARCHAR(32) NOT NULL,
      to_user VARCHAR(32) NOT NULL,
      audio_data TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      read BOOLEAN NOT NULL DEFAULT false
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(40) DEFAULT '';
    ALTER TABLE messages ALTER COLUMN body DROP NOT NULL;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS media TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_image TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS blacklist JSONB DEFAULT '[]';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_username VARCHAR(32);
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS to_username VARCHAR(32);
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS "read" BOOLEAN DEFAULT false;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE posts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
    ALTER TABLE stands ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author);
    CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(from_username, to_username);
    CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id);
    CREATE INDEX IF NOT EXISTS idx_stands_author ON stands(author);
  `);
}

module.exports = { getPool, query, initSchema, usePostgres: () => Boolean(process.env.DATABASE_URL) };
