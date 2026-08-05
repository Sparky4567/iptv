import index from "./index.html";

const PORT = process.env.PORT || 3000;

function rewriteM3U8Manifest(content: string, baseUrl: string): string {
  const lines = content.split(/\r?\n/);
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return content;
  }

  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith("#")) {
      if (trimmed.includes('URI="')) {
        return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
          try {
            return `URI="${new URL(p1, base).href}"`;
          } catch {
            return match;
          }
        });
      }
      return line;
    }
    try {
      return new URL(trimmed, base).href;
    } catch {
      return line;
    }
  });

  return rewritten.join("\n");
}

console.log(`🚀 Starting IPTV Bun Server on http://localhost:${PORT}`);

Bun.serve({
  port: PORT,
  routes: {
    "/": index,
    "/api/proxy": async (req: Request) => {
      const requestUrl = new URL(req.url);
      const targetUrl = requestUrl.searchParams.get("url");

      if (!targetUrl) {
        return new Response(JSON.stringify({ error: "Missing 'url' query parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (req.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*",
          },
        });
      }

      try {
        const fetchOptions: RequestInit = {
          method: req.method,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "*/*",
          },
        };

        const res = await fetch(targetUrl, fetchOptions);

        const responseHeaders = new Headers();
        const allowedHeaders = ["content-type", "content-length", "content-range", "accept-ranges"];
        for (const [key, value] of res.headers.entries()) {
          if (allowedHeaders.includes(key.toLowerCase())) {
            responseHeaders.set(key, value);
          }
        }

        // Permissive CORS headers for HLS player
        responseHeaders.set("Access-Control-Allow-Origin", "*");
        responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
        responseHeaders.set("Access-Control-Allow-Headers", "*");

        const contentType = res.headers.get("content-type") || "";
        const lowerUrl = targetUrl.toLowerCase();
        const isM3U8 = lowerUrl.includes(".m3u") || contentType.includes("mpegurl") || contentType.includes("m3u");

        if (isM3U8) {
          const text = await res.text();
          if (text.trim().startsWith("#EXTM3U") || lowerUrl.includes(".m3u8")) {
            const finalBaseUrl = res.url || targetUrl;
            const rewritten = rewriteM3U8Manifest(text, finalBaseUrl);
            responseHeaders.set("content-type", "application/vnd.apple.mpegurl");
            return new Response(rewritten, {
              status: res.status,
              statusText: res.statusText,
              headers: responseHeaders,
            });
          }
          return new Response(text, {
            status: res.status,
            statusText: res.statusText,
            headers: responseHeaders,
          });
        }

        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: responseHeaders,
        });
      } catch (err: any) {
        console.error("Proxy error for URL:", targetUrl, err.message);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});