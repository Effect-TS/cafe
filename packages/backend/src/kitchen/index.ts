import * as Cloudflare from "alchemy/Cloudflare";
import type * as Effect from "effect/Effect";
import type { MenuItem } from "./menu.ts";

/**
 * The café's back office: a container whose RPC methods back the barista's
 * tools. Alchemy's container RPC carries plain JSON, so there are no schemas
 * here; the tools validate results at the model boundary.
 */
export class Kitchen extends Cloudflare.Container<
  Kitchen,
  {
    menu: () => Effect.Effect<ReadonlyArray<MenuItem>>;
  }
>()("Kitchen") {}
