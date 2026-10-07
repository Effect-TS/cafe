import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

const HISTORY_KEY = "history";
const HISTORY_LIMIT = 100;

/**
 * One Room per chat key. Holds the WebSocket subscribers for that key, fans
 * out every published frame to them, and replays recent frames to each new
 * subscriber. Sockets are hibernatable, so they are always read back from
 * `state` rather than kept in memory.
 */
export default class Room extends Cloudflare.DurableObject<Room>()(
  "Room",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.gen(function* () {
      yield* Effect.log("TODO: bindings");
      
      return {
        fetch: Effect.gen(function* () {
          const [response, socket] = yield* Cloudflare.upgrade();
          const history =
            (yield* state.storage.get<ReadonlyArray<string>>(HISTORY_KEY)) ?? [];
          for (const frame of history) {
            yield* socket.send(frame);
          }
          return response;
        }),
        webSocketClose: Effect.fn(function* (
          socket: Cloudflare.WebSocket,
          code: number,
          reason: string,
        ) {
          yield* socket.close(code, reason);
        }),
        /** Record an already-encoded frame and broadcast it to every socket. */
        publish: (frame: string) =>
          Effect.gen(function* () {
            const history =
              (yield* state.storage.get<ReadonlyArray<string>>(HISTORY_KEY)) ??
              [];
            yield* state.storage.put(
              HISTORY_KEY,
              [...history, frame].slice(-HISTORY_LIMIT),
            );
            for (const socket of yield* state.getWebSockets()) {
              yield* socket.send(frame);
            }
          }),
      };
    });
  }),
) {}
