import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as LanguageModel from "effect/ai/LanguageModel";
import type * as Prompt from "effect/ai/Prompt";
import type * as Response from "effect/ai/Response";
import { ChatMessage } from "@cafe/api/chat/message";
import { Broadcast } from "./broadcast.ts";
import { Post } from "./post.ts";

const CONTEXT_MESSAGES = 20;
const SYSTEM_PROMPT =
  "You are a friendly assistant in a group chat. Reply concisely in plain text.";

/**
 * Answers the conversation: broadcasts the model's reply as ResponseDeltas,
 * then posts it (or broadcasts ResponseFailed).
 */
export const Reply = Effect.gen(function* () {
  const model = yield* LanguageModel.LanguageModel;
  const broadcast = yield* Broadcast;
  const post = yield* Post;

  return (key: string, conversation: ReadonlyArray<ChatMessage>) =>
    Effect.gen(function* () {
      const responseId = crypto.randomUUID();
      const prompt: ReadonlyArray<Prompt.MessageEncoded> = [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversation
          .slice(-CONTEXT_MESSAGES)
          .map((message) => ({ role: message.role, content: message.text })),
      ];

      yield* model.streamText({ prompt }).pipe(
        Stream.filter(
          (part): part is Response.TextDeltaPart => part.type === "text-delta",
        ),
        Stream.map((part) => part.delta),
        Stream.runFoldEffect(
          () => "",
          (text, delta) =>
            PubSub.publish(broadcast, {
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
          PubSub.publish(broadcast, {
            _tag: "ResponseFailed",
            responseId,
            error: String(error),
          }),
        ),
      );
    });
});
