import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import type { ChatMessage } from "@cafe/api/chat/message";
import { Broadcast } from "./broadcast.ts";
import { History } from "./history.ts";

/** Adds a message to the chat's history and broadcasts it. */
export const Post = Effect.gen(function* () {
  const history = yield* History;
  const broadcast = yield* Broadcast;

  return Effect.fn("Room.post")(function* (message: ChatMessage) {
    yield* history.append(message);
    yield* PubSub.publish(broadcast, { _tag: "MessagePosted", message });
  });
});
