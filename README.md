# cafe

A minimal chat app built with Alchemy, Foldkit, and Effect HTTP, deployed to Cloudflare.

```
alchemy.run.ts             stack: `@cafe/backend` Worker + Foldkit Website (VITE_API_URL -> Api url)
packages/
  api/                     @cafe/api: HTTP API schema, safe to import from the browser
    src/
      api.ts               Api (the `.` export)
      chat/                `@cafe/api/chat/*`
        group.ts             Chat group
        send-prompt.ts       POST /chats/:key/prompts
        events.ts            GET  /chats/:key/events (WebSocket)
        message.ts           ChatMessage
        event.ts             ChatEvent (WebSocket frames)
  backend/                 @cafe/backend: Worker (the `.` export) implementing @cafe/api
    src/
      worker.ts            Worker: serves Api with ChatLive
      chat/
        group.ts             ChatLive: Layer implementing the Chat group
        send-prompt.ts       sendPrompt handler (binds Room)
        events.ts            events handler (binds Room)
        room.ts              Durable Object: one per chat key, fans events out to sockets
  frontend/                @cafe/frontend: Foldkit SPA, builds its client from @cafe/api
```

`@cafe/api` may only import `effect` and its own files; `pnpm lint` enforces this (`packages/api/.oxlintrc.json`).

```sh
pnpm install
pnpm exec alchemy profile edit --add Cloudflare   # first time only
pnpm dev        # alchemy dev: Worker in workerd + Vite dev server for the frontend
pnpm deploy     # alchemy deploy
pnpm typecheck  # tsc --build across all packages
pnpm test
pnpm lint
```
