import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Etag from "effect/http/Etag";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { ChatApi } from "./api.ts";
import { ChatLive } from "./chat.live.ts";
import { HttpPlatformWorker } from "./http-platform.ts";

export default Cloudflare.Worker(
  "Api",
  { main: import.meta.url },
  Effect.gen(function* () {
    return {
      fetch: yield* HttpRouter.toHttpEffect(
        HttpApiBuilder.layer(ChatApi).pipe(
          Layer.provide(ChatLive),
          Layer.provide([Etag.layer, HttpPlatformWorker, Path.layer]),
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
