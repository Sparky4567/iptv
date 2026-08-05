export interface Channel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
  country?: string;
  language?: string;
  favorite?: boolean;
}

export interface PlaylistPreset {
  id: string;
  name: string;
  url: string;
  description: string;
  category?: string;
}

export interface SavedPlaylist {
  id: string;
  name: string;
  url: string;
  dateAdded: number;
  isCustom?: boolean;
}
