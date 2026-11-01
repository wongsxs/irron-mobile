import * as SQLite from 'expo-sqlite';

let db = null;

export function getDatabase() {
  if (db) return db;
  try {
    db = SQLite.openDatabaseSync('irron_history.db');
    db.execSync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        image TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    `);
    return db;
  } catch (error) {
    console.error('Error opening SQLite database:', error);
    return null;
  }
}

// Mengambil semua sesi diurutkan dari yang paling baru
export function getAllSessions() {
  const database = getDatabase();
  if (!database) return [];
  try {
    return database.getAllSync('SELECT * FROM sessions ORDER BY updated_at DESC');
  } catch (err) {
    console.error('getAllSessions error:', err);
    return [];
  }
}

// Mencari sesi berdasarkan kata kunci
export function searchSessions(query) {
  const database = getDatabase();
  if (!database) return [];
  try {
    const pattern = `%${query}%`;
    return database.getAllSync(
      'SELECT * FROM sessions WHERE title LIKE ? ORDER BY updated_at DESC',
      [pattern]
    );
  } catch (err) {
    console.error('searchSessions error:', err);
    return [];
  }
}

// Membuat sesi percakapan baru
export function createNewSession(customTitle = null) {
  const database = getDatabase();
  const id = 'sess_' + Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7);
  const now = Date.now();
  const title = customTitle || 'Obrolan Baru';

  if (database) {
    try {
      database.runSync(
        'INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [id, title, now, now]
      );
    } catch (err) {
      console.error('createNewSession error:', err);
    }
  }

  return { id, title, created_at: now, updated_at: now };
}

// Update judul sesi
export function updateSessionTitle(sessionId, newTitle) {
  const database = getDatabase();
  if (!database) return;
  try {
    database.runSync(
      'UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?',
      [newTitle, Date.now(), sessionId]
    );
  } catch (err) {
    console.error('updateSessionTitle error:', err);
  }
}

// Hapus sesi beserta seluruh pesannya
export function deleteSession(sessionId) {
  const database = getDatabase();
  if (!database) return;
  try {
    database.runSync('DELETE FROM messages WHERE session_id = ?', [sessionId]);
    database.runSync('DELETE FROM sessions WHERE id = ?', [sessionId]);
  } catch (err) {
    console.error('deleteSession error:', err);
  }
}

// Hapus semua riwayat
export function clearAllHistory() {
  const database = getDatabase();
  if (!database) return;
  try {
    database.runSync('DELETE FROM messages');
    database.runSync('DELETE FROM sessions');
  } catch (err) {
    console.error('clearAllHistory error:', err);
  }
}

// Ambil semua pesan dalam satu sesi
export function getMessagesForSession(sessionId) {
  const database = getDatabase();
  if (!database) return [];
  try {
    return database.getAllSync(
      'SELECT id, role, text, image, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    );
  } catch (err) {
    console.error('getMessagesForSession error:', err);
    return [];
  }
}

// Simpan pesan ke sesi
export function saveMessage(sessionId, message) {
  const database = getDatabase();
  if (!database) return;
  try {
    const now = Date.now();
    database.runSync(
      'INSERT OR REPLACE INTO messages (id, session_id, role, text, image, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        message.id,
        sessionId,
        message.role,
        message.text || '',
        message.image || null,
        message.createdAt || now
      ]
    );

    database.runSync('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);
  } catch (err) {
    console.error('saveMessage error:', err);
  }
}
