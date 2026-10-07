import * as Effect from "effect/Effect";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import type * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import type { Events } from "@cafe/api/chat/events";
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
      const response = yield* rooms.getByName(params.key).fetch(request);
      return withMutableHeaders(response);
    }).pipe(Effect.orDie);
});

// NOTE: a Response returned by a Durable Object stub has immutable headers, and
// HttpServerResponse.toWeb sets the outgoing headers (e.g. CORS) on a raw
// Response in place, which throws. Copy it so its headers can be modified.
const withMutableHeaders = (
  response: HttpServerResponse.HttpServerResponse,
): HttpServerResponse.HttpServerResponse => {
  const raw = response.body._tag === "Raw" ? response.body.body : undefined;
  if (!(raw instanceof Response)) {
    return response;
  }
  return HttpServerResponse.raw(
    new Response(raw.body, {
      status: raw.status,
      statusText: raw.statusText,
      headers: raw.headers,
      // @ts-expect-error: `webSocket` is a Workers-only ResponseInit field
      webSocket: (raw as { webSocket?: unknown }).webSocket,
    }),
  );
};
