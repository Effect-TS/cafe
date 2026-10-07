import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import type { ChatEvent } from "@cafe/api/chat/event";
import { Broadcast } from "./broadcast.ts";
import { History } from "./history.ts";

/** `events`: the chat's history as MessagePosted events, then live events. */
export const EventsHandler = Effect.gen(function* () {
  const history = yield* History;
  const broadcast = yield* Broadcast;

  return () =>
    Stream.unwrap(
      Effect.gen(function* () {
        // Subscribe before reading history, so nothing posted in between
        // is missed.
        const live = yield* PubSub.subscribe(broadcast);
        const messages = yield* history.messages;
        return Stream.concat(
          Stream.fromIterable(
            messages.map((message): ChatEvent => ({ _tag: "MessagePosted", message })),
          ),
          Stream.fromSubscription(live),
        );
      }),
    );
});
