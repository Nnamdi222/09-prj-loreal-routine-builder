# Project 9: L'Oréal Routine Builder

L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder.

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

## Backend setup (free OpenAI-compatible chat)

This project sends the frontend `messages` array to a local backend server. The backend uses a free OpenAI-compatible model through OpenRouter, so API keys stay off the frontend. The same server also serves the frontend files, so chat requests use the same origin.

1. (Optional, recommended) Set your OpenRouter key as an environment variable:

```bash
export OPENROUTER_API_KEY="your_openrouter_key_here"
```

If you skip this, the app still replies using a local fallback mode.

2. Start the backend server in this repo:

```bash
node server.js
```

Then open the app from the same server URL:

```text
http://localhost:8787
```

3. Keep `script.js` set to:

```js
const BACKEND_URL = "/chat";
```

The backend expects a JSON request like this:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a L'Oréal skincare and beauty advisor..."
    },
    {
      "role": "user",
      "content": "Build a routine using these selected products..."
    }
  ]
}
```

The backend returns a standard chat completion response, so the frontend can keep reading:

```js
data.choices[0].message.content;
```
