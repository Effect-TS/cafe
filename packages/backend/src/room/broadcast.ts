import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import type { ChatEvent } from "@cafe/api/chat/event";

/** Live events, fanned out in memory to every open `events` stream. */
export class Broadcast extends Context.Service<
  Broadcast,
  PubSub.PubSub<ChatEvent>
>()("Broadcast") {
  static readonly layer = Layer.effect(Broadcast, PubSub.unbounded<ChatEvent>());
}
