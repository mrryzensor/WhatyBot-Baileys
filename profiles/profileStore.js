import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PROFILES_ROOT = process.env.PROFILES_ROOT
  ? path.resolve(process.env.PROFILES_ROOT)
  : path.join(__dirname);

const PROFILE_FILE_NAME = 'profiles.json';
const EVENTS_FILE_NAME = 'profile-events.json';

const PROFILE_STATUS = {
  STOPPED: 'stopped',
  RUNNING: 'running',
  ERROR: 'error'
};

function ensureDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function getProfilesRoot() {
  ensureDirectory(DEFAULT_PROFILES_ROOT);
  return DEFAULT_PROFILES_ROOT;
}

function getProfilesFilePath() {
  return path.join(getProfilesRoot(), PROFILE_FILE_NAME);
}

function getEventsFilePath() {
  return path.join(getProfilesRoot(), EVENTS_FILE_NAME);
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return content ? JSON.parse(content) : fallback;
  } catch (error) {
    console.warn('Failed to read JSON file', filePath, error);
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to write JSON file', filePath, error);
  }
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

function loadProfiles() {
  const filePath = getProfilesFilePath();
  const raw = readJsonFile(filePath, []);
  if (!Array.isArray(raw)) return [];
  return raw;
}

function saveProfiles(profiles) {
  const filePath = getProfilesFilePath();
  writeJsonFile(filePath, profiles);
}

function loadEvents() {
  const filePath = getEventsFilePath();
  const raw = readJsonFile(filePath, []);
  if (!Array.isArray(raw)) return [];
  return raw;
}

function saveEvents(events) {
  const filePath = getEventsFilePath();
  writeJsonFile(filePath, events);
}

function recordEvent(slug, type, message = null) {
  const events = loadEvents();
  const event = {
    id: events.length ? (events[events.length - 1].id || events.length) + 1 : 1,
    profile_slug: slug,
    type,
    message,
    created_at: nowIso()
  };
  events.push(event);
  saveEvents(events);
}

export function listProfiles() {
  const profiles = loadProfiles();
  return [...profiles].sort((a, b) => {
    const aDate = a.created_at || a.updated_at || '';
    const bDate = b.created_at || b.updated_at || '';
    return aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
  });
}

export function getProfileBySlug(slug) {
  const profiles = loadProfiles();
  return profiles.find(p => p.slug === slug) || null;
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

  const profiles = loadProfiles();
  const timestamps = { createdAt: nowIso(), updatedAt: nowIso() };
  const existingIndex = profiles.findIndex(p => p.slug === slug);

  if (existingIndex >= 0) {
    const existing = profiles[existingIndex];
    const updated = {
      ...existing,
      display_name: displayName,
      backend_port: backendPort,
      frontend_port: frontendPort,
      session_dir: sessionDir,
      updated_at: timestamps.updatedAt,
      notes
    };
    profiles[existingIndex] = updated;
    saveProfiles(profiles);
    ensureProfileStructure(slug);
    writeProfileSnapshot(updated);
    recordEvent(slug, 'updated', 'Perfil actualizado');
    return updated;
  }

  const created = {
    id: profiles.length ? (profiles[profiles.length - 1].id || profiles.length) + 1 : 1,
    slug,
    display_name: displayName,
    backend_port: backendPort,
    frontend_port: frontendPort,
    session_dir: sessionDir,
    created_at: timestamps.createdAt,
    updated_at: timestamps.updatedAt,
    last_pid: null,
    status: PROFILE_STATUS.STOPPED,
    notes
  };

  profiles.push(created);
  saveProfiles(profiles);
  ensureProfileStructure(slug);
  writeProfileSnapshot(created);
  recordEvent(slug, 'created', 'Perfil creado');
  return created;
}

export function updateProfileStatus(slug, status, { pid = null, message = null } = {}) {
  const profiles = loadProfiles();
  const index = profiles.findIndex(p => p.slug === slug);
  if (index < 0) {
    throw new Error(`Perfil ${slug} no existe`);
  }

  const updated = {
    ...profiles[index],
    status,
    last_pid: pid,
    updated_at: nowIso()
  };

  profiles[index] = updated;
  saveProfiles(profiles);
  recordEvent(slug, `status:${status}`, message);
  writeProfileSnapshot(updated);
  return updated;
}

export function updateProfilePorts(slug, { backendPort = null, frontendPort = null } = {}) {
  const profiles = loadProfiles();
  const index = profiles.findIndex(p => p.slug === slug);
  if (index < 0) {
    throw new Error(`Perfil ${slug} no existe`);
  }

  const current = profiles[index];
  const updated = {
    ...current,
    backend_port: backendPort ?? current.backend_port,
    frontend_port: frontendPort ?? current.frontend_port,
    updated_at: nowIso()
  };

  profiles[index] = updated;
  saveProfiles(profiles);

  recordEvent(
    slug,
    'ports:update',
    `Puertos actualizados${backendPort ? ` backend:${backendPort}` : ''}${frontendPort ? ` frontend:${frontendPort}` : ''}`
  );
  writeProfileSnapshot(updated);
  return updated;
}

export function removeProfile(slug, { deleteFiles = false } = {}) {
  const profiles = loadProfiles();
  const index = profiles.findIndex(p => p.slug === slug);
  if (index < 0) return;

  profiles.splice(index, 1);
  saveProfiles(profiles);
  recordEvent(slug, 'deleted', 'Perfil eliminado');

  if (deleteFiles) {
    const profileDir = getProfilePath(slug);
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }
}

export function recordProfileNote(slug, note) {
  const profiles = loadProfiles();
  const index = profiles.findIndex(p => p.slug === slug);
  if (index < 0) return;

  const updated = {
    ...profiles[index],
    notes: note,
    updated_at: nowIso()
  };

  profiles[index] = updated;
  saveProfiles(profiles);
  recordEvent(slug, 'note', note);
}

export function getProfileEvents(slug, { limit = 50 } = {}) {
  const events = loadEvents().filter(e => e.profile_slug === slug);
  const sorted = events.sort((a, b) => {
    const aDate = a.created_at || '';
    const bDate = b.created_at || '';
    return aDate < bDate ? 1 : aDate > bDate ? -1 : 0;
  });
  return sorted.slice(0, limit);
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
    DB_PATH: getProfilesFilePath(),
    STATUS: PROFILE_STATUS
  };
}
