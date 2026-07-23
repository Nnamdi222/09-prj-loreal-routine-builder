# Project 9: L'Oréal Routine Builder

L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder.

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

## Cloudflare Worker setup

This project sends the frontend `messages` array to a Cloudflare Worker. The Worker talks to OpenAI, so the API key stays off the frontend.

1. Create or open your Cloudflare Worker project.
2. Use the files in this repo:
   - `worker.js`
   - `wrangler.toml`
3. Add your OpenAI key as a Worker secret:

```bash
wrangler secret put OPENAI_API_KEY
```

4. Deploy the Worker:

```bash
wrangler deploy
```

5. Copy the deployed `https://...workers.dev/` URL into `script.js` as `WORKER_URL`.

The Worker expects a JSON request like this:

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

The Worker returns the standard OpenAI chat completion response, so the frontend can keep reading:

```js
data.choices[0].message.content;
```
