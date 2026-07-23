const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return jsonResponse(
        {
          error: "Use POST with a messages array.",
        },
        405,
      );
    }

    if (!env.OPENAI_API_KEY) {
      return jsonResponse(
        {
          error: "Missing OPENAI_API_KEY Worker secret.",
        },
        500,
      );
    }

    let payload;

    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse(
        {
          error: "Request body must be valid JSON.",
        },
        400,
      );
    }

    if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
      return jsonResponse(
        {
          error: "Request body must include a non-empty messages array.",
        },
        400,
      );
    }

    try {
      const openAiResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4.1",
            messages: payload.messages,
            temperature: 0.7,
          }),
        },
      );

      const responseText = await openAiResponse.text();

      if (!openAiResponse.ok) {
        return new Response(responseText, {
          status: openAiResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        });
      }

      return new Response(responseText, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      return jsonResponse(
        {
          error: "Unable to reach OpenAI right now.",
        },
        500,
      );
    }
  },
};
