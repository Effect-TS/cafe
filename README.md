# cafe

A minimal chat app built with Alchemy, Foldkit, and Effect HTTP, deployed to Cloudflare.

```
packages/
  backend/                 @cafe/backend: Alchemy stack, Worker, Durable Object
    alchemy.run.ts         stack: Api Worker + Foldkit Website (VITE_API_URL -> Api url)
    src/
      api.ts               ChatApi, the `@cafe/backend/api` export (schema only, browser-safe)
      chat.ts              ChatGroup schema
      send-prompt.ts       POST /chats/:key/prompts endpoint schema
      events.ts            GET  /chats/:key/events WebSocket endpoint schema
      chat-message.ts      ChatMessage schema
      chat-event.ts        ChatEvent schema (WebSocket frames)
      chat.live.ts         Layer implementing ChatGroup from the handler layers
      send-prompt.live.ts  sendPrompt handler layer (binds Room)
      events.live.ts       events handler layer (binds Room)
      room.ts              Durable Object: one per chat key, fans events out to sockets
      worker.ts            Worker: wires ChatApi + ChatLive into a fetch handler
  frontend/                @cafe/frontend: Foldkit SPA, uses `@cafe/backend/api` for its client
```

Rule: `api.ts` and everything it imports stay schema-only. Implementations live in `*.live.ts`, which only `worker.ts` pulls in.

```sh
pnpm install
pnpm --filter @cafe/backend exec alchemy profile edit --add Cloudflare   # first time only
pnpm dev        # alchemy dev: Worker in workerd + Vite dev server for the frontend
pnpm deploy     # alchemy deploy
pnpm typecheck  # tsc --build across all packages
pnpm test
```
