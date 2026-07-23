# Project 9: L'Oréal Routine Builder

L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder.

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

## Backend setup (no Cloudflare)

This project sends the frontend `messages` array to a local backend server. The backend talks to Mistral, so the API key stays off the frontend.

1. Set your Mistral key as an environment variable:

```bash
export MISTRAL_API_KEY="your_mistral_key_here"
```

2. Start the backend server in this repo:

```bash
node server.js
```

3. Keep `script.js` set to:

```js
const BACKEND_URL = "http://localhost:8787/chat";
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
