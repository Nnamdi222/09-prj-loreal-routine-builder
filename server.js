/*
  Simple backend proxy for Mistral chat completions.
  Why this file exists:
  - Keeps your API key on the server
  - Lets the frontend send only the messages array
*/

const http = require("http");

const PORT = 8787;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const DEFAULT_MODEL = "mistral-small-latest";

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

    request.on("error", (error) => {
      reject(error);
    });
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
    sendJson(response, 405, { error: "Only POST is supported on /chat." });
    return;
  }

  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    sendJson(response, 500, {
      error: "Server is missing MISTRAL_API_KEY environment variable.",
    });
    return;
  }

  let parsedBody;

  try {
    const rawBody = await readRequestBody(request);
    parsedBody = JSON.parse(rawBody || "{}");
  } catch (error) {
    sendJson(response, 400, { error: "Request body must be valid JSON." });
    return;
  }

  if (!Array.isArray(parsedBody.messages) || parsedBody.messages.length === 0) {
    sendJson(response, 400, {
      error: "Please send a non-empty messages array.",
    });
    return;
  }

  const upstreamBody = {
    model: parsedBody.model || DEFAULT_MODEL,
    messages: parsedBody.messages,
  };

  try {
    const mistralResponse = await fetch(MISTRAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamBody),
    });

    const responseText = await mistralResponse.text();
    let responseJson;

    try {
      responseJson = JSON.parse(responseText);
    } catch (error) {
      sendJson(response, 502, {
        error: "Mistral returned an invalid JSON response.",
      });
      return;
    }

    sendJson(response, mistralResponse.status, responseJson);
  } catch (error) {
    sendJson(response, 502, {
      error: "Could not reach Mistral from the backend server.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Routine backend listening on http://localhost:${PORT}`);
});
