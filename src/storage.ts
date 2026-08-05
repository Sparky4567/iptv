import { ImmortalDB } from "immortal-db";
import { Channel, SavedPlaylist } from "./types";

const KEYS = {
  SAVED_PLAYLISTS: "iptv_saved_playlists_v1",
  ACTIVE_PLAYLIST_URL: "iptv_active_playlist_url_v1",
  FAVORITES: "iptv_favorites_v1",
  RECENT_CHANNELS: "iptv_recent_channels_v1",
  LAST_PLAYED_CHANNEL: "iptv_last_played_channel_v1",
  SAVED_CHANNELS_LOCAL: "iptv_saved_channels_local_v1",
};

/**
 * ImmortalDB wrapper for persisting IPTV application state across browser reloads
 * and storage cleanups (ImmortalDB uses localStorage, IndexedDB, and Cookies).
 */

export async function getSavedPlaylists(): Promise<SavedPlaylist[]> {
  try {
    // Attempt SQLite server fetch first
    const res = await fetch("/api/storage/playlists");
    if (res.ok) {
      const sqlitePlaylists = await res.json();
      if (Array.isArray(sqlitePlaylists) && sqlitePlaylists.length > 0) {
        return sqlitePlaylists;
      }
    }
  } catch (err) {
    console.warn("SQLite fetch failed for playlists, falling back to ImmortalDB", err);
  }

  try {
    const val = await ImmortalDB.get(KEYS.SAVED_PLAYLISTS, "[]");
    return JSON.parse(val || "[]");
  } catch (err) {
    console.warn("Failed to get saved playlists from ImmortalDB:", err);
    return [];
  }
}

export async function savePlaylistUrl(name: string, url: string): Promise<SavedPlaylist> {
  let savedPlaylist: SavedPlaylist | null = null;

  try {
    const res = await fetch("/api/storage/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url }),
    });
    if (res.ok) {
      savedPlaylist = await res.json();
    }
  } catch (err) {
    console.warn("Failed to save playlist to SQLite server DB:", err);
  }

  // Also sync to ImmortalDB
  const playlists = await getSavedPlaylists();
  const existing = playlists.find((p) => p.url === url);
  if (existing) {
    existing.name = name;
    await ImmortalDB.set(KEYS.SAVED_PLAYLISTS, JSON.stringify(playlists));
    return savedPlaylist || existing;
  }

  const newPlaylist: SavedPlaylist = savedPlaylist || {
    id: `pl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: name.trim() || "Custom Playlist",
    url: url.trim(),
    dateAdded: Date.now(),
    isCustom: true,
  };

  playlists.unshift(newPlaylist);
  await ImmortalDB.set(KEYS.SAVED_PLAYLISTS, JSON.stringify(playlists));
  return newPlaylist;
}

export async function removeSavedPlaylist(id: string): Promise<void> {
  try {
    await fetch(`/api/storage/playlists/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (err) {
    console.warn("Failed to delete playlist from SQLite server DB:", err);
  }

  const playlists = await getSavedPlaylists();
  const updated = playlists.filter((p) => p.id !== id);
  await ImmortalDB.set(KEYS.SAVED_PLAYLISTS, JSON.stringify(updated));
}

/**
 * SQLite Channel Storage Mechanisms
 */
export async function getSavedChannelsFromSQLite(): Promise<Channel[]> {
  try {
    const res = await fetch("/api/storage/channels");
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Failed to fetch saved channels from SQLite:", err);
  }

  try {
    const localVal = await ImmortalDB.get(KEYS.SAVED_CHANNELS_LOCAL, "[]");
    return JSON.parse(localVal || "[]");
  } catch (err) {
    return [];
  }
}

export async function saveChannelUrlToSQLite(channel: Channel): Promise<Channel> {
  let saved: Channel | null = null;
  let serverError: string | null = null;

  try {
    const res = await fetch("/api/storage/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(channel),
    });
    if (res.ok) {
      saved = await res.json();
    } else {
      const errData = await res.json().catch(() => ({}));
      serverError = errData.error || `HTTP ${res.status}`;
    }
  } catch (err: any) {
    console.warn("Failed to save channel URL to SQLite server:", err);
    serverError = err.message || "Network error";
  }

  try {
    const localSaved = await getSavedChannelsFromSQLite();
    const channelToSave = saved || channel;
    const exists = localSaved.find((c) => c.url === channel.url || c.id === channel.id);

    if (!exists) {
      localSaved.unshift(channelToSave);
      await ImmortalDB.set(KEYS.SAVED_CHANNELS_LOCAL, JSON.stringify(localSaved));
    }
    return channelToSave;
  } catch (localErr: any) {
    if (serverError && !saved) {
      throw new Error(serverError);
    }
    return saved || channel;
  }
}

export async function removeSavedChannelFromSQLite(idOrUrl: string): Promise<void> {
  try {
    await fetch(`/api/storage/channels/${encodeURIComponent(idOrUrl)}`, { method: "DELETE" });
  } catch (err) {
    console.warn("Failed to remove channel from SQLite server:", err);
  }

  const localSaved = await getSavedChannelsFromSQLite();
  const updated = localSaved.filter((c) => c.id !== idOrUrl && c.url !== idOrUrl);
  await ImmortalDB.set(KEYS.SAVED_CHANNELS_LOCAL, JSON.stringify(updated));
}

/**
 * Local File Storage Mechanisms (Export & Import)
 */
export async function exportLocalFileStorage(): Promise<void> {
  try {
    const res = await fetch("/api/storage/export");
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `iptv_channels_playlists_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
  } catch (err) {
    console.warn("Export from SQLite API failed, exporting local fallback...", err);
  }

  // Fallback local export
  const channels = await getSavedChannelsFromSQLite();
  const playlists = await getSavedPlaylists();
  const backupData = {
    exportedAt: new Date().toISOString(),
    version: 1,
    channels,
    playlists,
  };

  const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `iptv_channels_playlists_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importLocalFileStorage(jsonContent: string): Promise<{ channelsAdded: number; playlistsAdded: number }> {
  try {
    const res = await fetch("/api/storage/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonContent,
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Import to SQLite server API failed, storing locally...", err);
  }

  const parsed = JSON.parse(jsonContent);
  let channelsAdded = 0;
  let playlistsAdded = 0;

  if (Array.isArray(parsed.channels)) {
    for (const ch of parsed.channels) {
      if (ch.name && ch.url) {
        await saveChannelUrlToSQLite(ch);
        channelsAdded++;
      }
    }
  }

  if (Array.isArray(parsed.playlists)) {
    for (const pl of parsed.playlists) {
      if (pl.url) {
        await savePlaylistUrl(pl.name || "Imported Playlist", pl.url);
        playlistsAdded++;
      }
    }
  }

  return { channelsAdded, playlistsAdded };
}

export async function getActivePlaylistUrl(): Promise<string | null> {
  try {
    const val = await ImmortalDB.get(KEYS.ACTIVE_PLAYLIST_URL, null);
    return val || null;
  } catch (err) {
    return null;
  }
}

export async function setActivePlaylistUrl(url: string): Promise<void> {
  try {
    await ImmortalDB.set(KEYS.ACTIVE_PLAYLIST_URL, url);
  } catch (err) {
    console.warn("Failed to set active playlist URL in ImmortalDB:", err);
  }
}

export async function getFavorites(): Promise<string[]> {
  try {
    const val = await ImmortalDB.get(KEYS.FAVORITES, "[]");
    return JSON.parse(val || "[]");
  } catch (err) {
    return [];
  }
}

export async function toggleFavoriteId(id: string): Promise<boolean> {
  const favorites = await getFavorites();
  const index = favorites.indexOf(id);
  let isFav = false;

  if (index !== -1) {
    favorites.splice(index, 1);
    isFav = false;
  } else {
    favorites.push(id);
    isFav = true;
  }

  await ImmortalDB.set(KEYS.FAVORITES, JSON.stringify(favorites));
  return isFav;
}

export async function getRecentChannelIds(): Promise<string[]> {
  try {
    const val = await ImmortalDB.get(KEYS.RECENT_CHANNELS, "[]");
    return JSON.parse(val || "[]");
  } catch (err) {
    return [];
  }
}

export async function addRecentChannelId(id: string): Promise<void> {
  const recents = await getRecentChannelIds();
  const updated = [id, ...recents.filter((item) => item !== id)].slice(0, 20);
  await ImmortalDB.set(KEYS.RECENT_CHANNELS, JSON.stringify(updated));
}

export async function getLastPlayedChannelId(): Promise<string | null> {
  try {
    const val = await ImmortalDB.get(KEYS.LAST_PLAYED_CHANNEL, null);
    return val || null;
  } catch (err) {
    return null;
  }
}

export async function setLastPlayedChannelId(id: string): Promise<void> {
  try {
    await ImmortalDB.set(KEYS.LAST_PLAYED_CHANNEL, id);
  } catch (err) {
    console.warn("Failed to set last played channel ID in ImmortalDB:", err);
  }
}

