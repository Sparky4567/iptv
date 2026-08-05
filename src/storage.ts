import { ImmortalDB } from "immortal-db";
import { SavedPlaylist } from "./types";

const KEYS = {
  SAVED_PLAYLISTS: "iptv_saved_playlists_v1",
  ACTIVE_PLAYLIST_URL: "iptv_active_playlist_url_v1",
  FAVORITES: "iptv_favorites_v1",
  RECENT_CHANNELS: "iptv_recent_channels_v1",
  LAST_PLAYED_CHANNEL: "iptv_last_played_channel_v1",
};

/**
 * ImmortalDB wrapper for persisting IPTV application state across browser reloads
 * and storage cleanups (ImmortalDB uses localStorage, IndexedDB, and Cookies).
 */

export async function getSavedPlaylists(): Promise<SavedPlaylist[]> {
  try {
    const val = await ImmortalDB.get(KEYS.SAVED_PLAYLISTS, "[]");
    return JSON.parse(val || "[]");
  } catch (err) {
    console.warn("Failed to get saved playlists from ImmortalDB:", err);
    return [];
  }
}

export async function savePlaylistUrl(name: string, url: string): Promise<SavedPlaylist> {
  const playlists = await getSavedPlaylists();
  
  // Check if already exists
  const existing = playlists.find((p) => p.url === url);
  if (existing) {
    existing.name = name;
    await ImmortalDB.set(KEYS.SAVED_PLAYLISTS, JSON.stringify(playlists));
    return existing;
  }

  const newPlaylist: SavedPlaylist = {
    id: `pl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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
  const playlists = await getSavedPlaylists();
  const updated = playlists.filter((p) => p.id !== id);
  await ImmortalDB.set(KEYS.SAVED_PLAYLISTS, JSON.stringify(updated));
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
