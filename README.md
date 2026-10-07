# cafe

A minimal chat app built with the CAFE stack (Cloudflare, Alchemy, Foldkit, Effect).

[![Demo: alchemy deploy, chat in the browser, alchemy dev, pnpm test, ALCHEMY_DEV=1 pnpm test](https://pub-68e74efbba3b4272943c198da363bcab.r2.dev/main/demo.gif?v=2)](https://pub-68e74efbba3b4272943c198da363bcab.r2.dev/main/demo.mp4)

<sub>Recorded by CI from `main` with [tcut](https://github.com/AmanVarshney01/tcut) ([`packages/demos/demo.video.ts`](packages/demos/demo.video.ts)) and hosted in R2 (`stacks/github.ts`). Every PR gets a demo comment with a demo of that PR. Locally: `pnpm demo`. Click for the MP4.</sub>

## How agents build here

Coding agents do most of the work in this repo, and every change is test-driven against real infrastructure. An agent writes a failing test first: a Playwright test for the website, an API test for the backend, or a Foldkit Story or Scene test for the UI logic. It gets the test passing locally with `alchemy dev`, then reruns it against real Cloudflare with `pnpm test`.

Agents work in parallel, each in its own git worktree and on its own PR. Every PR gets a preview deployment and a recorded demo video, so you can review a change by watching it work. Small PRs, merged often.

The details are in [AGENTS.md](AGENTS.md).

## Repo

```
AGENTS.md                  how we build: TDD with Alchemy-deployed tests, demos, parallel worktrees
alchemy.run.ts             stack: `@cafe/backend` Worker + Foldkit Website (VITE_API_URL -> Api url), PR preview comment in CI
stacks/
  github.ts                stack: CI infra: Cloudflare credentials as Actions secrets, public R2 bucket for demos
.github/workflows/
  ci.yml                   check → live tests → deploy → demo, one stage per PR
  cleanup.yml              destroys a PR's stages when it closes
packages/
  api/                     @cafe/api: HTTP API + RPC schemas, safe to import from the browser
    src/
      api.ts               Api (the `.` export)
      chat/                `@cafe/api/chat`
        index.ts             Chat: the HttpApi group
        send-prompt.ts       POST /chats/:key/prompts
        message.ts           ChatMessage
        event.ts             ChatEvent
      room/                `@cafe/api/room`
        index.ts             Room: the RpcGroup, reached over a WebSocket at /chats/:key/room
        events.ts            events: history, then live ChatEvents (a stream)
        send-prompt.ts       sendPrompt
        ping.ts              ping
        connect.ts           connect: a Room client over its WebSocket
  backend/                 @cafe/backend: Worker (the `.` export) implementing @cafe/api
    src/
      worker.ts            Worker: forwards /chats/:key/room to the Room, serves Api with ChatLive
      chat/
        index.ts             ChatLive: Layer implementing the Chat group
        send-prompt.ts       sendPrompt handler (forwards to the Room)
      room/
        index.ts             Room: RpcDurableObject implementing @cafe/api/room, one per chat key
        events.ts            events handler
        send-prompt.ts       sendPrompt handler
        ping.ts              ping handler
        history.ts           History: the chat's messages in storage
        broadcast.ts         Broadcast: live events to every open stream
        post.ts              Post: append to History and broadcast
        reply.ts             Reply: stream the Workers AI reply
    test/
      api.test.ts          deploys the Worker with Test.make and drives the API (HTTP + RPC)
  demos/                   @cafe/demos: the README demo, recorded with tcut (terminal + browser pane)
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
pnpm run deploy # alchemy deploy (`pnpm deploy` is a built-in pnpm command)
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

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:

1. **check**: typecheck, lint, frontend unit tests.
2. **test**: backend API tests and Playwright e2e tests against real Cloudflare, in stage `test-pr-<number>` (each suite destroys what it deployed).
3. **deploy**: `alchemy deploy` to stage `pr-<number>` (or `prod` on `main`), with a PR comment linking the preview.
4. **demo**: records the demo (macOS, tcut) and uploads it to the demos bucket: `pr-<number>/<sha>/` goes into the PR's demo comment, `main/` is the README demo. PR demos expire after 30 days.
5. **cleanup** (`cleanup.yml`): when a PR closes, waits for the PR's CI runs to finish, then `alchemy destroy`s its `pr-<number>` and demo stages. It is a separate workflow so no CI run can cancel it.

CI authenticates with the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. `stacks/github.ts` writes them from the profile it is deployed with, which must use a Cloudflare API token (requires admin on the repository):

```sh
pnpm exec alchemy deploy --config stacks/github.ts --profile testing
```
