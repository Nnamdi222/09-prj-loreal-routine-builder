/*
  OpenAI chatbot backend.
  - Serves the frontend files
  - Handles POST /chat requests
  - Uses the OpenAI Responses API with web search when OPENAI_API_KEY is set
*/

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8787;
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1";
const PUBLIC_DIR = __dirname;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/* Check Node version */
if (typeof fetch === "undefined") {
  console.error(
    "ERROR: Your version of Node.js does not support fetch(). Please use Node.js 18 or newer.",
  );
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error(
    "ERROR: OPENAI_API_KEY not found. Live chat is unavailable until it is configured.",
  );
}

console.log(
  "OpenAI API Key Loaded:",
  process.env.OPENAI_API_KEY ? "YES" : "NO",
);

/*
    Send JSON with CORS headers so the browser can call this endpoint.
  */
function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  response.end(JSON.stringify(payload));
}

/*
    Read the raw request body and return it as text.
  */
function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      resolve(body);
    });

    request.on("error", reject);
  });
}

/*
    Build an OpenAI-style response shape so the frontend can always parse it.
  */
function buildChatCompletion(content, model = DEFAULT_MODEL, metadata = {}) {
  return {
    id: `chatcmpl_local_${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: "stop",
      },
    ],
    metadata,
  };
}

/*
  Extract the response text and clickable source URLs from Responses API output.
*/
function getResponseText(responseData) {
  const message = responseData.output?.find(
    (item) => item.type === "message" && item.role === "assistant",
  );
  const contentParts = message?.content || [];
  const text = contentParts
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("\n");

  const sourceUrls = contentParts.flatMap((part) =>
    (part.annotations || [])
      .filter((annotation) => annotation.type === "url_citation")
      .map((annotation) => annotation.url),
  );
  const uniqueSourceUrls = [...new Set(sourceUrls)];

  if (!text) {
    return "";
  }

  if (uniqueSourceUrls.length === 0) {
    return text;
  }

  return `${text}\n\nSources:\n${uniqueSourceUrls.join("\n")}`;
}

/*
    Send plain text with status code.
  */
function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

/*
    Serve frontend files from this project folder.
    This keeps UI and API on one origin: http://localhost:8787
  */
function serveStaticFile(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const safePath = path.normalize(normalizedPath).replace(/^\/+/, "");
  const fullPath = path.join(PUBLIC_DIR, safePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, fileBuffer) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendText(response, 404, "Not Found");
        return;
      }

      sendText(response, 500, "Server error while reading file.");
      return;
    }

    const extension = path.extname(fullPath).toLowerCase();
    const contentType = CONTENT_TYPES[extension] || "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    response.end(fileBuffer);
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://localhost:${PORT}`);

  /* Allow browser preflight checks */
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  /* Serve frontend pages and assets from the same server */
  if (request.method === "GET" || request.method === "HEAD") {
    if (requestUrl.pathname === "/health") {
      sendJson(response, 200, {
        status: process.env.OPENAI_API_KEY ? "ok" : "missing-key",
        mode: process.env.OPENAI_API_KEY ? "live-ai" : "unconfigured",
      });
      return;
    }

    serveStaticFile(requestUrl.pathname, response);
    return;
  }

  /* Only one API endpoint is needed for chat */
  if (requestUrl.pathname !== "/chat") {
    sendJson(response, 404, { error: "Route not found. Use POST /chat." });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Only POST requests are supported." });
    return;
  }

  let parsedBody;

  try {
    const rawBody = await readRequestBody(request);
    parsedBody = JSON.parse(rawBody || "{}");
  } catch (error) {
    sendJson(response, 400, { error: "Invalid JSON." });
    return;
  }

  if (!Array.isArray(parsedBody.messages) || parsedBody.messages.length === 0) {
    sendJson(response, 400, {
      error: "A non-empty messages array is required.",
    });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const upstreamBody = {
    model: parsedBody.model || DEFAULT_MODEL,
    input: parsedBody.messages,
    tools: [
      {
        type: "web_search",
        search_context_size: "low",
      },
    ],
    tool_choice: "auto",
  };

  if (!apiKey) {
    sendJson(response, 503, {
      error: "OPENAI_API_KEY is missing. Configure it and restart server.js.",
    });
    return;
  }

  try {
    console.log("Sending web-enabled request to OpenAI...");

    const upstreamResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
    });

    const text = await upstreamResponse.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch (error) {
      sendJson(response, 502, {
        error: "OpenAI returned an invalid response.",
      });
      return;
    }

    const responseText = getResponseText(json);

    if (!upstreamResponse.ok || !responseText) {
      const errorReason =
        json.error?.message || json.detail || `HTTP ${upstreamResponse.status}`;
      sendJson(response, upstreamResponse.status || 502, {
        error: `OpenAI request failed: ${errorReason}`,
      });
      return;
    }

    console.log("OpenAI Status:", upstreamResponse.status);

    sendJson(
      response,
      upstreamResponse.status,
      buildChatCompletion(responseText, upstreamBody.model),
    );
  } catch (error) {
    console.error(error);

    sendJson(response, 502, {
      error: `Could not reach OpenAI: ${error.message}`,
    });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the existing server before starting a new one.`,
    );
    return;
  }

  console.error("Server could not start:", error.message);
});

server.listen(PORT, () => {
  console.log(`OpenAI chatbot server running on http://localhost:${PORT}`);
});
