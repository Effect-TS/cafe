import * as Cloudflare from "alchemy/Cloudflare";
import * as Http from "alchemy/Http";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/http/HttpRouter";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { Api } from "@cafe/api";
import { chatSocketPath } from "@cafe/api/chat/socket";
import { ChatLive } from "./chat/group.ts";
import Room from "./chat/room.ts";

export default Cloudflare.Worker(
  "Api",
  { main: import.meta.url },
  Effect.gen(function* () {
    const rooms = yield* Room;
    const api = yield* HttpRouter.toHttpEffect(
      HttpApiBuilder.layer(Api).pipe(
        Layer.provide(ChatLive),
        Layer.provide(Http.Platform),
        Layer.provide(
          HttpRouter.cors({
            allowedOrigins: ["*"],
            allowedMethods: ["GET", "POST", "OPTIONS"],
            allowedHeaders: ["Content-Type"],
          }),
        ),
      ),
    );

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const path = new URL(request.url, "http://worker").pathname;

        if (path === "/health") {
          // For tests: OK once the Worker can reach a new Room instance.
          return yield* rooms.getByName(`health-${crypto.randomUUID()}`).pipe(
            Effect.flatMap((room) => room.ping()),
            Effect.scoped,
            Effect.as(HttpServerResponse.text("ok")),
            Effect.orElseSucceed(() =>
              HttpServerResponse.text("unavailable", { status: 503 }),
            ),
          );
        }

        // The chat's Room serves ChatRpcs over this WebSocket. Forwarded
        // before the HttpApi, so no HTTP middleware (CORS) touches the 101.
        const socket = chatSocketPath.exec(path);
        if (socket?.[1]) {
          return yield* rooms.fetch(decodeURIComponent(socket[1]), request);
        }

        return yield* api;
      }),
    };
  }),
);
