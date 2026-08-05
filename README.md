# IPTV Web Player

A modern, high-performance IPTV web application powered by [Bun](https://bun.sh), featuring live M3U/M3U8 stream playback with HLS.js, an integrated CORS proxy server with M3U8 manifest rewriting, category filtering, and playlist management.

---

## 📋 Prerequisites

Ensure you have **Bun** (v1.0.0 or higher) installed on your system.

If you don't have Bun installed:

```bash
# macOS and Linux
curl -fsSL https://bun.sh/install | bash

# Windows (via PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

Verify the installation:

```bash
bun --version
```

---

## 📦 Installation

Clone the repository and install the dependencies using Bun:

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd iptv

# Install dependencies
bun install
```

---

## 🚀 Launching the App

### 1. Standard / Production Mode

To launch the IPTV application server:

```bash
bun start
# Or directly run
bun run index.ts
```

Once launched, open your web browser and navigate to:

👉 **[http://localhost:3000](http://localhost:3000)**

---

### 2. Development Mode (with Hot Module Reloading)

To launch in development mode with HMR enabled for auto-reloading on code changes:

```bash
bun dev
# Or directly run with --hot
bun --hot index.ts
```

---

### 3. Custom Port Configuration

By default, the server runs on port `3000`. You can launch the app on a custom port using the `PORT` environment variable:

```bash
# Launch on port 8080
PORT=8080 bun start

# Or in development mode
PORT=8080 bun dev
```

Then visit **`http://localhost:8080`** in your browser.

---

## 🧪 Running Tests

To run the unit tests (e.g. for the M3U parser):

```bash
bun test
```

---

## ⚙️ Features & Architecture Overview

- **Built-in HLS / M3U8 Proxy (`/api/proxy`)**: Solves CORS restrictions and rewrites relative manifest URLs dynamically for seamless stream loading.
- **Pause View Stream Timeline Overlay**: Interactive video timeline scrubber on pause with buffer retention for rewinding live streams and tracking missed broadcast time.
- **Native SQLite Storage (`bun:sqlite`)**: High-performance backend database with Write-Ahead Logging (WAL) for saving channels, playlists, and backup export/import.
- **Fast HLS Playback**: Built with `hls.js` for smooth live video streaming with audio track selection.
- **Robust M3U Parser**: Supports channel groups, attributes (`tvg-logo`, `group-title`, `tvg-id`), and resilient fallback logic.
- **Browser & Server Persistence**: Hybrid storage engine combining server-side SQLite DB (`data/iptv.sqlite`) with client-side `immortal-db` fallback.
- **Native Bun Server**: Powered by `Bun.serve()` with HTML imports for zero-config bundling and minimal latency.

---

## 💾 Native SQLite Storage Integration

The application features a server-side **SQLite database** using Bun's native `bun:sqlite` module, stored at `data/iptv.sqlite` with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) enabled for high-concurrency read/write operations.

### Key Capabilities
- **Saved Channels Database**: Save individual channel URLs directly to the SQLite database via card quick buttons (`💾`) or player controls. View all saved channels in the dedicated **💾 Saved Channels (SQLite)** sidebar category.
- **Saved Custom Playlists**: Save and manage custom M3U/M3U8 playlist URLs with server-side persistence.
- **Database Backup & Restore (JSON)**: Export the complete database contents (`channels` and `playlists`) to a formatted JSON file (`/api/storage/export`), or import previous backups (`/api/storage/import`).
- **Hybrid Storage Fallback**: Gracefully falls back to browser-level `immortal-db` (localStorage, IndexedDB, Cookies) if server API is unreachable.

### REST API Endpoints

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/api/storage/channels` | `GET` | Retrieve all saved channels from SQLite |
| `/api/storage/channels` | `POST` | Save or update a channel record in SQLite |
| `/api/storage/channels/:id` | `DELETE` | Delete a saved channel from SQLite |
| `/api/storage/playlists` | `GET` | Retrieve all saved custom playlists |
| `/api/storage/playlists` | `POST` | Save a new custom M3U playlist URL |
| `/api/storage/playlists/:id` | `DELETE` | Delete a saved custom playlist |
| `/api/storage/export` | `GET` | Export database backup file (`iptv_storage_backup.json`) |
| `/api/storage/import` | `POST` | Import channel and playlist records from JSON |

---

## ⏸️ Pause View Stream Timeline Overlay

When video playback is paused, an interactive **Stream Timeline Scrubber Overlay** automatically appears over the video container, enabling full timeshifting capabilities for live HLS streams.

### Key Features
- **Extended Buffer Retention**: `hls.js` retains up to 10 minutes (`backBufferLength: 600`) of video buffer, enabling stream rewinding and replay during live broadcasts.
- **Live Stream Missed Time Indicator**: Real-time status badge calculating exact offset from the live edge (e.g. `You missed -02:15 of live stream` vs `Watching LIVE`).
- **Timeline Scrubber Slider & Tooltip**: Dynamic timeline range showing buffer start offset (e.g. `-05:00`) and live edge (`00:00`), complete with active scrub hover tooltips.
- **Quick Scrub & Jump Controls**:
  - `⏪ 60s` / `◀ 15s` / `▶ 15s`: Jump backward/forward through buffered stream time.
  - `▶ Resume`: Resume playback from current scrubbed timestamp.
  - `🔴 LIVE`: Instantly seek back to the live edge and resume playback.
- **Keyboard Navigation Shortcuts**:
  - `Space`: Toggle Play / Pause (triggers Stream Timeline on pause)
  - `ArrowLeft` / `ArrowRight`: Seek backward / forward 10 seconds
  - `F`: Toggle Fullscreen mode
  - `M`: Toggle Mute audio


