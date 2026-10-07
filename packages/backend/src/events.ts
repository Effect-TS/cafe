import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";

/** Upgrade to a WebSocket that streams `ChatEvent` frames for `key`. */
export const Events = HttpApiEndpoint.get("events", "/chats/:key/events", {
  params: Schema.Struct({ key: Schema.String }),
});
