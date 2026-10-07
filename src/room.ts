import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

/**
 * One Room per chat key. Holds the WebSocket subscribers for that key and
 * fans out every published frame to them. Sockets are hibernatable, so they
 * are always read back from `state` rather than kept in memory.
 */
export default class Room extends Cloudflare.DurableObject<Room>()(
  "Room",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;

    return Effect.gen(function* () {
      return {
        fetch: Effect.gen(function* () {
          const [response] = yield* Cloudflare.upgrade();
          return response;
        }),
        webSocketClose: Effect.fn(function* (
          socket: Cloudflare.WebSocket,
          code: number,
          reason: string,
        ) {
          yield* socket.close(code, reason);
        }),
        /** Broadcast an already-encoded frame to every connected socket. */
        publish: (frame: string) =>
          Effect.gen(function* () {
            for (const socket of yield* state.getWebSockets()) {
              yield* socket.send(frame);
            }
          }),
      };
    });
  }),
) {}
