import * as Effect from "effect/Effect";

/** `ping`: succeeds once the Room is reachable. */
export const PingHandler = Effect.succeed(() => Effect.void);
