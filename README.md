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
    test/
      api.test.ts          deploys the Worker with Test.make and drives the API (HTTP + WebSocket)
      chat/
        group.ts             ChatLive: Layer implementing the Chat group
        send-prompt.ts       sendPrompt handler (binds Room)
        events.ts            events handler (binds Room)
        room.ts              Durable Object: one per chat key, fans events out to sockets
  frontend/                @cafe/frontend: Foldkit SPA, builds its client from @cafe/api
    src/
      story.test.ts        Story tests: update, Messages, and Commands (pure)
      scene.test.ts        Scene tests: interactions through the rendered view (pure)
    test/
      chat.test.ts         e2e: deploys the Worker + site with Test.make, drives Chromium via Playwright
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

Backend tests and frontend e2e tests deploy to Cloudflare (stage `test_$USER`) and destroy what they deployed afterwards. Set `ALCHEMY_DEV=1` to run them against local workerd/Vite instead, and `ALCHEMY_PROFILE` to pick the Alchemy profile:

```sh
pnpm --filter @cafe/frontend test                          # Story + Scene unit tests
ALCHEMY_PROFILE=testing pnpm --filter @cafe/backend test   # API integration tests
ALCHEMY_PROFILE=testing pnpm --filter @cafe/frontend test:e2e
ALCHEMY_PROFILE=testing ALCHEMY_DEV=1 pnpm --filter @cafe/frontend test:e2e
```

The e2e tests need Playwright's Chromium: `pnpm --filter @cafe/frontend exec playwright install chromium`.
