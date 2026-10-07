import type * as Alchemy from "alchemy";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import { ChatEventJson } from "./chat-event.ts";
import { ChatMessage } from "./chat-message.ts";
import Room from "./room.ts";
import type { SendPrompt } from "./send-prompt.ts";

const encodeEvent = Schema.encodeSync(ChatEventJson);

export class SendPromptHandler extends Context.Service<
  SendPromptHandler,
  HttpApiEndpoint.Handler<typeof SendPrompt, never, Alchemy.RuntimeContext>
>()("SendPromptHandler") {}

export const SendPromptLive = Layer.effect(
  SendPromptHandler,
  Effect.gen(function* () {
    const rooms = yield* Room;

    return ({ params, payload }) =>
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
  }),
);
