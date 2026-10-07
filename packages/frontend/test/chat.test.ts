import { fileURLToPath } from 'node:url'

import { Api } from '@cafe/api'
import ApiWorker from '@cafe/backend'
import { expect } from '@effect/vitest'
import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as HttpApiClient from 'effect/http-api/HttpApiClient'
import { type Browser, type Page, chromium } from 'playwright'

const Stack = Alchemy.Stack(
  'CafeE2E',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const api = yield* ApiWorker
    const web = yield* Cloudflare.Website.Foldkit('Web', {
      rootDir: fileURLToPath(new URL('..', import.meta.url)),
      env: {
        VITE_API_URL: api.url.as<string>(),
      },
    })
    return { apiUrl: api.url.as<string>(), url: web.url.as<string>() }
  }),
)

const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Cloudflare.providers(),
  state: Cloudflare.state(),
})

const stack = beforeAll(deploy(Stack))

// NOTE: in dev mode (ALCHEMY_DEV=1) `destroy` hangs past the hook timeout, and
// there is nothing deployed to tear down, so only destroy live deployments.
afterAll.skipIf(!!process.env.NO_DESTROY || !!process.env.ALCHEMY_DEV)(
  destroy(Stack),
)

const browser = beforeAll(Effect.promise(() => chromium.launch()))

afterAll(
  Effect.flatMap(browser, (instance: Browser) =>
    Effect.promise(() => instance.close()),
  ),
)

const uniqueKey = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

/** A fresh browser context (one user) on the site, closed with the scope. */
const openSite = Effect.gen(function* () {
  const { url } = yield* stack
  const instance = yield* browser
  const context = yield* Effect.acquireRelease(
    Effect.promise(() => instance.newContext()),
    context => Effect.promise(() => context.close()),
  )
  const page = yield* Effect.promise(() => context.newPage())
  yield* Effect.promise(() => page.goto(url))
  return page
})

const joinChat = (page: Page, chatKey: string) =>
  Effect.promise(async () => {
    await page.getByPlaceholder('Chat key, e.g. lobby').fill(chatKey)
    await page.getByRole('button', { name: 'Join chat' }).click()
    await page.getByPlaceholder('Type a prompt…').waitFor()
  })

const sendPrompt = (page: Page, text: string) =>
  Effect.promise(async () => {
    await page.getByPlaceholder('Type a prompt…').fill(text)
    await page.getByRole('button', { name: 'Send' }).click()
  })

const waitForMessage = (page: Page, text: string) =>
  Effect.promise(() =>
    page.getByRole('listitem').filter({ hasText: text }).waitFor(),
  )

const messageTexts = (page: Page) =>
  Effect.promise(() =>
    page.getByRole('listitem').locator('div').allInnerTexts(),
  )

test(
  'a user joins a chat and sees their message',
  Effect.gen(function* () {
    const page = yield* openSite
    const chatKey = uniqueKey('solo')

    yield* joinChat(page, chatKey)
    expect(
      yield* Effect.promise(() => page.getByText(`#${chatKey}`).isVisible()),
    ).toBe(true)

    yield* sendPrompt(page, 'hello from playwright')
    yield* waitForMessage(page, 'hello from playwright')
  }).pipe(Effect.scoped),
  { timeout: 60_000 },
)

test(
  'a message from one user appears for another in the same chat',
  Effect.gen(function* () {
    const alice = yield* openSite
    const bob = yield* openSite
    const chatKey = uniqueKey('pair')

    yield* joinChat(alice, chatKey)
    yield* joinChat(bob, chatKey)

    yield* sendPrompt(alice, 'hi bob')
    yield* waitForMessage(bob, 'hi bob')
  }).pipe(Effect.scoped),
  { timeout: 60_000 },
)

test(
  'joining a chat shows earlier messages in order',
  Effect.gen(function* () {
    const { apiUrl } = yield* stack
    const client = yield* HttpApiClient.make(Api, { baseUrl: apiUrl })
    const chatKey = uniqueKey('history')

    yield* client.Chat.sendPrompt({
      params: { key: chatKey },
      payload: { text: 'first' },
    })
    yield* client.Chat.sendPrompt({
      params: { key: chatKey },
      payload: { text: 'second' },
    })

    const page = yield* openSite
    yield* joinChat(page, chatKey)
    yield* waitForMessage(page, 'second')

    expect(yield* messageTexts(page)).toEqual(['first', 'second'])
  }).pipe(Effect.scoped),
  { timeout: 60_000 },
)

test(
  'leaving a chat returns to the chat key form',
  Effect.gen(function* () {
    const page = yield* openSite

    yield* joinChat(page, uniqueKey('leave'))
    yield* Effect.promise(() =>
      page.getByRole('button', { name: 'Leave' }).click(),
    )
    yield* Effect.promise(() =>
      page.getByRole('button', { name: 'Join chat' }).waitFor(),
    )
  }).pipe(Effect.scoped),
  { timeout: 60_000 },
)
