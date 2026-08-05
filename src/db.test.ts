import { test, expect, describe } from "bun:test";
import {
  getAllSavedChannels,
  saveChannel,
  deleteSavedChannel,
  getAllSavedPlaylists,
  savePlaylist,
  deleteSavedPlaylist,
  exportSQLiteData,
  importSQLiteData,
} from "./db";

describe("SQLite Storage Test Suite", () => {
  test("should save and retrieve channel URLs in SQLite database", () => {
    const testChannel = {
      id: "test-ch-1",
      name: "Test News Channel",
      url: "https://example.com/live/news.m3u8",
      group: "News",
      logo: "https://example.com/logo.png",
    };

    const saved = saveChannel(testChannel);
    expect(saved.id).toBe("test-ch-1");
    expect(saved.name).toBe("Test News Channel");
    expect(saved.url).toBe("https://example.com/live/news.m3u8");

    const channels = getAllSavedChannels();
    const match = channels.find((c) => c.id === "test-ch-1");
    expect(match).toBeDefined();
    expect(match?.name).toBe("Test News Channel");

    // Clean up
    deleteSavedChannel("test-ch-1");
    const updatedChannels = getAllSavedChannels();
    expect(updatedChannels.find((c) => c.id === "test-ch-1")).toBeUndefined();
  });

  test("should delete saved channels by ID or URL", () => {
    const ch1 = saveChannel({ name: "Channel By ID", url: "https://example.com/ch1.m3u8" });
    const ch2 = saveChannel({ name: "Channel By URL", url: "https://example.com/ch2.m3u8" });

    expect(getAllSavedChannels().some((c) => c.id === ch1.id)).toBe(true);
    expect(getAllSavedChannels().some((c) => c.url === ch2.url)).toBe(true);

    // Delete first channel by ID
    const del1 = deleteSavedChannel(ch1.id);
    expect(del1).toBe(true);
    expect(getAllSavedChannels().some((c) => c.id === ch1.id)).toBe(false);

    // Delete second channel by URL
    const del2 = deleteSavedChannel(ch2.url);
    expect(del2).toBe(true);
    expect(getAllSavedChannels().some((c) => c.url === ch2.url)).toBe(false);
  });

  test("should save, retrieve and delete playlist URLs in SQLite database", () => {
    const pl = savePlaylist("My Sports Playlist", "https://example.com/sports.m3u");
    expect(pl.name).toBe("My Sports Playlist");
    expect(pl.url).toBe("https://example.com/sports.m3u");

    const playlists = getAllSavedPlaylists();
    const match = playlists.find((p) => p.id === pl.id);
    expect(match).toBeDefined();

    deleteSavedPlaylist(pl.id);
    const updatedPlaylists = getAllSavedPlaylists();
    expect(updatedPlaylists.find((p) => p.id === pl.id)).toBeUndefined();
  });

  test("should export and import data correctly", () => {
    saveChannel({ id: "exp-1", name: "Export Channel", url: "https://exp.com/ch.m3u8" });
    savePlaylist("Export Playlist", "https://exp.com/pl.m3u");

    const exported = exportSQLiteData();
    expect(exported.channels.length).toBeGreaterThan(0);
    expect(exported.playlists.length).toBeGreaterThan(0);

    const importRes = importSQLiteData({
      channels: [{ name: "Imported Channel", url: "https://imp.com/ch.m3u8" }],
      playlists: [{ name: "Imported Playlist", url: "https://imp.com/pl.m3u" }],
    });

    expect(importRes.channelsAdded).toBe(1);
    expect(importRes.playlistsAdded).toBe(1);

    // Clean up test channel & playlist
    deleteSavedChannel("exp-1");
  });
});
