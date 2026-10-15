import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import { ChatMessage } from "@cafe/api/chat/message";
import { Barista } from "./barista.ts";
import { Broadcast } from "./broadcast.ts";
import { Post } from "./post.ts";

const CONTEXT_MESSAGES = 20;

/** The recent conversation as the barista's input; the last line is the new prompt. */
const transcript = (conversation: ReadonlyArray<ChatMessage>) =>
  conversation
    .slice(-CONTEXT_MESSAGES)
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");

/**
 * Answers the conversation: streams the Barista's reply as
 * ResponseDeltas, then posts it (or broadcasts ResponseFailed).
 */
export const Reply = Effect.gen(function* () {
  const barista = yield* Barista;
  const broadcast = yield* Broadcast;
  const post = yield* Post;

  return Effect.fn("Room.reply")(function* (
    key: string,
    conversation: ReadonlyArray<ChatMessage>,
  ) {
    const responseId = crypto.randomUUID();

    yield* barista.reply(transcript(conversation)).pipe(
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
      // Defects too: a reply that can't finish fails in the chat, not the request.
      Effect.catchCause((cause) =>
        PubSub.publish(broadcast, {
          _tag: "ResponseFailed",
          responseId,
          error: Cause.pretty(cause),
        }),
      ),
    );
  });
});
