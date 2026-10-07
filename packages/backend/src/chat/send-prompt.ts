import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import { ChatEventJson } from "@cafe/api/chat/event";
import { ChatMessage } from "@cafe/api/chat/message";
import Room from "./room.ts";
import type { SendPrompt } from "@cafe/api/chat/send-prompt";

const encodeEvent = Schema.encodeSync(ChatEventJson);

export const SendPromptHandler = Effect.gen(function* () {
  const rooms = yield* Room;

  return ({ params, payload }: HttpApiEndpoint.Request<typeof SendPrompt>) =>
    Effect.gen(function* () {
      const message = ChatMessage.make({
        id: crypto.randomUUID(),
        key: params.key,
        text: payload.text,
        sentAt: Date.now(),
      });
      yield* rooms
        .getByName(params.key)
        .publish(encodeEvent({ _tag: "MessagePosted", message }));
      return message;
    }).pipe(Effect.orDie);
});
