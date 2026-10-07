import { expect } from "@effect/vitest";
import { Api } from "@cafe/api";
import { ChatEventJson, type ChatEvent } from "@cafe/api/chat/event";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Test from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as HttpBody from "effect/http/HttpBody";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import * as Socket from "effect/socket/Socket";
import ApiWorker from "../src/worker.ts";

const Stack = Alchemy.Stack(
  "CafeApiTest",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const api = yield* ApiWorker;
    return { url: api.url.as<string>() };
  }),
);

const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Cloudflare.providers(),
  state: Cloudflare.state(),
});

// NOTE: right after a new Worker is created (every new stage, e.g. each PR in
// CI), its workers.dev URL answers 404 and calls into the Room Durable Object
// answer 500 for several seconds. Wait until a prompt round-trips through both.
const stack = beforeAll(
  Effect.gen(function* () {
    const outputs = yield* deploy(Stack);
    yield* Test.executeWhenReady(
      HttpClientRequest.post(`${outputs.url}/chats/ready/prompts`, {
        body: HttpBody.jsonUnsafe({ text: "ready" }),
      }),
    );
    return outputs;
  }),
);

// NOTE: in dev mode (ALCHEMY_DEV=1) `destroy` hangs past the hook timeout, and
// there is nothing deployed to tear down, so only destroy live deployments.
afterAll.skipIf(!!process.env.NO_DESTROY || !!process.env.ALCHEMY_DEV)(
  destroy(Stack),
);

const uniqueKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const decodeEvent = Schema.decodeUnknownEffect(ChatEventJson);

/** Open a WebSocket on a chat's events stream and collect decoded frames. */
const subscribe = (url: string, key: string) =>
  Effect.gen(function* () {
    const urls = HttpApiClient.urlBuilder(Api, { baseUrl: url });
    const socket = yield* Socket.makeWebSocket(
      urls.Chat.events({ params: { key } }).replace(/^http/, "ws"),
    );
    // Acquiring the reader dials the socket and waits for it to open.
    const pull = yield* Socket.readerString(socket);
    const events = yield* Queue.unbounded<ChatEvent>();

    yield* pull.pipe(
      Effect.flatMap((frames) =>
        Effect.forEach(frames, (frame) =>
          decodeEvent(frame).pipe(
            Effect.flatMap((event) => Queue.offer(events, event)),
          ),
        ),
      ),
      Effect.forever,
      Effect.ignore,
      Effect.forkScoped,
    );

    return { next: Queue.take(events) };
  });

test(
  "sendPrompt returns the posted message",
  Effect.gen(function* () {
    const { url } = yield* stack;
    const client = yield* HttpApiClient.make(Api, { baseUrl: url });
    const key = uniqueKey("send");

    const message = yield* client.Chat.sendPrompt({
      params: { key },
      payload: { text: "hello" },
    });

    expect(message.key).toBe(key);
    expect(message.text).toBe("hello");
  }),
);

test(
  "sendPrompt rejects an empty prompt",
  Effect.gen(function* () {
    const { url } = yield* stack;

    const response = yield* HttpClient.execute(
      HttpClientRequest.post(`${url}/chats/${uniqueKey("empty")}/prompts`, {
        body: HttpBody.jsonUnsafe({ text: "" }),
      }),
    );

    expect(response.status).toBe(400);
  }),
);

test(
  "events requires a WebSocket upgrade",
  Effect.gen(function* () {
    const { url } = yield* stack;

    const response = yield* HttpClient.get(
      `${url}/chats/${uniqueKey("plain")}/events`,
    );

    expect(response.status).toBe(426);
  }),
);

test(
  "a prompt is broadcast to every subscriber of its key",
  Effect.gen(function* () {
    const { url } = yield* stack;
    const client = yield* HttpApiClient.make(Api, { baseUrl: url });
    const key = uniqueKey("broadcast");

    const alice = yield* subscribe(url, key);
    const bob = yield* subscribe(url, key);

    const sent = yield* client.Chat.sendPrompt({
      params: { key },
      payload: { text: "hello room" },
    });

    const expected: ChatEvent = { _tag: "MessagePosted", message: sent };
    expect(yield* alice.next).toEqual(expected);
    expect(yield* bob.next).toEqual(expected);
  }).pipe(
    Effect.scoped,
    Effect.provide(Socket.layerWebSocketConstructorGlobal),
  ),
  { timeout: 30_000 },
);

test(
  "a new subscriber receives earlier messages",
  Effect.gen(function* () {
    const { url } = yield* stack;
    const client = yield* HttpApiClient.make(Api, { baseUrl: url });
    const key = uniqueKey("history");

    const first = yield* client.Chat.sendPrompt({
      params: { key },
      payload: { text: "first" },
    });
    const second = yield* client.Chat.sendPrompt({
      params: { key },
      payload: { text: "second" },
    });

    const late = yield* subscribe(url, key);

    expect(yield* late.next).toEqual({ _tag: "MessagePosted", message: first });
    expect(yield* late.next).toEqual({ _tag: "MessagePosted", message: second });
  }).pipe(
    Effect.scoped,
    Effect.provide(Socket.layerWebSocketConstructorGlobal),
  ),
  { timeout: 30_000 },
);
