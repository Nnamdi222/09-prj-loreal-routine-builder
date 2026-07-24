/*
  Cloudflare Worker for the L'Oreal Routine Builder.
  Add OPENAI_API_KEY as a Worker secret in Cloudflare. It never belongs in
  this file or in the frontend.
*/

const OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* Return JSON with the CORS headers needed by the frontend. */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

/* Handle chat requests while keeping the OpenAI secret on Cloudflare. */
async function handleChatRequest(request, env) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse(
      { error: "OPENAI_API_KEY is not configured in the Cloudflare Worker." },
      503,
    );
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse(
      { error: "A non-empty messages array is required." },
      400,
    );
  }

  try {
    const openAiResponse = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: body.model || DEFAULT_MODEL,
        messages: body.messages,
      }),
    });

    const responseData = await openAiResponse.json();

    if (!openAiResponse.ok) {
      return jsonResponse(
        {
          error:
            responseData.error?.message ||
            "OpenAI could not generate a routine right now.",
        },
        openAiResponse.status,
      );
    }

    return jsonResponse(responseData, openAiResponse.status);
  } catch (error) {
    return jsonResponse(
      { error: "Could not reach OpenAI. Please try again." },
      502,
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        status: env.OPENAI_API_KEY ? "ok" : "missing-key",
        mode: env.OPENAI_API_KEY ? "live-ai" : "unconfigured",
      });
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      return handleChatRequest(request, env);
    }

    return jsonResponse({ error: "Route not found." }, 404);
  },
};
