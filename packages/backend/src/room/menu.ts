import type { RuntimeContext } from "alchemy";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Tool from "effect/ai/Tool";
import type { Kitchen } from "../kitchen/index.ts";

/** The barista's `menu` tool: today's menu, from the Kitchen. */
export const Menu = Tool.make("menu", {
  description: "Today's café menu: every drink and pastry with its price in US dollars.",
  success: Schema.Array(Schema.Struct({ name: Schema.String, price: Schema.Number })),
});

/** Calls the Kitchen over RPC, starting it first (start is idempotent). */
export const menu = (kitchen: Kitchen) =>
  Effect.gen(function* () {
    const runtime = yield* Effect.context<RuntimeContext>();
    // A freshly deployed container can take a few seconds before it starts.
    const start = kitchen
      .start({ enableInternet: false })
      .pipe(Effect.retry({ schedule: Schedule.exponential("500 millis"), times: 6 }));
    return Effect.fn("Kitchen.menu")(
      function* () {
        yield* start;
        return yield* kitchen.menu();
      },
      Effect.orDie,
      Effect.provideContext(runtime),
    );
  });
