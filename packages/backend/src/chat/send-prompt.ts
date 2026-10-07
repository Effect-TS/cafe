import * as Cloudflare from "alchemy/Cloudflare";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as LanguageModel from "effect/ai/LanguageModel";
import type * as Prompt from "effect/ai/Prompt";
import type * as Response from "effect/ai/Response";
import type * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import { ChatEventJson } from "@cafe/api/chat/event";
import { ChatMessage } from "@cafe/api/chat/message";
import type { SendPrompt } from "@cafe/api/chat/send-prompt";
import Room from "./room.ts";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CONTEXT_MESSAGES = 20;

const SYSTEM_PROMPT =
  "You are a friendly assistant in a group chat. Reply concisely in plain text.";

const encodeEvent = Schema.encodeSync(ChatEventJson);
const decodeEvent = Schema.decodeUnknownOption(ChatEventJson);

/** Earlier messages in the chat, oldest first, as model conversation turns. */
const toConversation = (
  frames: ReadonlyArray<string>,
): ReadonlyArray<Prompt.MessageEncoded> =>
  Array.flatMap(frames, (frame) =>
    decodeEvent(frame).pipe(
      Option.filter((event) => event._tag === "MessagePosted"),
      Option.map(
        ({ message }): Prompt.MessageEncoded => ({
          role: message.role,
          content: message.text,
        }),
      ),
      Option.toArray,
    ),
  ).slice(-CONTEXT_MESSAGES);

export const SendPromptHandler = Effect.gen(function* () {
  const rooms = yield* Room;
  const ai = yield* Cloudflare.Workers.AI();
  const languageModel = ai.model({
    model: MODEL,
    parameters: { maxTokens: 512 },
  });

  return ({ params, payload }: HttpApiEndpoint.Request<typeof SendPrompt>) =>
    Effect.gen(function* () {
      const room = rooms.getByName(params.key);
      const conversation = toConversation(yield* room.history());

      const message = ChatMessage.make({
        id: crypto.randomUUID(),
        key: params.key,
        role: "user",
        text: payload.text,
        sentAt: Date.now(),
      });
      yield* room.publish(encodeEvent({ _tag: "MessagePosted", message }));

      const responseId = crypto.randomUUID();
      yield* LanguageModel.streamText({
        prompt: [
          { role: "system", content: SYSTEM_PROMPT },
          ...conversation,
          { role: "user", content: payload.text },
        ],
      }).pipe(
        Stream.filter(
          (part): part is Response.TextDeltaPart => part.type === "text-delta",
        ),
        Stream.map((part) => part.delta),
        Stream.runFoldEffect(
          () => "",
          (text, delta) =>
            room
              .broadcast(
                encodeEvent({ _tag: "ResponseDelta", responseId, text: delta }),
              )
              .pipe(Effect.as(text + delta)),
        ),
        Effect.flatMap((text) =>
          room.publish(
            encodeEvent({
              _tag: "MessagePosted",
              message: ChatMessage.make({
                id: responseId,
                key: params.key,
                role: "assistant",
                text,
                sentAt: Date.now(),
              }),
            }),
          ),
        ),
        Effect.catch((error) =>
          room.broadcast(
            encodeEvent({
              _tag: "ResponseFailed",
              responseId,
              error: String(error),
            }),
          ),
        ),
        Effect.provide(languageModel),
      );

      return message;
    }).pipe(Effect.orDie);
});
