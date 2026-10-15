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
    const start = kitchen.start({ enableInternet: false });
    return Effect.fn("Kitchen.menu")(
      function* () {
        yield* start;
        return yield* kitchen.menu();
      },
      // Right after a deploy, Cloudflare may have no container instance for
      // the Room yet ("try again later"): the container exits before its port
      // opens. Reading the menu is safe to repeat, so retry start + call.
      Effect.retry({ schedule: Schedule.spaced("3 seconds"), times: 15 }),
      Effect.orDie,
      Effect.provideContext(runtime),
    );
  });
