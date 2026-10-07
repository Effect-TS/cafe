import type { RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ChatMessage } from "@cafe/api/chat/message";

const MESSAGES_KEY = "messages";
const MESSAGES_LIMIT = 100;

/** The chat's last messages, kept in the Room's storage. */
export class History extends Context.Service<
  History,
  {
    readonly messages: Effect.Effect<ReadonlyArray<ChatMessage>>;
    readonly append: (message: ChatMessage) => Effect.Effect<void>;
  }
>()("History") {
  static readonly layer = Layer.effect(
    History,
    Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;
      const runtime = yield* Effect.context<RuntimeContext>();

      const messages = state.storage
        .get<ReadonlyArray<ChatMessage>>(MESSAGES_KEY)
        .pipe(
          Effect.map((stored) => stored ?? []),
          Effect.orDie,
          Effect.provideContext(runtime),
        );

      return {
        messages,
        append: (message) =>
          Effect.gen(function* () {
            const history = yield* messages;
            yield* state.storage.put(
              MESSAGES_KEY,
              [...history, message].slice(-MESSAGES_LIMIT),
            );
          }).pipe(Effect.orDie, Effect.provideContext(runtime)),
      };
    }),
  );
}
