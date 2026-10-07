import * as Rpc from "effect/rpc/Rpc";

/** Succeeds once the Room is reachable. */
export const Ping = Rpc.make("ping", {});
