import * as Effect from "effect/Effect";
import type * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import type { SendPrompt } from "@cafe/api/chat/send-prompt";
import Room from "./room.ts";

/** `POST /chats/:key/prompts`: forwards the prompt to the chat's Room. */
export const SendPromptHandler = Effect.gen(function* () {
  const rooms = yield* Room;

  return ({ params, payload }: HttpApiEndpoint.Request<typeof SendPrompt>) =>
    Effect.gen(function* () {
      const room = yield* rooms.getByName(params.key);
      return yield* room.sendPrompt({ key: params.key, text: payload.text });
    }).pipe(Effect.scoped, Effect.orDie);
});
