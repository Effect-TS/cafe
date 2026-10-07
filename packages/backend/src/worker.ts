import * as Cloudflare from "alchemy/Cloudflare";
import * as Http from "alchemy/Http";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { ChatApi } from "./api.ts";
import { ChatLive } from "./chat.live.ts";

export default Cloudflare.Worker(
  "Api",
  { main: import.meta.url },
  HttpRouter.toHttpEffect(
    HttpApiBuilder.layer(ChatApi).pipe(
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
  ).pipe(Effect.map((fetch) => ({ fetch })))
  
);
