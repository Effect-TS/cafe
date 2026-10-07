import * as Effect from "effect/Effect";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import type * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import type { Events } from "./events.ts";
import Room from "./room.ts";

export const EventsHandler = Effect.gen(function* () {
  const rooms = yield* Room;

  return ({ params, request }: HttpApiEndpoint.Request<typeof Events>) =>
    Effect.gen(function* () {
      if (request.headers.upgrade !== "websocket") {
        return HttpServerResponse.text("Expected Upgrade: websocket", {
          status: 426,
        });
      }
      return yield* rooms.getByName(params.key).fetch(request);
    }).pipe(Effect.orDie);
});
