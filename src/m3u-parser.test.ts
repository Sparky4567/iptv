import { describe, expect, test } from "bun:test";
import { parseM3U, isValidLogo } from "./m3u-parser";

describe("M3U Parser Test Suite", () => {
  test("should parse standard #EXTINF lines with attributes", () => {
    const sampleM3U = `
#EXTM3U
#EXTINF:-1 tvg-id="CNN.us" tvg-name="CNN US" tvg-logo="https://example.com/cnn.png" group-title="News",CNN News Live
https://stream.example.com/cnn/index.m3u8
#EXTINF:-1 tvg-id="ESPN.us" group-title="Sports",ESPN HD
https://stream.example.com/espn/live.ts
    `;

    const channels = parseM3U(sampleM3U);

    expect(channels).toHaveLength(2);
    expect(channels[0].name).toBe("CNN News Live");
    expect(channels[0].group).toBe("News");
    expect(channels[0].logo).toBe("https://example.com/cnn.png");
    expect(channels[0].tvgId).toBe("CNN.us");
    expect(channels[0].url).toBe("https://stream.example.com/cnn/index.m3u8");

    expect(channels[1].name).toBe("ESPN HD");
    expect(channels[1].group).toBe("Sports");
    expect(channels[1].url).toBe("https://stream.example.com/espn/live.ts");
  });

  test("should fallback to #EXTGRP lines if group-title attribute missing", () => {
    const sampleM3U = `
#EXTM3U
#EXTINF:-1,BBC News
#EXTGRP:International News
https://stream.bbc.com/live.m3u8
    `;

    const channels = parseM3U(sampleM3U);
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("BBC News");
    expect(channels[0].group).toBe("International News");
  });

  test("should validate logo URLs correctly using isValidLogo", () => {
    expect(isValidLogo("https://example.com/logo.png")).toBe(true);
    expect(isValidLogo("http://example.com/logo.jpg")).toBe(true);
    expect(isValidLogo("//example.com/logo.png")).toBe(true);
    expect(isValidLogo("data:image/png;base64,1234")).toBe(true);
    expect(isValidLogo("/assets/logo.png")).toBe(true);

    expect(isValidLogo("undefined")).toBe(false);
    expect(isValidLogo("null")).toBe(false);
    expect(isValidLogo("none")).toBe(false);
    expect(isValidLogo("false")).toBe(false);
    expect(isValidLogo("")).toBe(false);
    expect(isValidLogo(null)).toBe(false);
    expect(isValidLogo(undefined)).toBe(false);
  });

  test("should sanitize 'undefined' or 'null' logo values when parsing M3U", () => {
    const sampleM3U = `
#EXTM3U
#EXTINF:-1 tvg-logo="undefined",Channel 1
https://stream.example.com/c1.m3u8
#EXTINF:-1 tvg-logo=null,Channel 2
https://stream.example.com/c2.m3u8
#EXTINF:-1 tvg-logo="https://img.com/logo.png?w=100&h=100",Channel 3
https://stream.example.com/c3.m3u8
    `;

    const channels = parseM3U(sampleM3U);

    expect(channels).toHaveLength(3);
    expect(channels[0].logo).toBe("");
    expect(channels[1].logo).toBe("");
    expect(channels[2].logo).toBe("https://img.com/logo.png?w=100&h=100");
  });
});
