import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as LanguageModel from "effect/ai/LanguageModel";
import type * as Prompt from "effect/ai/Prompt";
import type * as Response from "effect/ai/Response";
import type { ChatEvent } from "@cafe/api/chat/event";
import { ChatMessage } from "@cafe/api/chat/message";
import { ChatRpcs } from "@cafe/api/chat/rpcs";

const MESSAGES_KEY = "messages";
const MESSAGES_LIMIT = 100;
const CONTEXT_MESSAGES = 20;

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const SYSTEM_PROMPT =
  "You are a friendly assistant in a group chat. Reply concisely in plain text.";

const posted = (message: ChatMessage): ChatEvent => ({
  _tag: "MessagePosted",
  message,
});

/**
 * One Room per chat key, serving `ChatRpcs` over WebSockets (and HTTP).
 * Messages are kept in storage; live events (posted messages and streaming
 * reply deltas) fan out to every `events` stream through an in-memory PubSub.
 * An open `events` stream keeps the Room in memory.
 */
export default class Room extends Cloudflare.RpcDurableObject<Room>()(
  "Room",
  { schema: ChatRpcs },
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;
    const ai = yield* Cloudflare.Workers.AI();
    const languageModel = ai.model({
      model: MODEL,
      parameters: { maxTokens: 512 },
    });

    return Effect.gen(function* () {
      yield* Effect.log("TODO: bindings");

      const events = yield* PubSub.unbounded<ChatEvent>();

      const messages = state.storage
        .get<ReadonlyArray<ChatMessage>>(MESSAGES_KEY)
        .pipe(Effect.map((stored) => stored ?? []));

      const post = (message: ChatMessage) =>
        Effect.gen(function* () {
          const history = yield* messages;
          yield* state.storage.put(
            MESSAGES_KEY,
            [...history, message].slice(-MESSAGES_LIMIT),
          );
          yield* PubSub.publish(events, posted(message));
        });

      /** Streams the model's reply as ResponseDeltas, then posts it. */
      const reply = (
        key: string,
        prompt: ReadonlyArray<Prompt.MessageEncoded>,
      ) =>
        Effect.gen(function* () {
          const responseId = crypto.randomUUID();
          yield* LanguageModel.streamText({ prompt }).pipe(
            Stream.filter(
              (part): part is Response.TextDeltaPart => part.type === "text-delta",
            ),
            Stream.map((part) => part.delta),
            Stream.runFoldEffect(
              () => "",
              (text, delta) =>
                PubSub.publish(events, {
                  _tag: "ResponseDelta",
                  responseId,
                  text: delta,
                }).pipe(Effect.as(text + delta)),
            ),
            Effect.flatMap((text) =>
              post(
                ChatMessage.make({
                  id: responseId,
                  key,
                  role: "assistant",
                  text,
                  sentAt: Date.now(),
                }),
              ),
            ),
            Effect.catch((error) =>
              PubSub.publish(events, {
                _tag: "ResponseFailed",
                responseId,
                error: String(error),
              }),
            ),
            Effect.provide(languageModel),
          );
        });

      return ChatRpcs.toLayer({
        events: () =>
          Stream.unwrap(
            Effect.gen(function* () {
              // Subscribe before reading history, so nothing posted in
              // between is missed.
              const live = yield* PubSub.subscribe(events);
              const history = yield* messages;
              return Stream.concat(
                Stream.fromIterable(history.map(posted)),
                Stream.fromSubscription(live),
              );
            }).pipe(Effect.orDie),
          ),
        sendPrompt: ({ key, text }) =>
          Effect.gen(function* () {
            const conversation = (yield* messages)
              .slice(-CONTEXT_MESSAGES)
              .map(
                (message): Prompt.MessageEncoded => ({
                  role: message.role,
                  content: message.text,
                }),
              );
            const message = ChatMessage.make({
              id: crypto.randomUUID(),
              key,
              role: "user",
              text,
              sentAt: Date.now(),
            });
            yield* post(message);
            yield* reply(key, [
              { role: "system", content: SYSTEM_PROMPT },
              ...conversation,
              { role: "user", content: text },
            ]);
            return message;
          }).pipe(Effect.orDie),
        ping: () => Effect.void,
      });
    });
  }).pipe(Effect.provide(Cloudflare.Workers.AIBinding)),
) {}
