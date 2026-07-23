/*
  Simple backend proxy for Mistral chat completions.
  Keeps your API key on the server.
*/

const http = require("http");

const PORT = Number(process.env.PORT) || 8787;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const DEFAULT_MODEL = "mistral-small-latest";

/* Check Node version */
if (typeof fetch === "undefined") {
  console.error(
    "ERROR: Your version of Node.js does not support fetch(). Please use Node.js 18 or newer.",
  );
  process.exit(1);
}

/* Check API key at startup so setup issues are visible right away */
if (!process.env.MISTRAL_API_KEY) {
  console.error(
    "ERROR: MISTRAL_API_KEY not found. Set it in your terminal before starting the server.",
  );
}

console.log(
  "Mistral API Key Loaded:",
  process.env.MISTRAL_API_KEY ? "YES" : "NO",
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

const server = http.createServer(async (request, response) => {
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

  /* Only one endpoint is needed for this project */
  if (request.url !== "/chat") {
    sendJson(response, 404, { error: "Route not found. Use POST /chat." });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Only POST requests are supported." });
    return;
  }

  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    sendJson(response, 500, {
      error: "Server is missing MISTRAL_API_KEY.",
    });
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

  const upstreamBody = {
    model: parsedBody.model || DEFAULT_MODEL,
    messages: parsedBody.messages,
  };

  try {
    console.log("Sending request to Mistral...");

    const mistralResponse = await fetch(MISTRAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
    });

    const text = await mistralResponse.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch (error) {
      sendJson(response, 502, {
        error: "Mistral returned invalid JSON.",
        raw: text,
      });
      return;
    }

    console.log("Mistral Status:", mistralResponse.status);

    sendJson(response, mistralResponse.status, json);
  } catch (error) {
    console.error(error);

    sendJson(response, 502, {
      error: "Unable to reach the Mistral API.",
      details: error.message,
    });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
