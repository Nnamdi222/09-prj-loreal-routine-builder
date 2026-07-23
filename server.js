/*
  Free OpenAI-compatible chatbot backend.
  - Serves the frontend files
  - Handles POST /chat requests
  - Uses a free model via OpenRouter (OpenAI-compatible API)
  - Returns a safe fallback reply instead of crashing
*/

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 8787;
const OPENAI_COMPAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";
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

/*
  OPENROUTER_API_KEY is optional for startup.
  If it is missing, the server still answers with a local fallback message.
*/
if (!process.env.OPENROUTER_API_KEY) {
  console.error(
    "Warning: OPENROUTER_API_KEY not found. Chat will run in local fallback mode.",
  );
}

console.log(
  "OpenRouter API Key Loaded:",
  process.env.OPENROUTER_API_KEY ? "YES" : "NO",
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
  Fallback reply used when API key is missing or provider fails.
*/
function buildFallbackReply(messages, reason) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message && message.role === "user");

  const userText = latestUserMessage
    ? latestUserMessage.content
    : "Please help me with a beauty routine.";

  return [
    "I can still help right now in fallback mode.",
    "",
    `Your question: ${userText}`,
    "",
    "Quick guidance:",
    "1. Morning: gentle cleanse, hydrate, and wear SPF.",
    "2. Evening: cleanse, treatment (if needed), and moisturize.",
    "3. Add one new active at a time and patch-test first.",
    "",
    `Fallback reason: ${reason}`,
    "For full AI answers, set OPENROUTER_API_KEY and restart server.js.",
  ].join("\n");
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
        status: "ok",
        mode: process.env.OPENROUTER_API_KEY ? "live-ai" : "fallback",
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
    const emptyPromptReply = buildChatCompletion(
      "Ask me any skincare, haircare, makeup, or routine question and I will help.",
    );
    sendJson(response, 200, emptyPromptReply);
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const upstreamBody = {
    model: parsedBody.model || DEFAULT_MODEL,
    messages: parsedBody.messages,
    temperature: 0.7,
  };

  if (!apiKey) {
    const fallbackReply = buildChatCompletion(
      buildFallbackReply(parsedBody.messages, "OPENROUTER_API_KEY is missing."),
      upstreamBody.model,
      { fallback: true },
    );

    sendJson(response, 200, fallbackReply);
    return;
  }

  try {
    console.log("Sending request to OpenAI-compatible provider...");

    const upstreamResponse = await fetch(OPENAI_COMPAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": `http://localhost:${PORT}`,
        "X-Title": "Loreal Routine Builder",
      },
      body: JSON.stringify(upstreamBody),
    });

    const text = await upstreamResponse.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch (error) {
      const fallbackReply = buildChatCompletion(
        buildFallbackReply(
          parsedBody.messages,
          "Provider returned invalid JSON.",
        ),
        upstreamBody.model,
        { fallback: true },
      );
      sendJson(response, 200, fallbackReply);
      return;
    }

    if (!upstreamResponse.ok || !json.choices?.[0]?.message?.content) {
      const errorReason =
        json.error?.message || json.detail || `HTTP ${upstreamResponse.status}`;
      const fallbackReply = buildChatCompletion(
        buildFallbackReply(
          parsedBody.messages,
          `Provider error: ${errorReason}`,
        ),
        upstreamBody.model,
        { fallback: true, providerStatus: upstreamResponse.status },
      );
      sendJson(response, 200, fallbackReply);
      return;
    }

    console.log("Provider Status:", upstreamResponse.status);

    sendJson(response, upstreamResponse.status, json);
  } catch (error) {
    console.error(error);

    const fallbackReply = buildChatCompletion(
      buildFallbackReply(
        parsedBody.messages,
        `Network issue: ${error.message}`,
      ),
      upstreamBody.model,
      { fallback: true },
    );
    sendJson(response, 200, fallbackReply);
  }
});

server.listen(PORT, () => {
  console.log(`Free chatbot server running on http://localhost:${PORT}`);
});
