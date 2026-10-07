import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

const HISTORY_KEY = "history";
const HISTORY_LIMIT = 100;

/**
 * One Room per chat key. Holds the WebSocket subscribers for that key, fans
 * out frames to them, and replays recent published frames to each new
 * subscriber (broadcast-only frames, like response deltas, are not kept).
 * Sockets are hibernatable, so they are always read back from `state`
 * rather than kept in memory.
 */
export default class Room extends Cloudflare.DurableObject<Room>()(
  "Room",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.gen(function* () {
      yield* Effect.log("TODO: bindings");

      const broadcast = (frame: string) =>
        Effect.gen(function* () {
          for (const socket of yield* state.getWebSockets()) {
            yield* socket.send(frame);
          }
        });

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
        /** Health check: succeeds once this Durable Object is reachable. */
        ping: () => Effect.void,
        /** The recorded frames, oldest first. */
        history: () =>
          state.storage
            .get<ReadonlyArray<string>>(HISTORY_KEY)
            .pipe(Effect.map((history) => history ?? [])),
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
            yield* broadcast(frame);
          }),
        /** Send an already-encoded frame to every socket without recording it. */
        broadcast: (frame: string) => broadcast(frame),
      };
    });
  }),
) {}
