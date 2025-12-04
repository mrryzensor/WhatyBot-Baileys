import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PROFILES_ROOT = process.env.PROFILES_ROOT
  ? path.resolve(process.env.PROFILES_ROOT)
  : path.join(__dirname);

const DB_FILE_NAME = 'profiles.db';
const PROFILE_STATUS = {
  STOPPED: 'stopped',
  RUNNING: 'running',
  ERROR: 'error'
};

let dbInstance = null;

function ensureDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function getProfilesRoot() {
  ensureDirectory(DEFAULT_PROFILES_ROOT);
  return DEFAULT_PROFILES_ROOT;
}

function getDbPath() {
  return path.join(getProfilesRoot(), DB_FILE_NAME);
}

function initializeDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getDbPath();
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');

  dbInstance
    .prepare(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        backend_port INTEGER,
        frontend_port INTEGER,
        session_dir TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_pid INTEGER,
        status TEXT DEFAULT 'stopped',
        notes TEXT
      )
    `)
    .run();

  dbInstance
    .prepare(`
      CREATE TABLE IF NOT EXISTS profile_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_slug TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (profile_slug) REFERENCES profiles(slug) ON DELETE CASCADE
      )
    `)
    .run();

  return dbInstance;
}

function getDb() {
  return initializeDatabase();
}

function nowIso() {
  return new Date().toISOString();
}

function getProfilePath(slug, ...segments) {
  const base = path.join(getProfilesRoot(), slug);
  return segments.length ? path.join(base, ...segments) : base;
}

function writeProfileSnapshot(profile) {
  const profileDir = getProfilePath(profile.slug);
  ensureDirectory(profileDir);
  const snapshotPath = path.join(profileDir, 'profile.json');
  const snapshot = {
    slug: profile.slug,
    name: profile.display_name,
    backendPort: profile.backend_port,
    frontendPort: profile.frontend_port,
    sessionDir: profile.session_dir,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    status: profile.status,
    lastPid: profile.last_pid,
    notes: profile.notes
  };
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
}

function ensureProfileStructure(slug) {
  const profileDir = getProfilePath(slug);
  ensureDirectory(profileDir);
  ensureDirectory(getProfilePath(slug, '.baileys_auth'));
  ensureDirectory(getProfilePath(slug, 'logs'));
}

function recordEvent(slug, type, message = null) {
  const db = getDb();
  db.prepare(
    `INSERT INTO profile_events (profile_slug, type, message, created_at)
     VALUES (@slug, @type, @message, @createdAt)`
  ).run({ slug, type, message, createdAt: nowIso() });
}

export function listProfiles() {
  const db = getDb();
  return db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all();
}

export function getProfileBySlug(slug) {
  const db = getDb();
  return db.prepare('SELECT * FROM profiles WHERE slug = ?').get(slug);
}

export function upsertProfile({
  slug,
  displayName,
  backendPort,
  frontendPort,
  sessionDir,
  notes = null
}) {
  if (!slug || !displayName) {
    throw new Error('slug and displayName are required');
  }

  const db = getDb();
  const existing = getProfileBySlug(slug);
  const timestamps = { createdAt: nowIso(), updatedAt: nowIso() };

  if (existing) {
    db.prepare(
      `UPDATE profiles SET
        display_name = @displayName,
        backend_port = @backendPort,
        frontend_port = @frontendPort,
        session_dir = @sessionDir,
        updated_at = @updatedAt,
        notes = @notes
      WHERE slug = @slug`
    ).run({
      slug,
      displayName,
      backendPort,
      frontendPort,
      sessionDir,
      updatedAt: timestamps.updatedAt,
      notes
    });
  } else {
    db.prepare(
      `INSERT INTO profiles (
        slug, display_name, backend_port, frontend_port, session_dir,
        created_at, updated_at, status
      ) VALUES (
        @slug, @displayName, @backendPort, @frontendPort, @sessionDir,
        @createdAt, @updatedAt, @status
      )`
    ).run({
      slug,
      displayName,
      backendPort,
      frontendPort,
      sessionDir,
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt,
      status: PROFILE_STATUS.STOPPED
    });
  }

  ensureProfileStructure(slug);
  const updated = getProfileBySlug(slug);
  writeProfileSnapshot(updated);
  recordEvent(slug, existing ? 'updated' : 'created', existing ? 'Perfil actualizado' : 'Perfil creado');
  return updated;
}

export function updateProfileStatus(slug, status, { pid = null, message = null } = {}) {
  const db = getDb();
  const profile = getProfileBySlug(slug);
  if (!profile) {
    throw new Error(`Perfil ${slug} no existe`);
  }

  db.prepare(
    `UPDATE profiles SET status = @status, last_pid = @pid, updated_at = @updatedAt
     WHERE slug = @slug`
  ).run({ slug, status, pid, updatedAt: nowIso() });

  recordEvent(slug, `status:${status}`, message);
  const updated = getProfileBySlug(slug);
  writeProfileSnapshot(updated);
  return updated;
}

export function updateProfilePorts(slug, { backendPort = null, frontendPort = null } = {}) {
  const db = getDb();
  const profile = getProfileBySlug(slug);
  if (!profile) {
    throw new Error(`Perfil ${slug} no existe`);
  }

  db.prepare(
    `UPDATE profiles SET backend_port = COALESCE(@backendPort, backend_port),
      frontend_port = COALESCE(@frontendPort, frontend_port),
      updated_at = @updatedAt
     WHERE slug = @slug`
  ).run({ slug, backendPort, frontendPort, updatedAt: nowIso() });

  recordEvent(
    slug,
    'ports:update',
    `Puertos actualizados${backendPort ? ` backend:${backendPort}` : ''}${frontendPort ? ` frontend:${frontendPort}` : ''}`
  );
  const updated = getProfileBySlug(slug);
  writeProfileSnapshot(updated);
  return updated;
}

export function removeProfile(slug, { deleteFiles = false } = {}) {
  const db = getDb();
  const profile = getProfileBySlug(slug);
  if (!profile) return;

  db.prepare('DELETE FROM profiles WHERE slug = ?').run(slug);
  recordEvent(slug, 'deleted', 'Perfil eliminado');

  if (deleteFiles) {
    const profileDir = getProfilePath(slug);
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }
}

export function recordProfileNote(slug, note) {
  const db = getDb();
  db.prepare(
    `UPDATE profiles SET notes = @note, updated_at = @updatedAt WHERE slug = @slug`
  ).run({ slug, note, updatedAt: nowIso() });
  recordEvent(slug, 'note', note);
}

export function getProfileEvents(slug, { limit = 50 } = {}) {
  const db = getDb();
  return db
    .prepare(
      'SELECT * FROM profile_events WHERE profile_slug = ? ORDER BY created_at DESC LIMIT ?'
    )
    .all(slug, limit);
}

export function ensureProfileSnapshot(slug) {
  const profile = getProfileBySlug(slug);
  if (!profile) return;
  ensureProfileStructure(slug);
  writeProfileSnapshot(profile);
}

export function PROFILE_CONSTANTS() {
  return {
    ROOT: getProfilesRoot(),
    DB_PATH: getDbPath(),
    STATUS: PROFILE_STATUS
  };
}
