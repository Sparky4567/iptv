export function sanitizeString(val: string | undefined | null): string {
  if (!val) return "";
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === "undefined" ||
    lower === "null" ||
    lower === "none" ||
    lower === "false" ||
    lower === "n/a" ||
    lower === "0"
  ) {
    return "";
  }
  return trimmed;
}

export function isValidLogo(url: string | undefined | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === "undefined" ||
    lower === "null" ||
    lower === "none" ||
    lower === "false" ||
    lower === "0" ||
    lower === "no" ||
    lower === "n/a"
  ) {
    return false;
  }
  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("//") ||
    lower.startsWith("data:image/") ||
    lower.startsWith("/")
  );
}

/**
 * Parses M3U / M3U8 string content into an array of Channel objects.
 */
export function parseM3U(m3uContent: string): Channel[] {
  const lines = m3uContent.split(/\r?\n/);
  const channels: Channel[] = [];

  let currentMeta: Partial<Channel> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      currentMeta = parseExtInfLine(line);
    } else if (line.startsWith("#EXTGRP:") && currentMeta) {
      const group = sanitizeString(line.replace("#EXTGRP:", ""));
      if (group && !currentMeta.group) {
        currentMeta.group = group;
      }
    } else if (!line.startsWith("#")) {
      // It's a stream URL
      if (line.startsWith("http://") || line.startsWith("https://") || line.startsWith("//") || line.endsWith(".m3u8") || line.endsWith(".mp4") || line.endsWith(".ts")) {
        const streamUrl = line.startsWith("//") ? `https:${line}` : line;
        
        const channelName = sanitizeString(currentMeta?.name) || `Channel ${channels.length + 1}`;
        const groupName = sanitizeString(currentMeta?.group);
        const channelId = sanitizeString(currentMeta?.tvgId) || `${channelName}-${channels.length}-${streamUrl.slice(-10)}`;
        const logoUrl = isValidLogo(currentMeta?.logo) ? currentMeta!.logo! : "";

        channels.push({
          id: channelId,
          name: channelName,
          url: streamUrl,
          logo: logoUrl,
          group: groupName,
          tvgId: sanitizeString(currentMeta?.tvgId),
          tvgName: sanitizeString(currentMeta?.tvgName),
          country: sanitizeString(currentMeta?.country),
          language: sanitizeString(currentMeta?.language),
          favorite: false,
        });
      }
      currentMeta = null;
    }
  }

  return channels;
}

function parseExtInfLine(line: string): Partial<Channel> {
  const meta: Partial<Channel> = {};

  // Extract channel name (everything after the last comma)
  const commaIndex = line.lastIndexOf(",");
  if (commaIndex !== -1) {
    const rawName = line.substring(commaIndex + 1).trim();
    const sanitized = sanitizeString(rawName);
    if (sanitized) {
      meta.name = sanitized;
    }
  }

  // Parse attributes: key="value" or key='value' or key=value
  const attributeRegex = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  let match;

  while ((match = attributeRegex.exec(line)) !== null) {
    const key = match[1].toLowerCase();
    const rawVal = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    const value = sanitizeString(rawVal);

    switch (key) {
      case "tvg-id":
        meta.tvgId = value;
        break;
      case "tvg-name":
        meta.tvgName = value;
        if (!meta.name && value) meta.name = value;
        break;
      case "tvg-logo":
        meta.logo = isValidLogo(rawVal) ? rawVal : "";
        break;
      case "group-title":
        meta.group = value;
        break;
      case "tvg-country":
        meta.country = value;
        break;
      case "tvg-language":
        meta.language = value;
        break;
    }
  }

  return meta;
}
