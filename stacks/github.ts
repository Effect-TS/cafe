import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Effect from "effect/Effect";
import * as Output from "alchemy/Output";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

const owner = "Effect-TS";
const repository = "cafe";

/**
 * CI infrastructure for `.github/workflows/ci.yml`:
 *
 * - the Cloudflare credentials of the profile this stack is deployed with, as
 *   GitHub Actions secrets
 * - a public R2 bucket for the recorded demos (PR previews and the README),
 *   with its name and URL as GitHub Actions variables
 *
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

    const demos = yield* Cloudflare.R2.Bucket("Demos", {
      publicAccess: true,
      lifecycleRules: [
        {
          id: "expire-pr-demos",
          prefix: "pr-",
          deleteObjectsTransition: {
            condition: { type: "Age", maxAge: 60 * 60 * 24 * 30 },
          },
        },
      ],
    });

    yield* GitHub.Variable("DemoBucket", {
      owner,
      repository,
      name: "DEMO_BUCKET",
      value: demos.bucketName,
    });

    yield* GitHub.Variable("DemoBaseUrl", {
      owner,
      repository,
      name: "DEMO_BASE_URL",
      value: Output.interpolate`https://${demos.publicDomain.as<string>()}`,
    });

    return { demoBaseUrl: Output.interpolate`https://${demos.publicDomain.as<string>()}` };
  }),
);
