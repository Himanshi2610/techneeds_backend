const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const file = process.env.DB_PATH || './data/techneeds.db';
fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, desc TEXT DEFAULT '',
  mentor_id TEXT, seats INTEGER DEFAULT 50
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin','mentor','mentee')),
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  program_id TEXT,            -- mentee's program
  program_ids TEXT,           -- mentor's programs (JSON array)
  tags TEXT DEFAULT '[]'      -- mentee interests (JSON array)
);
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video','quiz','project')),
  title TEXT NOT NULL, url TEXT DEFAULT '',
  deadline TEXT NOT NULL, max_score INTEGER NOT NULL DEFAULT 50
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link TEXT DEFAULT '', at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','graded')),
  score INTEGER NOT NULL DEFAULT 0,
  UNIQUE (resource_id, user_id)
);
CREATE TABLE IF NOT EXISTS ai_cache (
  user_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, payload TEXT NOT NULL
);
`);

module.exports = db;
