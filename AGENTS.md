# AGENTS.md

cafe is a chat app built with the CAFE stack: **C**loudflare, **A**lchemy, **F**oldkit, **E**ffect. The [README](README.md) has the full file tree, commands and CI pipeline. This file covers how we build.

## How we build

Tests drive the work, and real infrastructure runs from the first test. Each change goes through the same loop:

1. Write a failing test at the layer the change affects (see [Testing](#testing)).
2. Make it pass against local workerd with `ALCHEMY_DEV=1`, which is fast.
3. Run the same suites against real Cloudflare without `ALCHEMY_DEV`.
4. Open a PR. CI deploys a preview, runs every suite and records a demo video.
5. Merge, then pick up the next change.

Keep changes small and PRs short-lived. Use worktrees to run several changes in parallel ([Parallel work](#parallel-work)).

## Repo

```
alchemy.run.ts         the app stack: @cafe/backend Worker + Foldkit Website
stacks/github.ts       CI infra (secrets, demos bucket)
.agents/skills/        agent skills (foldkit, generate-program, audit-program), symlinked into .claude/skills
references/repos/      gitignored source checkouts to explore, e.g. Foldkit at its pinned release (see the foldkit skill)
flake.nix              dev shell: Node, pnpm, cloudflared, Bun, ffmpeg
packages/
  api/                 @cafe/api: schemas only (HttpApi + RpcGroups); imported by the browser, so only `effect`
  backend/             @cafe/backend: the Worker and Durable Objects implementing @cafe/api
  frontend/            @cafe/frontend: Foldkit SPA
  demos/               @cafe/demos: the demo video, recorded with tcut
```

`api` and `backend` mirror each other by domain. `packages/api/src/room/index.ts` exposes the `Room` RpcGroup with one file per RPC. `packages/backend/src/room/index.ts` is the Durable Object that implements it, with one handler file per RPC.

## Testing

| Layer | File | What it covers | Command |
| --- | --- | --- | --- |
| Story | `packages/frontend/src/story.test.ts` | `update`: Message in, Model + Commands out (pure) | `pnpm --filter @cafe/frontend test` |
| Scene | `packages/frontend/src/scene.test.ts` | user interactions through the rendered view (pure) | `pnpm --filter @cafe/frontend test` |
| API | `packages/backend/test/api.test.ts` | deploys the Worker with `Test.make`, drives HTTP + RPC | `pnpm --filter @cafe/backend test` |
| e2e | `packages/frontend/test/chat.test.ts` | deploys Worker + site, drives Chromium with Playwright | `pnpm --filter @cafe/frontend test:e2e` |

Every behavior gets an e2e test: an API test for the backend, a Playwright test for the website. Story and Scene tests cover the frontend logic between those, and they run in milliseconds.

**Story**: send a Message to `update` and assert on the Model and Commands.

```ts
story(
  update,
  given(modifyFields(idleModel, { chatKeyInput: () => '  kitchen  ' })),
  message(Message.SubmittedChatKey()),
  model(model => {
    expect(model.connection).toEqual(ConnectionState.Connecting({ chatKey: 'kitchen' }))
  }),
)
```

**Scene**: interact with the rendered view; resolve Commands, ManagedResources and Subscriptions by hand.

```ts
scene(
  { update, view },
  given(connectedModel),
  type(placeholder('Type a prompt…'), 'hello'),
  click(role('button', { name: 'Send' })),
  Command.expectExact(SendPrompt({ chatKey: 'lobby', text: 'hello' })),
  Command.resolve(SendPrompt, Message.SucceededSendPrompt()),
)
```

**API**: `Test.make` deploys the stack once per file in `beforeAll` and destroys it afterwards.

```ts
test(
  "sendPrompt returns the posted message",
  Effect.gen(function* () {
    const { url } = yield* stack;
    const client = yield* HttpApiClient.make(Api, { baseUrl: url });
    const message = yield* client.Chat.sendPrompt({ params: { key }, payload: { text: "hello" } });
    expect(message.role).toBe("user");
  }),
);
```

**e2e**: the same stack plus the Foldkit site, driven with Playwright.

```ts
test(
  'a user joins a chat and sees their message',
  Effect.gen(function* () {
    const page = yield* openSite
    yield* joinChat(page, chatKey)
    yield* sendPrompt(page, 'hello from playwright')
    yield* waitForMessage(page, 'hello from playwright')
  }).pipe(Effect.scoped),
)
```

## The loop

```sh
nix develop                        # optional: Node, pnpm, cloudflared, Bun, ffmpeg
pnpm install
pnpm --filter @cafe/frontend exec playwright install chromium   # once

export ALCHEMY_PROFILE=testing     # your Alchemy profile (pnpm exec alchemy profile edit --add Cloudflare)

pnpm dev                           # alchemy dev: Worker in workerd + Vite, against real cloud resources

# red → green, locally
ALCHEMY_DEV=1 pnpm --filter @cafe/backend test
ALCHEMY_DEV=1 pnpm --filter @cafe/frontend test:e2e
pnpm --filter @cafe/frontend test   # Story + Scene: run these constantly

# then against real Cloudflare (deploys stage test_$USER, destroys it after)
pnpm test
pnpm --filter @cafe/frontend test:e2e

# before every push
pnpm typecheck && pnpm lint
```

`NO_DESTROY=1` keeps a test stage deployed between runs, so you can iterate without redeploying each time.

## Demos

Every PR gets a demo video comment, recorded by CI from `packages/demos/demo.video.ts`. Merging to `main` updates the README demo. When a change affects what the demo shows, update `demo.video.ts` in the same PR.

To record locally (needs Bun and ffmpeg; writes `packages/demos/out/demo.mp4`):

```sh
pnpm demo
```

Usually you can skip this and let the PR record it.

## Parallel work

Fan out: give each change its own worktree, branch, stages and PR.

```sh
git fetch origin
git worktree add ../cafe-<topic> -b feat/<topic> origin/main
cd ../cafe-<topic> && pnpm install

# separate stages, so worktrees don't deploy over each other
export ALCHEMY_STAGE=dev_<topic>          # alchemy dev / deploy
export ALCHEMY_TEST_STAGE=test_<topic>    # Test.make
```

Push early. Each PR gets its own `pr-<number>` preview, test stages and demo, and CI cancels superseded runs on a PR, so pushing often is cheap. Merge as soon as CI is green, then rebase the other worktrees onto `origin/main`. When you're done with a worktree, remove it with `git worktree remove ../cafe-<topic>`.

## Conventions

- **One file, one responsibility; domain folders.** Name files after the domain (`room/history.ts`, `chat/send-prompt.ts`), not the mechanism (`rpcs.ts`, `client.ts`, `group.ts`). A folder's `index.ts` exposes its group or class.
- **Name effectful functions with `Effect.fn`**, never an arrow function that returns `Effect.gen`:
  ```ts
  return Effect.fn("Room.reply")(function* (key: string, conversation: ReadonlyArray<ChatMessage>) {
    ...
  });
  ```
- **Read configuration with `effect/Config`**, never `process.env`.
- **`@cafe/api` imports only `effect`** (`pnpm lint` enforces this), because it ships to the browser.
- **PR titles use Conventional Commits** (`feat:`, `fix:`, `refactor:`, `chore:` for CI and tooling). PR descriptions show code snippets rather than prose.
