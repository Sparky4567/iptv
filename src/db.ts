import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Channel, SavedPlaylist } from "./types";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, "iptv.sqlite");
export const db = new Database(dbPath);

// Enable WAL mode for high concurrency
db.run("PRAGMA journal_mode = WAL;");

// Initialize tables
db.run(`
  CREATE TABLE IF NOT EXISTS saved_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    group_title TEXT,
    logo TEXT,
    tvg_id TEXT,
    country TEXT,
    language TEXT,
    created_at INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS saved_playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    is_custom INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL
  )
`);

export function getAllSavedChannels(): Channel[] {
  const stmt = db.prepare("SELECT * FROM saved_channels ORDER BY created_at DESC");
  const rows = stmt.all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    group: r.group_title || undefined,
    logo: r.logo || undefined,
    tvgId: r.tvg_id || undefined,
    country: r.country || undefined,
    language: r.language || undefined,
  }));
}

export function saveChannel(channel: Partial<Channel> & { name: string; url: string }): Channel {
  const id = channel.id || `sqlite-ch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const createdAt = Date.now();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO saved_channels (id, name, url, group_title, logo, tvg_id, country, language, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    channel.name,
    channel.url,
    channel.group || null,
    channel.logo || null,
    channel.tvgId || null,
    channel.country || null,
    channel.language || null,
    createdAt
  );

  return {
    id,
    name: channel.name,
    url: channel.url,
    group: channel.group,
    logo: channel.logo,
    tvgId: channel.tvgId,
    country: channel.country,
    language: channel.language,
  };
}

export function deleteSavedChannel(id: string): boolean {
  const stmt = db.prepare("DELETE FROM saved_channels WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getAllSavedPlaylists(): SavedPlaylist[] {
  const stmt = db.prepare("SELECT * FROM saved_playlists ORDER BY created_at DESC");
  const rows = stmt.all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    dateAdded: r.created_at,
    isCustom: Boolean(r.is_custom),
  }));
}

export function savePlaylist(name: string, url: string): SavedPlaylist {
  const existingStmt = db.prepare("SELECT * FROM saved_playlists WHERE url = ?");
  const existing = existingStmt.get(url) as any;
  if (existing) {
    const updateStmt = db.prepare("UPDATE saved_playlists SET name = ? WHERE id = ?");
    updateStmt.run(name, existing.id);
    return {
      id: existing.id,
      name,
      url,
      dateAdded: existing.created_at,
      isCustom: Boolean(existing.is_custom),
    };
  }

  const id = `sqlite-pl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const createdAt = Date.now();
  const stmt = db.prepare(`
    INSERT INTO saved_playlists (id, name, url, is_custom, created_at)
    VALUES (?, ?, ?, 1, ?)
  `);
  stmt.run(id, name, url, createdAt);

  return {
    id,
    name,
    url,
    dateAdded: createdAt,
    isCustom: true,
  };
}

export function deleteSavedPlaylist(id: string): boolean {
  const stmt = db.prepare("DELETE FROM saved_playlists WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

export function exportSQLiteData() {
  const channels = getAllSavedChannels();
  const playlists = getAllSavedPlaylists();
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    channels,
    playlists,
  };
}

export function importSQLiteData(data: { channels?: any[]; playlists?: any[] }) {
  let channelsAdded = 0;
  let playlistsAdded = 0;

  if (Array.isArray(data.channels)) {
    for (const c of data.channels) {
      if (c.name && c.url) {
        saveChannel(c);
        channelsAdded++;
      }
    }
  }

  if (Array.isArray(data.playlists)) {
    for (const p of data.playlists) {
      if (p.url) {
        savePlaylist(p.name || "Imported Playlist", p.url);
        playlistsAdded++;
      }
    }
  }

  return { channelsAdded, playlistsAdded };
}
