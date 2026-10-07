# cafe

A minimal chat app built with Alchemy, Foldkit, and Effect HTTP, deployed to Cloudflare.

- `src/api.ts`: shared Effect `HttpApi` schema (`POST /chats/:key/prompts`, `GET /chats/:key/events` WebSocket), used by both the server and the client
- `src/worker.ts`: Cloudflare Worker that implements `ChatApi`
- `src/room.ts`: Durable Object, one per chat key, that fans events out to WebSocket subscribers
- `web/`: Foldkit SPA that joins a key, streams events, and posts prompts
- `alchemy.run.ts`: stack containing the Worker, plus the Foldkit `Website` with `VITE_API_URL` wired to the Worker URL

```sh
bun install
bun alchemy profile edit --add Cloudflare   # first time only
bun alchemy dev      # local dev (Worker in workerd, Vite dev server for web)
bun alchemy deploy   # deploy to Cloudflare
```
