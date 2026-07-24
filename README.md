# Project 9: L'Oréal Routine Builder

L’Oréal is expanding what’s possible with AI, and now your chatbot is getting smarter. This week, you’ll upgrade it into a product-aware routine builder.

Users will be able to browse real L’Oréal brand products, select the ones they want, and generate a personalized routine using AI. They can also ask follow-up questions about their routine—just like chatting with a real advisor.

## Cloudflare Worker setup

The frontend sends its complete `messages` array to a Cloudflare Worker. The
Worker calls OpenAI, keeping the API key out of the browser and this repository.

1. Log in to Cloudflare from this project folder:

```bash
npx wrangler login
```

2. Deploy the Worker:

```bash
npx wrangler deploy
```

Copy the `https://...workers.dev` URL that Wrangler prints.

3. In `script.js`, replace the placeholder value in `WORKER_URL` with that URL.

4. Add the API key directly to Cloudflare's secure secret prompt:

```bash
npx wrangler secret put OPENAI_API_KEY
```

When the terminal displays `Enter a secret value:`, paste the key there and
press Enter. Do not put the key in a file and do not send it in chat.

5. Publish the frontend using a static host such as Cloudflare Pages or GitHub
   Pages. The Worker allows browser requests with CORS, so the app can be hosted
   separately from the API.

The Worker expects a JSON request like this:

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
