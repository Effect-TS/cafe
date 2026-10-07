import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const owner = "Effect-TS";
const repository = "cafe";

/**
 * Publishes the Cloudflare credentials of the profile this stack is deployed
 * with as GitHub Actions secrets, for `.github/workflows/ci.yml`:
 *
 *   pnpm exec alchemy deploy --config stacks/github.ts --profile testing
 */
export default Alchemy.Stack(
  "CafeGitHub",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const credentials = yield* yield* Cloudflare.CloudflareEnvironment;

    if (credentials.type !== "apiToken") {
      return yield* Effect.die(
        `stacks/github.ts needs a Cloudflare API token profile (CI cannot refresh ${credentials.type} credentials)`,
      );
    }

    yield* GitHub.Secret("CloudflareApiToken", {
      owner,
      repository,
      name: "CLOUDFLARE_API_TOKEN",
      value: credentials.apiToken,
    });

    yield* GitHub.Secret("CloudflareAccountId", {
      owner,
      repository,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(credentials.accountId),
    });
  }),
);
