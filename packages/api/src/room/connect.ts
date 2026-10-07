import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcClient from "effect/rpc/RpcClient";
import type { RpcClientError } from "effect/rpc/RpcClientError";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as Socket from "effect/socket/Socket";
import { Room } from "./index.ts";

export type RoomClient = RpcClient.FromGroup<typeof Room, RpcClientError>;

/** Connects to the chat `key`'s Room; the WebSocket closes with the Scope. */
export const connect = Effect.fn("Room.connect")(function* (
  baseUrl: string,
  key: string,
) {
  const protocol = yield* Layer.build(
    RpcClient.layerProtocolSocket().pipe(
      Layer.provide([
        Socket.layerWebSocket(Room.url(baseUrl, key)),
        RpcSerialization.layerJson,
      ]),
    ),
  );
  const client: RoomClient = yield* RpcClient.make(Room).pipe(
    Effect.provide(protocol),
  );
  return client;
});
