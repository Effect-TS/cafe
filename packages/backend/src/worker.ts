import * as Cloudflare from "alchemy/Cloudflare";
import * as Http from "alchemy/Http";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/http/HttpRouter";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { Api } from "@cafe/api";
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
        if (request.url === "/health") {
          // For tests: OK once the Worker can reach a new Room instance.
          return yield* rooms
            .getByName(`health-${crypto.randomUUID()}`)
            .ping()
            .pipe(
              Effect.as(HttpServerResponse.text("ok")),
              Effect.orElseSucceed(() =>
                HttpServerResponse.text("unavailable", { status: 503 }),
              ),
            );
        }
        return yield* api;
      }),
    };
  }).pipe(Effect.provide(Cloudflare.Workers.AIBinding)),
);
