# cafe

A minimal chat app built with Alchemy, Foldkit, and Effect HTTP, deployed to Cloudflare.

```
alchemy.run.ts             stack: `@cafe/backend` Worker + Foldkit Website (VITE_API_URL -> Api url)
packages/
  backend/                 @cafe/backend: Worker (`.` export) and Durable Object
    src/
      api.ts               Api, the `@cafe/backend/api` export (schema only, browser-safe)
      worker.ts            Worker: wires Api + ChatLive into a fetch handler
      chat/
        chat.ts              Chat group schema
        send-prompt.ts       POST /chats/:key/prompts endpoint schema
        events.ts            GET  /chats/:key/events WebSocket endpoint schema
        chat-message.ts      ChatMessage schema
        chat-event.ts        ChatEvent schema (WebSocket frames)
        chat.live.ts         Layer implementing Chat from the handlers
        send-prompt.live.ts  sendPrompt handler (binds Room)
        events.live.ts       events handler (binds Room)
        room.ts              Durable Object: one per chat key, fans events out to sockets
  frontend/                @cafe/frontend: Foldkit SPA, uses `@cafe/backend/api` for its client
```

Rule: `api.ts` and everything it imports stay schema-only. Implementations live in `*.live.ts`, which only `worker.ts` pulls in.

```sh
pnpm install
pnpm exec alchemy profile edit --add Cloudflare   # first time only
pnpm dev        # alchemy dev: Worker in workerd + Vite dev server for the frontend
pnpm deploy     # alchemy deploy
pnpm typecheck  # tsc --build across all packages
pnpm test
```
