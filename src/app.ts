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
} from "./storage";
import { Channel, SavedPlaylist } from "./types";

// State
let allChannels: Channel[] = [];
let filteredChannels: Channel[] = [];
let activeChannel: Channel | null = null;
let activeCategory = "ALL";
let searchQuery = "";
let favoritesSet = new Set<string>();
let hlsInstance: Hls | null = null;
let currentPlaylistName = "Global News (IPTV-org)";
let currentPlaylistUrl = PRESET_PLAYLISTS[0].url;
const BATCH_SIZE = 80;
let currentlyRenderedCount = BATCH_SIZE;

// DOM Elements
const videoElement = document.getElementById("video-player") as HTMLVideoElement;
const channelListEl = document.getElementById("channel-list") as HTMLDivElement;
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const clearSearchBtn = document.getElementById("clear-search") as HTMLButtonElement;
const categoryBarEl = document.getElementById("category-bar") as HTMLDivElement;
const categoryTreeEl = document.getElementById("category-tree") as HTMLDivElement;
const channelCountLabel = document.getElementById("channel-count-label") as HTMLSpanElement;
const activeGroupLabel = document.getElementById("active-group-label") as HTMLSpanElement;

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
const presetPlaylistsList = document.getElementById("preset-playlists-list") as HTMLDivElement;
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
const favToggleBtn = document.getElementById("fav-toggle-btn") as HTMLButtonElement;
const favIcon = document.getElementById("fav-icon") as SVGElement;
const fullscreenBtn = document.getElementById("fullscreen-btn") as HTMLButtonElement;
const videoContainer = document.getElementById("video-container") as HTMLDivElement;

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
 * Toast Notification Helper
 */
function showToast(message: string, duration = 3000) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Initialize App
 */
async function initApp() {
  // Load Favorites from ImmortalDB
  const favs = await getFavorites();
  favoritesSet = new Set(favs);

  // Check last active playlist in ImmortalDB
  const savedUrl = await getActivePlaylistUrl();
  if (savedUrl) {
    currentPlaylistUrl = savedUrl;
    // Find matching preset or saved playlist name
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

  // Render presets & saved playlists in modal
  renderModalLists();

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
    // Try direct fetch first
    const directRes = await fetch(url);
    if (!directRes.ok) throw new Error(`HTTP ${directRes.status}`);
    m3uText = await directRes.text();
  } catch (err) {
    console.warn("Direct M3U fetch failed or blocked by CORS. Using Bun server proxy...", err);
    try {
      const proxyRes = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      if (!proxyRes.ok) throw new Error(`Proxy error: ${proxyRes.status}`);
      m3uText = await proxyRes.text();
    } catch (proxyErr: any) {
      showToast(`Error loading playlist: ${proxyErr.message}`);
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

  // Apply saved favorite status
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

  // Persist active playlist URL with ImmortalDB
  await setActivePlaylistUrl(url);

  // Extract Categories / Groups
  renderCategoryTabs();

  // Filter & Render
  applyFilters();

  // Play last played channel if available in playlist, otherwise first channel
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

  showToast(`Loaded ${allChannels.length} channels`);
}

/**
 * Render Category Navigation Tree on the Left Side
 */
function renderCategoryTabs() {
  if (!categoryTreeEl) return;

  const groupsMap = new Map<string, number>();
  allChannels.forEach((c) => {
    const rawGroup = c.group ? c.group.split(";")[0].trim() : "";
    const groupName = rawGroup && rawGroup.toLowerCase() !== "undefined" && rawGroup.toLowerCase() !== "null" ? rawGroup : "General";
    groupsMap.set(groupName, (groupsMap.get(groupName) || 0) + 1);
  });

  // Sort groups by channel count descending
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

  // Add click handlers for category tree items
  const items = categoryTreeEl.querySelectorAll(".category-tree-item");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      items.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      activeCategory = item.getAttribute("data-category") || "ALL";
      activeGroupLabel.textContent = `Category: ${activeCategory}`;
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

  filteredChannels = allChannels.filter((c) => {
    // Category check
    let categoryMatch = true;
    if (activeCategory === "FAVORITES") {
      categoryMatch = favoritesSet.has(c.id);
    } else if (activeCategory !== "ALL") {
      const primaryGroup = (c.group || "General").split(";")[0].trim();
      categoryMatch = primaryGroup === activeCategory || (c.group || "").includes(activeCategory);
    }

    if (!categoryMatch) return false;

    // Search query check
    if (query) {
      const nameMatch = c.name.toLowerCase().includes(query);
      const groupMatch = (c.group || "").toLowerCase().includes(query);
      const tvgMatch = (c.tvgId || "").toLowerCase().includes(query);
      return nameMatch || groupMatch || tvgMatch;
    }

    return true;
  });

  currentlyRenderedCount = BATCH_SIZE;
  channelCountLabel.textContent = `${filteredChannels.length} of ${allChannels.length} channels`;
  renderChannelList();
}

/**
 * Render Channel List in Sidebar (Lazy Batch Rendering for 10k+ Channels)
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

  // Remove old load indicator if present
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

  item.innerHTML = `
    <div class="channel-logo-container">${logoHtml}</div>
    <div class="channel-info">
      <div class="channel-name" title="${channel.name}">${channel.name}</div>
      ${groupHtml}
    </div>
    <button class="fav-btn ${isFav ? "is-fav" : ""}" title="${isFav ? "Remove from Favorites" : "Add to Favorites"}" data-fav-id="${channel.id}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
    </button>
  `;

  // Click to play
  item.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest(".fav-btn")) return;
    playChannel(channel);
  });

  // Favorite button click handler
  const favBtn = item.querySelector(".fav-btn") as HTMLButtonElement;
  favBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const updatedFav = await toggleFavoriteId(channel.id);
    if (updatedFav) {
      favoritesSet.add(channel.id);
      favBtn.classList.add("is-fav");
      favBtn.querySelector("svg")?.setAttribute("fill", "currentColor");
      showToast(`Added "${channel.name}" to favorites`);
    } else {
      favoritesSet.delete(channel.id);
      favBtn.classList.remove("is-fav");
      favBtn.querySelector("svg")?.setAttribute("fill", "none");
      showToast(`Removed "${channel.name}" from favorites`);
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
 * Play Channel with Hls.js / Native Video Fallback
 */
function playChannel(channel: Channel) {
  activeChannel = channel;
  addRecentChannelId(channel.id);
  setLastPlayedChannelId(channel.id);

  if (window.innerWidth <= 900) {
    closeSidebar();
  }

  // Update active styling in sidebar
  document.querySelectorAll(".channel-item").forEach((el) => {
    if (el.getAttribute("data-channel-id") === channel.id) {
      el.classList.add("active");
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else {
      el.classList.remove("active");
    }
  });

  // Update Player Overlay Info
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

  // Update Fav Icon in controls
  const isFav = favoritesSet.has(channel.id);
  if (isFav) {
    favIcon.setAttribute("fill", "currentColor");
    favToggleBtn.style.color = "var(--accent-amber)";
  } else {
    favIcon.setAttribute("fill", "none");
    favToggleBtn.style.color = "var(--text-main)";
  }

  // Destroy previous HLS instance
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  const streamUrl = channel.url;
  const isHls = streamUrl.includes(".m3u8") || streamUrl.includes("m3u8") || !streamUrl.endsWith(".mp4");

  if (Hls.isSupported() && isHls) {
    hlsInstance = new Hls({
      loader: CustomHlsLoader,
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
    });

    hlsInstance.loadSource(streamUrl);
    hlsInstance.attachMedia(videoElement);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      videoElement.play().catch(() => {
        console.warn("Autoplay interrupted");
      });
      updatePlayPauseIcons(true);
      updateAudioTrackSelector();
    });

    hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      updateAudioTrackSelector();
    });

    hlsInstance.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
      updateAudioTrackSelector();
    });

    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.warn("HLS Error:", data);
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            showToast(`Network error loading ${channel.name}. Retrying...`, 2000);
            hlsInstance?.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hlsInstance?.recoverMediaError();
            break;
          default:
            hlsInstance?.destroy();
            showToast(`Stream unplayable: ${channel.name}`);
            break;
        }
      }
    });
  } else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
    // Native HLS support (e.g. Safari)
    videoElement.src = `/api/proxy?url=${encodeURIComponent(streamUrl)}`;
    videoElement.play().catch(() => {});
    updatePlayPauseIcons(true);
  } else {
    // Standard MP4 / HTML5 stream
    videoElement.src = `/api/proxy?url=${encodeURIComponent(streamUrl)}`;
    videoElement.play().catch(() => {});
    updatePlayPauseIcons(true);
  }
}

/**
 * Update Play/Pause UI state
 */
function updatePlayPauseIcons(isPlaying: boolean) {
  if (isPlaying) {
    playIcon.style.display = "none";
    pauseIcon.style.display = "block";
  } else {
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
  }
}

/**
 * Update Audio Language Selector Button & Dropdown Options
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

  // Multilanguage audio streams supported!
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
        showToast(`Switched audio language to: ${trackName}`);
        langDropdown.classList.remove("active");
        updateAudioTrackSelector();
      }
    });

    langOptionsList.appendChild(item);
  });
}

/**
 * Next / Previous Channel Logic
 */
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
 * Render Modal Lists (Saved Playlists from ImmortalDB + Presets)
 */
async function renderModalLists() {
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

  // Add click handlers for presets
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

  // Render Saved Playlists from ImmortalDB
  const saved = await getSavedPlaylists();
  if (saved.length === 0) {
    savedPlaylistsList.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-dim);">No custom M3U URLs saved yet. Enter a URL above to save!</p>`;
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

  // Add click handlers for saved item load
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

  // Delete saved playlist
  savedPlaylistsList.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-delete-id")!;
      await removeSavedPlaylist(id);
      showToast("Removed saved playlist");
      renderModalLists();
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

  // Mobile Tabs (Categories vs Channels)
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
  // Mobile Navigation Setup
  setupMobileNavigation();

  // Search input typing
  searchInput.addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    clearSearchBtn.style.display = searchQuery ? "flex" : "none";
    applyFilters();
  });

  // Infinite Scroll Listener for Sidebar Channel List
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

    // Save with ImmortalDB
    await savePlaylistUrl(name, url);
    showToast(`Saved playlist "${name}" to ImmortalDB!`);

    currentPlaylistName = name;
    currentPlaylistUrl = url;
    currentPlaylistLabel.textContent = name;

    m3uUrlInput.value = "";
    m3uNameInput.value = "";

    closeModal();
    loadPlaylist(url);
  });

  // Player Play/Pause
  playPauseBtn.addEventListener("click", () => {
    if (videoElement.paused) {
      videoElement.play();
      updatePlayPauseIcons(true);
    } else {
      videoElement.pause();
      updatePlayPauseIcons(false);
    }
  });

  videoElement.addEventListener("play", () => updatePlayPauseIcons(true));
  videoElement.addEventListener("pause", () => updatePlayPauseIcons(false));

  // Next / Prev channel buttons
  nextChannelBtn.addEventListener("click", playNextChannel);
  prevChannelBtn.addEventListener("click", playPrevChannel);

  // Mute & Volume Regulation Bar
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

  // Video element click & dblclick interaction
  videoElement.addEventListener("click", () => {
    playPauseBtn.click();
  });

  videoElement.addEventListener("dblclick", () => {
    fullscreenBtn.click();
  });

  // Language selector button click
  langBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle("active");
  });

  document.addEventListener("click", (e) => {
    if (langDropdown.classList.contains("active") && !langDropdown.contains(e.target as Node) && e.target !== langBtn) {
      langDropdown.classList.remove("active");
    }
  });

  // Favorite button inside player overlay
  favToggleBtn.addEventListener("click", async () => {
    if (!activeChannel) return;
    const isFav = await toggleFavoriteId(activeChannel.id);
    if (isFav) {
      favoritesSet.add(activeChannel.id);
      favIcon.setAttribute("fill", "currentColor");
      favToggleBtn.style.color = "var(--accent-amber)";
      showToast(`Added "${activeChannel.name}" to favorites`);
    } else {
      favoritesSet.delete(activeChannel.id);
      favIcon.setAttribute("fill", "none");
      favToggleBtn.style.color = "var(--text-main)";
      showToast(`Removed "${activeChannel.name}" from favorites`);
    }
    renderCategoryTabs();
    applyFilters();
  });

  // Fullscreen
  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      videoContainer.requestFullscreen().catch((err) => console.error(err));
    } else {
      document.exitFullscreen().catch((err) => console.error(err));
    }
  });

  // Keyboard Shortcuts
  document.addEventListener("keydown", (e) => {
    // If typing in input, ignore global shortcuts
    if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;

    if (e.code === "Space") {
      e.preventDefault();
      playPauseBtn.click();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      playPrevChannel();
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      playNextChannel();
    } else if (e.code === "KeyF") {
      e.preventDefault();
      fullscreenBtn.click();
    } else if (e.code === "KeyM") {
      e.preventDefault();
      muteBtn.click();
    }
  });
}

// Start application when DOM is ready
document.addEventListener("DOMContentLoaded", initApp);
