import * as Effect from "effect/Effect";
import type * as Rpc from "effect/rpc/Rpc";
import { ChatMessage } from "@cafe/api/chat/message";
import type { SendPrompt } from "@cafe/api/room/send-prompt";
import { History } from "./history.ts";
import { Post } from "./post.ts";
import { Reply } from "./reply.ts";

/** `sendPrompt`: posts the user's message, then streams the reply. */
export const SendPromptHandler = Effect.gen(function* () {
  const history = yield* History;
  const post = yield* Post;
  const reply = yield* Reply;

  return Effect.fn("Room.sendPrompt")(function* ({
    key,
    text,
  }: Rpc.Payload<typeof SendPrompt>) {
    const message = ChatMessage.make({
      id: crypto.randomUUID(),
      key,
      role: "user",
      text,
      sentAt: Date.now(),
    });
    yield* post(message);
    yield* reply(key, yield* history.messages);
    return message;
  });
});
