// Uploads the rendered demo to the public demos bucket (stacks/github.ts):
//
//   bun upload.ts <prefix>      e.g. pr-12/abc1234 or main
//
// Needs CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and DEMO_BUCKET, and prints
// the public base URL of the upload when DEMO_BASE_URL is set.
import path from "node:path";

const prefix = process.argv[2];
if (!prefix) throw new Error("usage: bun upload.ts <prefix>");

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};
const accountId = env("CLOUDFLARE_ACCOUNT_ID");
const token = env("CLOUDFLARE_API_TOKEN");
const bucket = env("DEMO_BUCKET");

const files = [
  { name: "demo.gif", type: "image/gif" },
  { name: "demo.mp4", type: "video/mp4" },
];

for (const { name, type } of files) {
  const file = Bun.file(path.join(import.meta.dir, "out", name));
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${prefix}/${name}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": type },
      body: file,
    },
  );
  if (!response.ok) {
    throw new Error(`upload ${prefix}/${name}: ${response.status} ${await response.text()}`);
  }
  console.log(`uploaded ${prefix}/${name}`);
}

if (process.env.DEMO_BASE_URL) console.log(`${process.env.DEMO_BASE_URL}/${prefix}`);
