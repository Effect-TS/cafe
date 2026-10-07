// Uploads the rendered demo to the public demos bucket (stacks/github.ts):
//
//   bun upload.ts <prefix>      e.g. pr-12/abc1234 or main
//
// Needs CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and DEMO_BUCKET.
import path from "node:path";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

const prefix = process.argv[2];
if (!prefix) throw new Error("usage: bun upload.ts <prefix>");

const { accountId, token, bucket } = Effect.runSync(
  Config.all({
    accountId: Config.String("CLOUDFLARE_ACCOUNT_ID"),
    token: Config.Redacted("CLOUDFLARE_API_TOKEN"),
    bucket: Config.String("DEMO_BUCKET"),
  }),
);

// `main/` is replaced on every push to main, so GitHub's image proxy (camo)
// must revalidate it; per-commit folders never change.
const cacheControl =
  prefix === "main" ? "no-cache" : "public, max-age=31536000, immutable";

const files = [
  { name: "demo.gif", type: "image/gif" },
  { name: "demo.mp4", type: "video/mp4" },
];

for (const { name, type } of files) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${prefix}/${name}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${Redacted.value(token)}`,
        "Content-Type": type,
        "Cache-Control": cacheControl,
      },
      body: Bun.file(path.join(import.meta.dir, "out", name)),
    },
  );
  if (!response.ok) {
    throw new Error(`upload ${prefix}/${name}: ${response.status} ${await response.text()}`);
  }
  console.log(`uploaded ${prefix}/${name}`);
}
