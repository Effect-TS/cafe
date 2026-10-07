import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpPlatform from "effect/http/HttpPlatform";

/** `HttpPlatform` for Workers: no filesystem, so file responses are unsupported. */
export const HttpPlatformWorker = Layer.succeed(HttpPlatform.HttpPlatform, {
  platform: "web",
  compression: {
    algorithms: new Set<HttpPlatform.CompressionAlgorithm>(),
    compressResponse: (response) => Effect.succeed(response),
  },
  fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
  fileWebResponse: () =>
    Effect.die("HttpPlatform.fileWebResponse not supported"),
});
