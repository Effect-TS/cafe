import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { ChatApi } from "./api.ts";
import Room from "./room.ts";

const make = Effect.gen(function* () {
  const rooms = yield* Room;

  return HttpApiBuilder.handler(ChatApi, "Chat", "events", ({ params }) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (request.headers.upgrade !== "websocket") {
        return HttpServerResponse.text("Expected Upgrade: websocket", {
          status: 426,
        });
      }
      return yield* rooms.getByName(params.key).fetch(request);
    }).pipe(Effect.orDie),
  );
});

export class EventsHandler extends Context.Service<
  EventsHandler,
  Effect.Success<typeof make>
>()("EventsHandler") {}

export const EventsLive = Layer.effect(EventsHandler, make);
