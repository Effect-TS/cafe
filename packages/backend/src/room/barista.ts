import { Agent, AgentRuntime, InMemory, Output } from "@yielded/agent";
import type { RuntimeContext } from "alchemy";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type * as LanguageModel from "effect/ai/LanguageModel";
import type * as Model from "effect/ai/Model";
import * as Toolkit from "effect/ai/Toolkit";
import type { Kitchen } from "../kitchen/index.ts";
import { Menu, menu } from "./menu.ts";

const BaristaTools = Toolkit.make(Menu);

const BaristaAgent = Agent.make("barista", {
  input: Schema.String,
  output: Output.text(Schema.String),
  instructions:
    "You are a friendly barista in a group chat at a café. The input is the recent conversation; reply to its last message. For anything about drinks, food or prices, call the menu tool and answer from it. Reply concisely in plain text.",
  toolkit: BaristaTools,
  policy: { maxTurns: 4, maxToolCalls: 2, maxDuration: "60 seconds" },
});

export class BaristaError extends Data.TaggedError("BaristaError")<{
  readonly cause: unknown;
}> {
  override get message() {
    const { cause } = this;
    return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  }
}

/** The café's barista: an agent that answers the chat, using the Kitchen's menu. */
export class Barista extends Context.Service<
  Barista,
  {
    /** Streams the reply's text to the conversation's last message. */
    readonly reply: (conversation: string) => Stream.Stream<string, BaristaError>;
  }
>()("Barista") {
  static readonly layer = (
    kitchen: Kitchen,
    model: Layer.Layer<
      LanguageModel.LanguageModel | Model.ProviderName | Model.ModelName,
      never,
      RuntimeContext
    >,
  ): Layer.Layer<Barista, never, RuntimeContext> =>
    Layer.effect(
      Barista,
      Effect.gen(function* () {
        const services = yield* Effect.context<
          AgentRuntime.AgentRuntimeRequirements<typeof BaristaAgent>
        >();
        return {
          reply: (conversation) =>
            AgentRuntime.stream(BaristaAgent, conversation).pipe(
              Stream.filter((event) => event._tag === "TextDelta"),
              Stream.map((event) => event.text),
              Stream.mapError((cause) => new BaristaError({ cause })),
              Stream.provideContext(services),
            ),
        };
      }),
    ).pipe(
      Layer.provide(
        Layer.mergeAll(
          model,
          InMemory.layer,
          BaristaTools.toLayer(
            Effect.gen(function* () {
              return { menu: yield* menu(kitchen) };
            }),
          ),
        ),
      ),
    );
}
