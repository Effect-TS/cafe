import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { ChatApi } from "./api.ts";
import { ChatEventJson } from "./chat-event.ts";
import { ChatMessage } from "./chat-message.ts";
import Room from "./room.ts";

const encodeEvent = Schema.encodeSync(ChatEventJson);

const make = Effect.gen(function* () {
  const rooms = yield* Room;

  return HttpApiBuilder.handler(
    ChatApi,
    "Chat",
    "sendPrompt",
    ({ params, payload }) =>
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
      }).pipe(Effect.orDie),
  );
});

export class SendPromptHandler extends Context.Service<
  SendPromptHandler,
  Effect.Success<typeof make>
>()("SendPromptHandler") {}

export const SendPromptLive = Layer.effect(SendPromptHandler, make);
