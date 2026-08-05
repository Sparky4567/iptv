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
- **Fast HLS Playback**: Built with `hls.js` for smooth live video streaming.
- **Robust M3U Parser**: Supports channel groups, attributes (`tvg-logo`, `group-title`, `tvg-id`), and resilient fallback logic.
- **Persistent Storage**: Uses `immortal-db` to preserve user playlists and favorites across browser sessions.
- **Native Bun Server**: Uses `Bun.serve()` with HTML imports for zero-config bundling and minimal latency.

