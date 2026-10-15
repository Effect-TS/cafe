import * as Effect from "effect/Effect";
import { Kitchen } from "./index.ts";
import { MENU } from "./menu.ts";

/** The Kitchen's process, bundled into its image. Never imported by the Worker. */
export default Kitchen.make(
  { main: import.meta.url, image: "oven/bun:latest" },
  Effect.succeed({
    menu: () => Effect.succeed(MENU),
  }),
);
