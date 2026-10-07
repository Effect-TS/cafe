import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import type * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import type { Events } from "./events.ts";
import Room from "./room.ts";

export class EventsHandler extends Context.Service<
  EventsHandler,
  HttpApiEndpoint.Handler<typeof Events, never, never>
>()("EventsHandler") {}

export const EventsLive = Layer.effect(
  EventsHandler,
  Effect.gen(function* () {
    const rooms = yield* Room;

    return ({ params, request }) =>
      Effect.gen(function* () {
        if (request.headers.upgrade !== "websocket") {
          return HttpServerResponse.text("Expected Upgrade: websocket", {
            status: 426,
          });
        }
        return yield* rooms.getByName(params.key).fetch(request);
      }).pipe(Effect.orDie);
  }),
);
