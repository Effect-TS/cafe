import { expect } from "@effect/vitest";
import { Api } from "@cafe/api";
import type { ChatEvent } from "@cafe/api/chat/event";
import { ChatClient } from "@cafe/api/chat/client";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Test from "alchemy/Test/Vitest";
import * as Array from "effect/Array";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import * as HttpBody from "effect/http/HttpBody";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
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

// NOTE: for about 20s after a new Worker is created (every new stage, e.g.
// each PR in CI), requests intermittently 404 or fail to reach the Room
// Durable Object. Wait until /health passes continuously for 10 seconds.
const healthy = (url: string) =>
  Effect.forEach(
    Array.range(1, 10),
    () =>
      HttpClient.get(`${url}/health`).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.andThen(Effect.sleep("1 second")),
      ),
    { discard: true },
  ).pipe(Effect.retry({ schedule: Schedule.spaced("1 second"), times: 60 }));

const stack = beforeAll(
  Effect.gen(function* () {
    const outputs = yield* deploy(Stack);
    yield* healthy(outputs.url);
    return outputs;
  }),
);

const flag = (name: string) =>
  Effect.runSync(Config.Boolean(name).pipe(Config.withDefault(false)));

// NOTE: in dev mode (ALCHEMY_DEV=1) `destroy` hangs past the hook timeout, and
// there is nothing deployed to tear down, so only destroy live deployments.
afterAll.skipIf(flag("NO_DESTROY") || flag("ALCHEMY_DEV"))(destroy(Stack));

const uniqueKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;


/** Subscribe to a chat's `events` stream over its WebSocket and queue the events. */
const subscribe = (url: string, key: string) =>
  Effect.gen(function* () {
    const client = yield* Layer.build(ChatClient.layer(url, key)).pipe(
      Effect.map(Context.get(ChatClient)),
    );
    const events = yield* Queue.unbounded<ChatEvent>();
    yield* client.events().pipe(
      Stream.runForEach((event) => Queue.offer(events, event)),
      Effect.forkScoped,
    );
    return { next: Queue.take(events) };
  });

test(
  "health answers ok",
  Effect.gen(function* () {
    const { url } = yield* stack;

    const response = yield* HttpClient.get(`${url}/health`);

    expect(response.status).toBe(200);
    expect(yield* response.text).toBe("ok");
  }),
);

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
    expect(message.role).toBe("user");
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
  { timeout: 60_000 },
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
    const posted = (event: ChatEvent) =>
      event._tag === "MessagePosted" ? event.message : undefined;

    // Each prompt is followed by its assistant reply; deltas are not replayed.
    expect(posted(yield* late.next)).toEqual(first);
    expect(posted(yield* late.next)?.role).toBe("assistant");
    expect(posted(yield* late.next)).toEqual(second);
    expect(posted(yield* late.next)?.role).toBe("assistant");
  }).pipe(
    Effect.scoped,
    Effect.provide(Socket.layerWebSocketConstructorGlobal),
  ),
  { timeout: 120_000 },
);

test(
  "a prompt streams an assistant response",
  Effect.gen(function* () {
    const { url } = yield* stack;
    const client = yield* HttpApiClient.make(Api, { baseUrl: url });
    const key = uniqueKey("stream");

    const subscriber = yield* subscribe(url, key);
    const sent = yield* client.Chat.sendPrompt({
      params: { key },
      payload: { text: "Say hello in five words." },
    });

    expect(yield* subscriber.next).toEqual({
      _tag: "MessagePosted",
      message: sent,
    });

    // ResponseDelta* then the assistant's MessagePosted, all with one id.
    const deltas: Array<string> = [];
    let event = yield* subscriber.next;
    while (event._tag === "ResponseDelta") {
      deltas.push(event.text);
      event = yield* subscriber.next;
    }

    expect(event._tag).toBe("MessagePosted");
    if (event._tag !== "MessagePosted") return;
    expect(event.message.role).toBe("assistant");
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join("")).toBe(event.message.text);
    // Regression: each chunk used to be emitted twice in a row.
    const pairsRepeat = deltas.every(
      (delta, i) => i % 2 === 0 || delta === deltas[i - 1],
    );
    expect(pairsRepeat).toBe(false);
  }).pipe(
    Effect.scoped,
    Effect.provide(Socket.layerWebSocketConstructorGlobal),
  ),
  { timeout: 60_000 },
);
