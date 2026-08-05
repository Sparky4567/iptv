import Hls from "hls.js";
import { parseM3U, isValidLogo } from "./m3u-parser";
import { PRESET_PLAYLISTS } from "./presets";
import {
  getSavedPlaylists,
  savePlaylistUrl,
  removeSavedPlaylist,
  getActivePlaylistUrl,
  setActivePlaylistUrl,
  getFavorites,
  toggleFavoriteId,
  addRecentChannelId,
  getLastPlayedChannelId,
  setLastPlayedChannelId,
  getSavedChannelsFromSQLite,
  saveChannelUrlToSQLite,
  removeSavedChannelFromSQLite,
  exportLocalFileStorage,
  importLocalFileStorage,
} from "./storage";
import { Channel, SavedPlaylist } from "./types";

// State
let allChannels: Channel[] = [];
let filteredChannels: Channel[] = [];
let sqliteSavedChannels: Channel[] = [];
let activeChannel: Channel | null = null;
let activeCategory = "ALL";
let searchQuery = "";
let favoritesSet = new Set<string>();
let hlsInstance: Hls | null = null;
let currentPlaylistName = "Global News (IPTV-org)";
let currentPlaylistUrl = PRESET_PLAYLISTS[0].url;
const BATCH_SIZE = 80;
let currentlyRenderedCount = BATCH_SIZE;
let timelineInterval: any = null;

// DOM Elements
const videoElement = document.getElementById("video-player") as HTMLVideoElement;
const channelListEl = document.getElementById("channel-list") as HTMLDivElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const clearSearchBtn = document.getElementById("clear-search") as HTMLButtonElement;
const categoryTreeEl = document.getElementById("category-tree") as HTMLDivElement;
const channelCountLabel = document.getElementById("channel-count-label") as HTMLSpanElement;
const activeGroupLabel = document.getElementById("active-group-label") as HTMLSpanElement;
const sqliteChannelsCountBadge = document.getElementById("sqlite-channels-count") as HTMLSpanElement;

// Header Controls & Modal
const currentPlaylistBtn = document.getElementById("current-playlist-btn") as HTMLButtonElement;
const currentPlaylistLabel = document.getElementById("current-playlist-label") as HTMLSpanElement;
const addUrlBtn = document.getElementById("add-url-btn") as HTMLButtonElement;
const playlistModal = document.getElementById("playlist-modal") as HTMLDivElement;
const closeModalBtn = document.getElementById("close-modal-btn") as HTMLButtonElement;
const addM3uForm = document.getElementById("add-m3u-form") as HTMLFormElement;
const m3uNameInput = document.getElementById("m3u-name-input") as HTMLInputElement;
const m3uUrlInput = document.getElementById("m3u-url-input") as HTMLInputElement;
const savedPlaylistsList = document.getElementById("saved-playlists-list") as HTMLDivElement;
const savedChannelsSqliteList = document.getElementById("saved-channels-sqlite-list") as HTMLDivElement;
const presetPlaylistsList = document.getElementById("preset-playlists-list") as HTMLDivElement;
const exportStorageBtn = document.getElementById("export-storage-btn") as HTMLButtonElement;
const importStorageFileInput = document.getElementById("import-storage-file") as HTMLInputElement;
const toastContainer = document.getElementById("toast-container") as HTMLDivElement;

// Overlay & Player Controls
const overlayTitle = document.getElementById("overlay-title") as HTMLDivElement;
const overlayCategory = document.getElementById("overlay-category") as HTMLDivElement;
const overlayLogo = document.getElementById("overlay-logo") as HTMLImageElement;
const playPauseBtn = document.getElementById("play-pause-btn") as HTMLButtonElement;
const playIcon = document.getElementById("play-icon") as SVGElement;
const pauseIcon = document.getElementById("pause-icon") as SVGElement;
const prevChannelBtn = document.getElementById("prev-channel-btn") as HTMLButtonElement;
const nextChannelBtn = document.getElementById("next-channel-btn") as HTMLButtonElement;
const muteBtn = document.getElementById("mute-btn") as HTMLButtonElement;
const volumeHighIcon = document.getElementById("volume-high-icon") as SVGElement;
const volumeMuteIcon = document.getElementById("volume-mute-icon") as SVGElement;
const volumeSlider = document.getElementById("volume-slider") as HTMLInputElement;
const saveSqliteBtn = document.getElementById("save-sqlite-btn") as HTMLButtonElement;
const favToggleBtn = document.getElementById("fav-toggle-btn") as HTMLButtonElement;
const favIcon = document.getElementById("fav-icon") as SVGElement;
const fullscreenBtn = document.getElementById("fullscreen-btn") as HTMLButtonElement;
const videoContainer = document.getElementById("video-container") as HTMLDivElement;

// Stream Timeline Overlay Elements (Shown on Pause)
const streamTimelineContainer = document.getElementById("stream-timeline-container") as HTMLDivElement;
const streamTimelineSlider = document.getElementById("stream-timeline-slider") as HTMLInputElement;
const timelineTooltip = document.getElementById("timeline-tooltip") as HTMLDivElement;
const timelineBufferedFill = document.getElementById("timeline-buffered-fill") as HTMLDivElement;
const timelineStartTime = document.getElementById("timeline-start-time") as HTMLSpanElement;
const timelineEndTime = document.getElementById("timeline-end-time") as HTMLSpanElement;
const timelineMissedBadge = document.getElementById("timeline-missed-badge") as HTMLSpanElement;
const timelineResumeBtn = document.getElementById("timeline-resume-btn") as HTMLButtonElement;
const timelineLiveBtn = document.getElementById("timeline-live-btn") as HTMLButtonElement;
const skipBack60Btn = document.getElementById("skip-back-60-btn") as HTMLButtonElement;
const skipBack15Btn = document.getElementById("skip-back-15-btn") as HTMLButtonElement;
const skipForward15Btn = document.getElementById("skip-forward-15-btn") as HTMLButtonElement;

// Language / Audio Track Controls
const langBtn = document.getElementById("lang-btn") as HTMLButtonElement;
const langDropdown = document.getElementById("lang-dropdown") as HTMLDivElement;
const langOptionsList = document.getElementById("lang-options-list") as HTMLDivElement;

// Mobile Navigation & Responsive Sidebar Controls
const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn") as HTMLButtonElement;
const closeSidebarBtn = document.getElementById("close-sidebar-btn") as HTMLButtonElement;
const sidebarBackdrop = document.getElementById("sidebar-backdrop") as HTMLDivElement;
const sidebarEl = document.getElementById("sidebar") as HTMLElement;
const mobileTabCategories = document.getElementById("mobile-tab-categories") as HTMLButtonElement;
const mobileTabChannels = document.getElementById("mobile-tab-channels") as HTMLButtonElement;
const categorySidebarEl = document.getElementById("category-sidebar") as HTMLDivElement;
const channelPanelEl = document.querySelector(".channel-panel") as HTMLDivElement;

function openSidebar() {
  sidebarEl?.classList.add("open");
  sidebarBackdrop?.classList.add("active");
}

function closeSidebar() {
  sidebarEl?.classList.remove("open");
  sidebarBackdrop?.classList.remove("active");
}

/**
 * Enhanced Toast Notification Helper with explicit type toasts
 */
let lastToastMessage = "";
let lastToastTime = 0;

function showToast(message: string, duration = 3500, type: "info" | "success" | "error" | "warning" = "info") {
  if (!toastContainer) return;
  const now = Date.now();
  if (message === lastToastMessage && now - lastToastTime < 3000) {
    return;
  }
  lastToastMessage = message;
  lastToastTime = now;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Safe video play handler to prevent AbortError interrupts
 */
async function safePlay(): Promise<boolean> {
  try {
    await videoElement.play();
    updatePlayPauseIcons(true);
    return true;
  } catch (err: any) {
    if (err.name === "AbortError") {
      // Normal when playback request was interrupted by pause or source change
    } else if (err.name === "NotAllowedError") {
      showToast("⚠️ Autoplay blocked by browser. Click play to watch.", 4000, "warning");
    } else {
      console.warn("Playback error:", err);
    }
    updatePlayPauseIcons(false);
    return false;
  }
}

/**
 * Safe video pause handler
 */
function safePause() {
  try {
    videoElement.pause();
    updatePlayPauseIcons(false);
  } catch (err) {
    console.warn("Pause error:", err);
  }
}

/**
 * Format seconds into HH:MM:SS or MM:SS
 */
function formatSeconds(secs: number): string {
  if (isNaN(secs) || secs < 0) return "00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Get Seekable Buffer Range for Stream Timeline
 */
function getBufferRange() {
  let start = 0;
  let end = videoElement.duration || 0;

  if (videoElement.seekable && videoElement.seekable.length > 0) {
    start = videoElement.seekable.start(0);
    end = videoElement.seekable.end(videoElement.seekable.length - 1);
  } else if (videoElement.buffered && videoElement.buffered.length > 0) {
    start = videoElement.buffered.start(0);
    end = videoElement.buffered.end(videoElement.buffered.length - 1);
  }

  const current = videoElement.currentTime;
  return { start, end, current };
}

/**
 * Dynamic Stream Timeline Scrubber Update (Runs when Paused)
 */
function updateStreamTimeline() {
  if (!videoElement) return;

  const { start, end, current } = getBufferRange();
  const rangeLength = Math.max(0.1, end - start);
  const percent = Math.min(100, Math.max(0, ((current - start) / rangeLength) * 100));

  if (streamTimelineSlider) streamTimelineSlider.value = percent.toString();
  if (timelineBufferedFill) timelineBufferedFill.style.width = `${percent}%`;

  const missedSeconds = Math.max(0, end - current);
  if (missedSeconds > 2) {
    const formattedMissed = formatSeconds(missedSeconds);
    if (timelineMissedBadge) {
      timelineMissedBadge.textContent = `You missed -${formattedMissed} of live stream`;
      timelineMissedBadge.style.background = "rgba(245, 158, 11, 0.25)";
      timelineMissedBadge.style.color = "var(--accent-amber)";
    }
  } else {
    if (timelineMissedBadge) {
      timelineMissedBadge.textContent = "Watching LIVE";
      timelineMissedBadge.style.background = "rgba(16, 185, 129, 0.25)";
      timelineMissedBadge.style.color = "var(--accent-emerald)";
    }
  }

  const startOffsetSeconds = Math.max(0, end - start);
  if (timelineStartTime) timelineStartTime.textContent = `Buffer Start (-${formatSeconds(startOffsetSeconds)})`;
  if (timelineEndTime) timelineEndTime.textContent = `LIVE Edge (00:00)`;
}

/**
 * Load SQLite Saved Channels into State
 */
async function loadSQLiteSavedChannels() {
  sqliteSavedChannels = await getSavedChannelsFromSQLite();
  if (sqliteChannelsCountBadge) {
    sqliteChannelsCountBadge.textContent = sqliteSavedChannels.length.toString();
  }
}

function isChannelSavedInSQLite(channel: Channel): Channel | undefined {
  return sqliteSavedChannels.find((s) => s.id === channel.id || s.url === channel.url);
}

function updatePlayerSaveBtnState() {
  if (!saveSqliteBtn) return;
  if (!activeChannel) {
    saveSqliteBtn.classList.remove("is-saved");
    saveSqliteBtn.title = "Save Channel URL to SQLite Database";
    return;
  }
  const savedMatch = isChannelSavedInSQLite(activeChannel);
  if (savedMatch) {
    saveSqliteBtn.classList.add("is-saved");
    saveSqliteBtn.title = "Remove Channel from SQLite Database";
  } else {
    saveSqliteBtn.classList.remove("is-saved");
    saveSqliteBtn.title = "Save Channel URL to SQLite Database";
  }
}

/**
 * Initialize App
 */
async function initApp() {
  // Load Favorites & SQLite Channels
  const favs = await getFavorites();
  favoritesSet = new Set(favs);
  await loadSQLiteSavedChannels();

  // Check last active playlist
  const savedUrl = await getActivePlaylistUrl();
  if (savedUrl) {
    currentPlaylistUrl = savedUrl;
    const presetMatch = PRESET_PLAYLISTS.find((p) => p.url === savedUrl);
    if (presetMatch) {
      currentPlaylistName = presetMatch.name;
    } else {
      const savedList = await getSavedPlaylists();
      const savedMatch = savedList.find((p) => p.url === savedUrl);
      currentPlaylistName = savedMatch ? savedMatch.name : "Custom Playlist";
    }
  }

  currentPlaylistLabel.textContent = currentPlaylistName;

  // Render modal lists
  await renderModalLists();

  // Load Playlist
  await loadPlaylist(currentPlaylistUrl);

  // Event Listeners
  setupEventListeners();
}

/**
 * Fetch and Load M3U Playlist
 */
async function loadPlaylist(url: string) {
  channelListEl.innerHTML = `
    <div class="empty-channels">
      <div class="spinner"></div>
      <p>Fetching channels from playlist...</p>
    </div>
  `;
  channelCountLabel.textContent = "Loading...";

  let m3uText = "";
  try {
    const directRes = await fetch(url);
    if (!directRes.ok) throw new Error(`HTTP ${directRes.status}`);
    m3uText = await directRes.text();
  } catch (err) {
    console.warn("Direct M3U fetch failed or blocked by CORS. Using Bun server proxy...", err);
    try {
      const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!proxyRes.ok) {
        let errMsg = `Proxy error: ${proxyRes.status}`;
        try {
          const json = await proxyRes.json();
          if (json && json.error) {
            errMsg = json.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }
      m3uText = await proxyRes.text();
    } catch (proxyErr: any) {
      showToast(`❌ Error loading playlist: ${proxyErr.message}`, 4000, "error");
      channelListEl.innerHTML = `
        <div class="empty-channels">
          <p style="color: var(--accent-rose)">Failed to fetch playlist.</p>
          <button class="btn-primary" style="margin-top: 10px;" id="retry-fetch-btn">Retry</button>
        </div>
      `;
      document.getElementById("retry-fetch-btn")?.addEventListener("click", () => loadPlaylist(url));
      return;
    }
  }

  // Parse Channels
  allChannels = parseM3U(m3uText);

  allChannels.forEach((c) => {
    c.favorite = favoritesSet.has(c.id);
  });

  if (allChannels.length === 0) {
    channelListEl.innerHTML = `
      <div class="empty-channels">
        <p>No valid channels found in playlist.</p>
      </div>
    `;
    channelCountLabel.textContent = "0 channels";
    return;
  }

  await setActivePlaylistUrl(url);
  renderCategoryTabs();
  applyFilters();

  const lastChannelId = await getLastPlayedChannelId();
  let channelToPlay = filteredChannels[0];
  if (lastChannelId) {
    const savedMatch = allChannels.find((c) => c.id === lastChannelId || c.url === lastChannelId);
    if (savedMatch) {
      channelToPlay = savedMatch;
    }
  }

  if (channelToPlay) {
    playChannel(channelToPlay);
  }

  showToast(`Loaded ${allChannels.length} channels`, 3000, "info");
}

/**
 * Render Category Navigation Tree
 */
function renderCategoryTabs() {
  if (!categoryTreeEl) return;

  const groupsMap = new Map<string, number>();
  allChannels.forEach((c) => {
    const rawGroup = c.group ? c.group.split(";")[0].trim() : "";
    const groupName = rawGroup && rawGroup.toLowerCase() !== "undefined" && rawGroup.toLowerCase() !== "null" ? rawGroup : "General";
    groupsMap.set(groupName, (groupsMap.get(groupName) || 0) + 1);
  });

  const sortedGroups = Array.from(groupsMap.entries()).sort((a, b) => b[1] - a[1]);

  let html = `
    <div class="category-tree-item ${activeCategory === "ALL" ? "active" : ""}" data-category="ALL" title="All Channels">
      <span>🌐 All Channels</span>
      <span class="category-count-badge">${allChannels.length}</span>
    </div>
    <div class="category-tree-item ${activeCategory === "FAVORITES" ? "active" : ""}" data-category="FAVORITES" title="Favorites">
      <span>★ Favorites</span>
      <span class="category-count-badge">${favoritesSet.size}</span>
    </div>
    <div class="category-tree-item ${activeCategory === "SQLITE_SAVED" ? "active" : ""}" data-category="SQLITE_SAVED" title="Saved Channels (SQLite DB)">
      <span>💾 Saved Channels (SQLite)</span>
      <span class="category-count-badge" id="sqlite-channels-count">${sqliteSavedChannels.length}</span>
    </div>
  `;

  sortedGroups.forEach(([groupName, count]) => {
    const isSelected = activeCategory === groupName;
    let icon = "📺";
    const lower = groupName.toLowerCase();
    if (lower.includes("news")) icon = "📰";
    else if (lower.includes("sport")) icon = "⚽";
    else if (lower.includes("movie") || lower.includes("cinema")) icon = "🎬";
    else if (lower.includes("music") || lower.includes("radio")) icon = "🎵";
    else if (lower.includes("anim") || lower.includes("kid") || lower.includes("cartoon")) icon = "🎨";
    else if (lower.includes("doc")) icon = "📜";
    else if (lower.includes("info")) icon = "💡";

    html += `
      <div class="category-tree-item ${isSelected ? "active" : ""}" data-category="${groupName}" title="${groupName}">
        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${icon} ${groupName}</span>
        <span class="category-count-badge">${count}</span>
      </div>
    `;
  });

  categoryTreeEl.innerHTML = html;

  const items = categoryTreeEl.querySelectorAll(".category-tree-item");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      items.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      activeCategory = item.getAttribute("data-category") || "ALL";
      activeGroupLabel.textContent = `Category: ${activeCategory === "SQLITE_SAVED" ? "SQLite Saved" : activeCategory}`;
      applyFilters();
      if (window.innerWidth <= 640 && mobileTabChannels) {
        mobileTabChannels.click();
      }
    });
  });
}

/**
 * Filter Channels by Category and Search Query
 */
function applyFilters() {
  const query = searchQuery.trim().toLowerCase();
  const sourceList = activeCategory === "SQLITE_SAVED" ? sqliteSavedChannels : allChannels;

  filteredChannels = sourceList.filter((c) => {
    let categoryMatch = true;
    if (activeCategory === "FAVORITES") {
      categoryMatch = favoritesSet.has(c.id);
    } else if (activeCategory === "SQLITE_SAVED") {
      categoryMatch = true;
    } else if (activeCategory !== "ALL") {
      const primaryGroup = (c.group || "General").split(";")[0].trim();
      categoryMatch = primaryGroup === activeCategory || (c.group || "").includes(activeCategory);
    }

    if (!categoryMatch) return false;

    if (query) {
      const nameMatch = c.name.toLowerCase().includes(query);
      const groupMatch = (c.group || "").toLowerCase().includes(query);
      const tvgMatch = (c.tvgId || "").toLowerCase().includes(query);
      return nameMatch || groupMatch || tvgMatch;
    }

    return true;
  });

  currentlyRenderedCount = BATCH_SIZE;
  channelCountLabel.textContent = `${filteredChannels.length} of ${sourceList.length} channels`;
  renderChannelList();
}

/**
 * Render Channel List in Sidebar
 */
function renderChannelList() {
  channelListEl.scrollTop = 0;
  channelListEl.innerHTML = "";

  if (filteredChannels.length === 0) {
    channelListEl.innerHTML = `
      <div class="empty-channels">
        <p>No matching channels found.</p>
      </div>
    `;
    return;
  }

  const itemsToRender = filteredChannels.slice(0, currentlyRenderedCount);
  const fragment = document.createDocumentFragment();

  itemsToRender.forEach((channel) => {
    fragment.appendChild(createChannelElement(channel));
  });

  channelListEl.appendChild(fragment);
  updateScrollIndicator();
}

/**
 * Append next batch of channels on scroll
 */
function appendMoreChannels() {
  if (currentlyRenderedCount >= filteredChannels.length) return;

  const nextBatch = filteredChannels.slice(currentlyRenderedCount, currentlyRenderedCount + BATCH_SIZE);
  currentlyRenderedCount += BATCH_SIZE;

  const oldIndicator = channelListEl.querySelector(".load-more-indicator");
  if (oldIndicator) oldIndicator.remove();

  const fragment = document.createDocumentFragment();
  nextBatch.forEach((channel) => {
    fragment.appendChild(createChannelElement(channel));
  });

  channelListEl.appendChild(fragment);
  updateScrollIndicator();
}

function updateScrollIndicator() {
  const oldIndicator = channelListEl.querySelector(".load-more-indicator");
  if (oldIndicator) oldIndicator.remove();

  if (currentlyRenderedCount < filteredChannels.length) {
    const indicator = document.createElement("div");
    indicator.className = "load-more-indicator";
    indicator.style.cssText = "padding: 12px; text-align: center; font-size: 0.78rem; color: var(--text-muted); font-weight: 500;";
    indicator.textContent = `Showing ${Math.min(currentlyRenderedCount, filteredChannels.length)} of ${filteredChannels.length} channels (Scroll for more)`;
    channelListEl.appendChild(indicator);
  }
}

/**
 * Create a single channel DOM item
 */
function createChannelElement(channel: Channel): HTMLElement {
  const item = document.createElement("div");
  item.className = `channel-item ${activeChannel?.id === channel.id ? "active" : ""}`;
  item.setAttribute("data-channel-id", channel.id);

  const isFav = favoritesSet.has(channel.id);
  const initial = channel.name ? channel.name.trim().charAt(0).toUpperCase() : "?";

  const hasLogo = isValidLogo(channel.logo);
  const logoHtml = hasLogo
    ? `<img class="channel-logo-img" src="${channel.logo}" alt="${channel.name}" loading="lazy" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='block';">
       <span class="channel-logo-fallback" style="display:none;">${initial}</span>`
    : `<span class="channel-logo-fallback">${initial}</span>`;

  const groupText = channel.group && channel.group.toLowerCase() !== "undefined" && channel.group.toLowerCase() !== "null" ? channel.group : "";
  const groupHtml = groupText ? `<div class="channel-group">${groupText}</div>` : "";

  const savedMatch = isChannelSavedInSQLite(channel);
  const isSavedSqlite = Boolean(savedMatch);

  item.innerHTML = `
    <div class="channel-logo-container">${logoHtml}</div>
    <div class="channel-info">
      <div class="channel-name" title="${channel.name}">${channel.name}</div>
      ${groupHtml}
    </div>
    <div style="display: flex; gap: 4px; align-items: center;">
      <button class="save-ch-sqlite-btn ${isSavedSqlite ? "is-saved" : ""}" title="${isSavedSqlite ? "Remove from Saved Channels (SQLite)" : "Save channel URL to SQLite database"}" data-sqlite-id="${channel.id}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
        </svg>
      </button>
      <button class="fav-btn ${isFav ? "is-fav" : ""}" title="${isFav ? "Remove from Favorites" : "Add to Favorites"}" data-fav-id="${channel.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </button>
    </div>
  `;

  item.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".fav-btn") || target.closest(".save-ch-sqlite-btn")) return;
    playChannel(channel);
  });

  // Save / Delete SQLite Button on Channel Card
  const saveSqliteCardBtn = item.querySelector(".save-ch-sqlite-btn") as HTMLButtonElement;
  saveSqliteCardBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const currentSavedMatch = isChannelSavedInSQLite(channel);
    if (currentSavedMatch) {
      try {
        await removeSavedChannelFromSQLite(currentSavedMatch.id);
        await loadSQLiteSavedChannels();
        renderCategoryTabs();
        if (activeCategory === "SQLITE_SAVED") {
          applyFilters();
        } else {
          renderChannelList();
        }
        await renderModalLists();
        updatePlayerSaveBtnState();
        showToast(`🗑️ Removed "${channel.name}" from saved channels`, 3500, "info");
      } catch (err: any) {
        showToast(`❌ Failed to remove "${channel.name}": ${err.message || err}`, 4000, "error");
      }
    } else {
      try {
        const saved = await saveChannelUrlToSQLite(channel);
        await loadSQLiteSavedChannels();
        renderCategoryTabs();
        if (activeCategory === "SQLITE_SAVED") {
          applyFilters();
        } else {
          renderChannelList();
        }
        await renderModalLists();
        updatePlayerSaveBtnState();
        showToast(`✅ Saved "${saved.name}" to SQLite database!`, 3500, "success");
      } catch (err: any) {
        showToast(`❌ Failed to save "${channel.name}" to SQLite: ${err.message || err}`, 4000, "error");
      }
    }
  });

  // Favorite Button Handler
  const favBtn = item.querySelector(".fav-btn") as HTMLButtonElement;
  favBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const updatedFav = await toggleFavoriteId(channel.id);
    if (updatedFav) {
      favoritesSet.add(channel.id);
      favBtn.classList.add("is-fav");
      favBtn.querySelector("svg")?.setAttribute("fill", "currentColor");
      showToast(`Added "${channel.name}" to favorites`, 3000, "success");
    } else {
      favoritesSet.delete(channel.id);
      favBtn.classList.remove("is-fav");
      favBtn.querySelector("svg")?.setAttribute("fill", "none");
      showToast(`Removed "${channel.name}" from favorites`, 3000, "info");
    }
    renderCategoryTabs();
    if (activeCategory === "FAVORITES") applyFilters();
  });

  return item;
}

class CustomHlsLoader extends Hls.DefaultConfig.loader {
  constructor(config: any) {
    super(config);
    const load = this.load.bind(this);
    this.load = (context: any, config: any, callbacks: any) => {
      if (
        context.url &&
        (context.url.startsWith("http://") || context.url.startsWith("https://")) &&
        !context.url.includes("/api/proxy?url=")
      ) {
        context.url = `${window.location.origin}/api/proxy?url=${encodeURIComponent(context.url)}`;
      }
      load(context, config, callbacks);
    };
  }
}

/**
 * Play Channel with Hls.js & Buffer Retention for Stream Timeline
 */
function playChannel(channel: Channel) {
  activeChannel = channel;
  addRecentChannelId(channel.id);
  setLastPlayedChannelId(channel.id);
  updatePlayerSaveBtnState();

  if (window.innerWidth <= 900) {
    closeSidebar();
  }

  document.querySelectorAll(".channel-item").forEach((el) => {
    if (el.getAttribute("data-channel-id") === channel.id) {
      el.classList.add("active");
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else {
      el.classList.remove("active");
    }
  });

  overlayTitle.textContent = channel.name;
  const groupText = channel.group && channel.group.toLowerCase() !== "undefined" && channel.group.toLowerCase() !== "null" ? channel.group : "";
  const countryText = channel.country && channel.country.toLowerCase() !== "undefined" && channel.country.toLowerCase() !== "null" ? channel.country : "";
  overlayCategory.textContent = groupText && countryText ? `${groupText} • ${countryText}` : groupText || countryText || "PulseStream IPTV";
  if (isValidLogo(channel.logo)) {
    overlayLogo.src = channel.logo!;
    overlayLogo.style.display = "block";
    overlayLogo.onerror = () => {
      overlayLogo.style.display = "none";
    };
  } else {
    overlayLogo.removeAttribute("src");
    overlayLogo.style.display = "none";
  }

  const isFav = favoritesSet.has(channel.id);
  if (isFav) {
    favIcon.setAttribute("fill", "currentColor");
    favToggleBtn.style.color = "var(--accent-amber)";
  } else {
    favIcon.setAttribute("fill", "none");
    favToggleBtn.style.color = "var(--text-main)";
  }

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  safePause();

  const streamUrl = channel.url;
  const isHls = streamUrl.includes(".m3u8") || streamUrl.includes("m3u8") || !streamUrl.endsWith(".mp4");

  if (Hls.isSupported() && isHls) {
    hlsInstance = new Hls({
      loader: CustomHlsLoader,
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 600, // Retain 10 minutes buffer for Stream Timeline rewind
      maxBufferLength: 60,
      maxMaxBufferLength: 120,
    });

    hlsInstance.loadSource(streamUrl);
    hlsInstance.attachMedia(videoElement);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      safePlay();
      updateAudioTrackSelector();
    });

    hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      updateAudioTrackSelector();
    });

    hlsInstance.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
      updateAudioTrackSelector();
    });

    let networkRetryCount = 0;
    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn("HLS Error:", data);
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            networkRetryCount++;
            if (networkRetryCount <= 1) {
              showToast(`Network error loading ${channel.name}. Retrying...`, 2000, "warning");
              hlsInstance?.startLoad();
            } else {
              hlsInstance?.destroy();
              showToast(`❌ Error loading ${channel.name}: Unable to connect to stream`, 4000, "error");
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hlsInstance?.recoverMediaError();
            break;
          default:
            hlsInstance?.destroy();
            showToast(`Stream unplayable: ${channel.name}`, 3500, "error");
            break;
        }
      }
    });
  } else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
    videoElement.src = `/api/proxy?url=${encodeURIComponent(streamUrl)}`;
    safePlay();
  } else {
    videoElement.src = `/api/proxy?url=${encodeURIComponent(streamUrl)}`;
    safePlay();
  }
}

/**
 * Update Play/Pause UI state
 */
function updatePlayPauseIcons(isPlaying: boolean) {
  if (isPlaying) {
    playIcon.style.display = "none";
    pauseIcon.style.display = "block";
    streamTimelineContainer.classList.remove("active");
  } else {
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
    if (!videoElement.ended) {
      streamTimelineContainer.classList.add("active");
      updateStreamTimeline();
    }
  }
}

/**
 * Update Audio Language Selector
 */
function updateAudioTrackSelector() {
  if (!hlsInstance) {
    langBtn.style.display = "none";
    langDropdown.classList.remove("active");
    return;
  }

  const tracks = hlsInstance.audioTracks;

  if (!tracks || tracks.length <= 1) {
    langBtn.style.display = "none";
    langDropdown.classList.remove("active");
    return;
  }

  langBtn.style.display = "flex";
  langOptionsList.innerHTML = "";

  const currentTrackId = hlsInstance.audioTrack;

  tracks.forEach((track) => {
    const item = document.createElement("div");
    const isSelected = track.id === currentTrackId;
    item.className = `lang-option-item ${isSelected ? "active" : ""}`;
    const trackName = track.name || track.lang || `Track ${track.id + 1}`;

    item.innerHTML = `
      <span>🌐 ${trackName}</span>
      ${isSelected ? '<span style="font-size:0.75rem; color:var(--accent-cyan);">✓</span>' : ""}
    `;

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (hlsInstance) {
        hlsInstance.audioTrack = track.id;
        showToast(`Switched audio language to: ${trackName}`, 2500, "info");
        langDropdown.classList.remove("active");
        updateAudioTrackSelector();
      }
    });

    langOptionsList.appendChild(item);
  });
}

function playNextChannel() {
  if (filteredChannels.length === 0) return;
  const currentIndex = filteredChannels.findIndex((c) => c.id === activeChannel?.id);
  const nextIndex = (currentIndex + 1) % filteredChannels.length;
  playChannel(filteredChannels[nextIndex]);
}

function playPrevChannel() {
  if (filteredChannels.length === 0) return;
  const currentIndex = filteredChannels.findIndex((c) => c.id === activeChannel?.id);
  const prevIndex = (currentIndex - 1 + filteredChannels.length) % filteredChannels.length;
  playChannel(filteredChannels[prevIndex]);
}

/**
 * Render Modal Lists (Presets, SQLite Channels, Playlists)
 */
async function renderModalLists() {
  await loadSQLiteSavedChannels();

  // Render Presets
  let presetHtml = "";
  PRESET_PLAYLISTS.forEach((preset) => {
    presetHtml += `
      <div class="preset-card" data-preset-url="${preset.url}" data-preset-name="${preset.name}">
        <div class="preset-info">
          <span class="preset-name">${preset.name}</span>
          <span class="preset-desc">${preset.description}</span>
        </div>
        <button class="btn-primary" style="padding: 6px 12px; font-size: 0.78rem;">Load</button>
      </div>
    `;
  });
  presetPlaylistsList.innerHTML = presetHtml;

  presetPlaylistsList.querySelectorAll(".preset-card").forEach((card) => {
    card.addEventListener("click", () => {
      const url = card.getAttribute("data-preset-url")!;
      const name = card.getAttribute("data-preset-name")!;
      currentPlaylistName = name;
      currentPlaylistUrl = url;
      currentPlaylistLabel.textContent = name;
      closeModal();
      loadPlaylist(url);
    });
  });

  // Render Saved Channels from SQLite DB
  if (savedChannelsSqliteList) {
    if (sqliteSavedChannels.length === 0) {
      savedChannelsSqliteList.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-dim);">No channel URLs saved to SQLite yet. Click the 💾 database button on any channel or player controls to save!</p>`;
    } else {
      let sqliteHtml = "";
      sqliteSavedChannels.forEach((ch) => {
        sqliteHtml += `
          <div class="saved-playlist-item">
            <div style="cursor: pointer; flex: 1; min-width: 0;" class="load-sqlite-ch-btn" data-sqlite-url="${ch.url}">
              <div style="font-weight: 600; font-size: 0.88rem; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">💾 ${ch.name}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${ch.url}</div>
            </div>
            <button class="delete-sqlite-ch-btn" data-delete-sqlite-id="${ch.id}" title="Remove from SQLite DB">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        `;
      });
      savedChannelsSqliteList.innerHTML = sqliteHtml;

      savedChannelsSqliteList.querySelectorAll(".load-sqlite-ch-btn").forEach((el) => {
        el.addEventListener("click", () => {
          const url = el.getAttribute("data-sqlite-url")!;
          const match = sqliteSavedChannels.find((c) => c.url === url);
          closeModal();
          if (match) playChannel(match);
        });
      });

      savedChannelsSqliteList.querySelectorAll(".delete-sqlite-ch-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-delete-sqlite-id")!;
          try {
            await removeSavedChannelFromSQLite(id);
            await loadSQLiteSavedChannels();
            showToast("🗑️ Removed channel from SQLite database", 3000, "info");
            renderCategoryTabs();
            if (activeCategory === "SQLITE_SAVED") applyFilters();
            else renderChannelList();
            await renderModalLists();
            updatePlayerSaveBtnState();
          } catch (err: any) {
            showToast(`❌ Error removing channel: ${err.message || err}`, 3500, "error");
          }
        });
      });
    }
  }

  // Render Saved Playlists
  const saved = await getSavedPlaylists();
  if (saved.length === 0) {
    savedPlaylistsList.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-dim);">No custom M3U URLs saved yet. Enter a URL above to save to SQLite!</p>`;
    return;
  }

  let savedHtml = "";
  saved.forEach((item: SavedPlaylist) => {
    savedHtml += `
      <div class="saved-playlist-item">
        <div style="cursor: pointer; flex: 1; min-width: 0;" class="load-saved-btn" data-saved-url="${item.url}" data-saved-name="${item.name}">
          <div style="font-weight: 600; font-size: 0.88rem; color: #fff; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${item.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${item.url}</div>
        </div>
        <button class="delete-btn" data-delete-id="${item.id}" title="Remove Playlist">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;
  });

  savedPlaylistsList.innerHTML = savedHtml;

  savedPlaylistsList.querySelectorAll(".load-saved-btn").forEach((el) => {
    el.addEventListener("click", () => {
      const url = el.getAttribute("data-saved-url")!;
      const name = el.getAttribute("data-saved-name")!;
      currentPlaylistName = name;
      currentPlaylistUrl = url;
      currentPlaylistLabel.textContent = name;
      closeModal();
      loadPlaylist(url);
    });
  });

  savedPlaylistsList.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-delete-id")!;
      try {
        await removeSavedPlaylist(id);
        showToast("🗑️ Removed saved playlist", 3000, "info");
        renderModalLists();
      } catch (err: any) {
        showToast(`❌ Error deleting playlist: ${err.message || err}`, 3500, "error");
      }
    });
  });
}

function setupMobileNavigation() {
  sidebarToggleBtn?.addEventListener("click", () => {
    if (sidebarEl?.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  closeSidebarBtn?.addEventListener("click", closeSidebar);
  sidebarBackdrop?.addEventListener("click", closeSidebar);

  mobileTabCategories?.addEventListener("click", () => {
    mobileTabCategories.classList.add("active");
    mobileTabChannels?.classList.remove("active");
    categorySidebarEl?.classList.add("mobile-active");
    channelPanelEl?.classList.remove("mobile-active");
  });

  mobileTabChannels?.addEventListener("click", () => {
    mobileTabChannels.classList.add("active");
    mobileTabCategories?.classList.remove("active");
    channelPanelEl?.classList.add("mobile-active");
    categorySidebarEl?.classList.remove("mobile-active");
  });
}

function openModal() {
  renderModalLists();
  playlistModal.classList.add("active");
}

function closeModal() {
  playlistModal.classList.remove("active");
}

/**
 * Event Listeners Setup
 */
function setupEventListeners() {
  setupMobileNavigation();

  // Search input typing
  searchInput.addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    clearSearchBtn.style.display = searchQuery ? "flex" : "none";
    applyFilters();
  });

  // Infinite Scroll
  channelListEl.addEventListener("scroll", () => {
    if (currentlyRenderedCount >= filteredChannels.length) return;
    if (channelListEl.scrollTop + channelListEl.clientHeight >= channelListEl.scrollHeight - 400) {
      appendMoreChannels();
    }
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    clearSearchBtn.style.display = "none";
    applyFilters();
  });

  // Modal actions
  currentPlaylistBtn.addEventListener("click", openModal);
  addUrlBtn.addEventListener("click", openModal);
  closeModalBtn.addEventListener("click", closeModal);
  playlistModal.addEventListener("click", (e) => {
    if (e.target === playlistModal) closeModal();
  });

  // Save new M3U form submit
  addM3uForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = m3uUrlInput.value.trim();
    const name = m3uNameInput.value.trim() || "Custom M3U";

    if (!url) return;

    try {
      await savePlaylistUrl(name, url);
      showToast(`✅ Saved playlist "${name}" to SQLite storage!`, 3500, "success");
      currentPlaylistName = name;
      currentPlaylistUrl = url;
      currentPlaylistLabel.textContent = name;

      m3uUrlInput.value = "";
      m3uNameInput.value = "";

      closeModal();
      loadPlaylist(url);
    } catch (err: any) {
      showToast(`❌ Failed to save playlist: ${err.message || err}`, 4000, "error");
    }
  });

  // Export / Import Local File Storage
  exportStorageBtn?.addEventListener("click", async () => {
    try {
      await exportLocalFileStorage();
      showToast("💾 Exported storage backup to JSON file!", 3500, "success");
    } catch (err: any) {
      showToast(`❌ Failed to export storage: ${err.message || err}`, 4000, "error");
    }
  });

  importStorageFileInput?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const res = await importLocalFileStorage(content);
      showToast(`✅ Imported ${res.channelsAdded} channels & ${res.playlistsAdded} playlists to SQLite!`, 4000, "success");
      await renderModalLists();
      renderCategoryTabs();
    } catch (err: any) {
      showToast(`❌ Failed to import storage: ${err.message || err}`, 4000, "error");
    }
    importStorageFileInput.value = "";
  });

  // Player Save / Delete SQLite Button
  saveSqliteBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!activeChannel) {
      showToast("⚠️ No active channel selected", 3000, "warning");
      return;
    }
    const savedMatch = isChannelSavedInSQLite(activeChannel);
    if (savedMatch) {
      try {
        await removeSavedChannelFromSQLite(savedMatch.id);
        await loadSQLiteSavedChannels();
        renderCategoryTabs();
        if (activeCategory === "SQLITE_SAVED") applyFilters();
        else renderChannelList();
        await renderModalLists();
        updatePlayerSaveBtnState();
        showToast(`🗑️ Removed "${activeChannel.name}" from saved channels`, 3500, "info");
      } catch (err: any) {
        showToast(`❌ Failed to remove channel from SQLite: ${err.message || err}`, 4000, "error");
      }
    } else {
      try {
        const saved = await saveChannelUrlToSQLite(activeChannel);
        await loadSQLiteSavedChannels();
        renderCategoryTabs();
        if (activeCategory === "SQLITE_SAVED") applyFilters();
        else renderChannelList();
        await renderModalLists();
        updatePlayerSaveBtnState();
        showToast(`✅ Saved "${saved.name}" URL to SQLite database!`, 3500, "success");
      } catch (err: any) {
        showToast(`❌ Failed to save channel to SQLite: ${err.message || err}`, 4000, "error");
      }
    }
  });

  // Player Play/Pause Button
  playPauseBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (videoElement.paused) {
      await safePlay();
    } else {
      safePause();
    }
  });

  videoElement.addEventListener("play", () => {
    updatePlayPauseIcons(true);
    if (timelineInterval) clearInterval(timelineInterval);
  });

  videoElement.addEventListener("pause", () => {
    updatePlayPauseIcons(false);
    if (!videoElement.ended) {
      streamTimelineContainer.classList.add("active");
      updateStreamTimeline();
      if (timelineInterval) clearInterval(timelineInterval);
      timelineInterval = setInterval(updateStreamTimeline, 500);
    }
  });

  videoElement.addEventListener("timeupdate", () => {
    if (videoElement.paused) {
      updateStreamTimeline();
    }
  });

  // Stream Timeline Slider Interaction
  streamTimelineSlider?.addEventListener("input", () => {
    const val = parseFloat(streamTimelineSlider.value);
    const { start, end } = getBufferRange();
    const targetTime = start + (val / 100) * Math.max(0, end - start);
    videoElement.currentTime = targetTime;

    const missedSeconds = Math.max(0, end - targetTime);
    const tooltipText = missedSeconds > 1 ? `-${formatSeconds(missedSeconds)}` : "LIVE";
    timelineTooltip.textContent = tooltipText;
    timelineTooltip.style.left = `${val}%`;
    timelineTooltip.classList.add("active");

    updateStreamTimeline();
  });

  streamTimelineSlider?.addEventListener("change", () => {
    timelineTooltip.classList.remove("active");
  });

  // Stream Timeline Quick Controls
  skipBack60Btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const { start } = getBufferRange();
    videoElement.currentTime = Math.max(start, videoElement.currentTime - 60);
    updateStreamTimeline();
  });

  skipBack15Btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const { start } = getBufferRange();
    videoElement.currentTime = Math.max(start, videoElement.currentTime - 15);
    updateStreamTimeline();
  });

  skipForward15Btn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const { end } = getBufferRange();
    videoElement.currentTime = Math.min(end, videoElement.currentTime + 15);
    updateStreamTimeline();
  });

  timelineResumeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    safePlay();
    streamTimelineContainer.classList.remove("active");
  });

  timelineLiveBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const { end } = getBufferRange();
    videoElement.currentTime = end;
    safePlay();
    streamTimelineContainer.classList.remove("active");
  });

  // Next / Prev channel buttons
  nextChannelBtn.addEventListener("click", playNextChannel);
  prevChannelBtn.addEventListener("click", playPrevChannel);

  // Mute & Volume
  muteBtn.addEventListener("click", () => {
    videoElement.muted = !videoElement.muted;
    volumeMuteIcon.style.display = videoElement.muted ? "block" : "none";
    volumeHighIcon.style.display = videoElement.muted ? "none" : "block";
    const currentVal = videoElement.muted ? 0 : videoElement.volume;
    volumeSlider.value = currentVal.toString();
    const volumeBadge = document.getElementById("volume-val-badge");
    if (volumeBadge) volumeBadge.textContent = `${Math.round(currentVal * 100)}%`;
  });

  volumeSlider.addEventListener("input", (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    videoElement.volume = val;
    videoElement.muted = val === 0;
    volumeMuteIcon.style.display = val === 0 ? "block" : "none";
    volumeHighIcon.style.display = val === 0 ? "none" : "block";
    const volumeBadge = document.getElementById("volume-val-badge");
    if (volumeBadge) volumeBadge.textContent = `${Math.round(val * 100)}%`;
  });

  // Prevent control clicks from toggling play/pause accidentally
  videoElement.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".player-overlay, .stream-timeline-container, .modal-backdrop")) {
      return;
    }
    playPauseBtn.click();
  });

  videoElement.addEventListener("dblclick", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".player-overlay, .stream-timeline-container, .modal-backdrop")) {
      return;
    }
    fullscreenBtn.click();
  });

  langBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle("active");
  });

  document.addEventListener("click", (e) => {
    if (langDropdown.classList.contains("active") && !langDropdown.contains(e.target as Node) && e.target !== langBtn) {
      langDropdown.classList.remove("active");
    }
  });

  favToggleBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!activeChannel) return;
    const isFav = await toggleFavoriteId(activeChannel.id);
    if (isFav) {
      favoritesSet.add(activeChannel.id);
      favIcon.setAttribute("fill", "currentColor");
      favToggleBtn.style.color = "var(--accent-amber)";
      showToast(`Added "${activeChannel.name}" to favorites`, 3000, "success");
    } else {
      favoritesSet.delete(activeChannel.id);
      favIcon.setAttribute("fill", "none");
      favToggleBtn.style.color = "var(--text-main)";
      showToast(`Removed "${activeChannel.name}" from favorites`, 3000, "info");
    }
    renderCategoryTabs();
    applyFilters();
  });

  fullscreenBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch((err) => console.error(err));
    } else {
      document.exitFullscreen().catch((err) => console.error(err));
    }
  });

  // Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;

    if (e.code === "Space") {
      e.preventDefault();
      playPauseBtn.click();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      const { start } = getBufferRange();
      videoElement.currentTime = Math.max(start, videoElement.currentTime - 10);
      updateStreamTimeline();
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      const { end } = getBufferRange();
      videoElement.currentTime = Math.min(end, videoElement.currentTime + 10);
      updateStreamTimeline();
    } else if (e.code === "KeyF") {
      e.preventDefault();
      fullscreenBtn.click();
    } else if (e.code === "KeyM") {
      e.preventDefault();
      muteBtn.click();
    }
  });
}

document.addEventListener("DOMContentLoaded", initApp);
