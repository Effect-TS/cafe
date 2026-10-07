import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Etag from "effect/http/Etag";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { ChatApi, ChatEventJson, ChatMessage } from "./api.ts";
import Room from "./room.ts";

const encodeEvent = Schema.encodeSync(ChatEventJson);

// Workers have no filesystem, so stub out the file-serving half of HttpPlatform.
const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  platform: "web",
  compression: {
    algorithms: new Set<HttpPlatform.CompressionAlgorithm>(),
    compressResponse: (response) => Effect.succeed(response),
  },
  fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
  fileWebResponse: () =>
    Effect.die("HttpPlatform.fileWebResponse not supported"),
});

export default Cloudflare.Worker(
  "Api",
  { main: import.meta.url },
  Effect.gen(function* () {
    const rooms = yield* Room;

    const chatGroup = HttpApiBuilder.group(ChatApi, "Chat", (handlers) =>
      handlers
        .handle("sendPrompt", ({ params, payload }) =>
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
        )
        .handleRaw("events", ({ params }) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest;
            if (request.headers.upgrade !== "websocket") {
              return HttpServerResponse.text("Expected Upgrade: websocket", {
                status: 426,
              });
            }
            return yield* rooms.getByName(params.key).fetch(request);
          }).pipe(Effect.orDie),
        ),
    );

    return {
      fetch: yield* HttpRouter.toHttpEffect(
        HttpApiBuilder.layer(ChatApi).pipe(
          Layer.provide(chatGroup),
          Layer.provide([Etag.layer, HttpPlatformStub, Path.layer]),
          Layer.provide(
            HttpRouter.cors({
              allowedOrigins: ["*"],
              allowedMethods: ["GET", "POST", "OPTIONS"],
              allowedHeaders: ["Content-Type"],
            }),
          ),
        ),
      ),
    };
  }),
);
