import { PlaylistPreset } from "./types";

export const PRESET_PLAYLISTS: PlaylistPreset[] = [
  {
    id: "preset-world-iptv",
    name: "World IP TV (14,000+ Channels)",
    url: "https://romaxa55.github.io/world_ip_tv/output/index.m3u",
    description: "Huge index of 14,000+ international channels",
    category: "Global",
  },
  {
    id: "preset-news",
    name: "Global News (IPTV-org)",
    url: "https://iptv-org.github.io/iptv/categories/news.m3u",
    description: "24/7 International news channels worldwide",
    category: "News",
  },
  {
    id: "preset-movies",
    name: "Movies & Cinema (IPTV-org)",
    url: "https://iptv-org.github.io/iptv/categories/movies.m3u",
    description: "Movie streams, films, and classical cinema channels",
    category: "Movies",
  },
  {
    id: "preset-music",
    name: "Music & Radios (IPTV-org)",
    url: "https://iptv-org.github.io/iptv/categories/music.m3u",
    description: "Live music channels, concerts, and music video TV",
    category: "Music",
  },
  {
    id: "preset-animation",
    name: "Animation & Cartoons (IPTV-org)",
    url: "https://iptv-org.github.io/iptv/categories/animation.m3u",
    description: "Cartoons, anime, and kids animation streams",
    category: "Animation",
  },
  {
    id: "preset-sports",
    name: "Sports Live (IPTV-org)",
    url: "https://iptv-org.github.io/iptv/categories/sports.m3u",
    description: "Sports broadcasting, motorsports, highlights & news",
    category: "Sports",
  },
  {
    id: "preset-global",
    name: "Full Index (All Countries)",
    url: "https://iptv-org.github.io/iptv/index.m3u",
    description: "Comprehensive public database of free online streams",
    category: "Global",
  },
];
