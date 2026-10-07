import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import Api from "@cafe/backend";

/**
 * The demo CI recorded for this commit: `DEMO_URL` is its folder in the
 * public demos bucket (stacks/github.ts), e.g. https://pub-….r2.dev/pr-12/abc1234.
 */
const demoEmbed = (demoUrl: string) =>
  `[![Demo of this preview](${demoUrl}/demo.gif)](${demoUrl}/demo.mp4)`;

export default Alchemy.Stack(
  "Cafe",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const api = yield* Api;

    const web = yield* Cloudflare.Website.Foldkit("Web", {
      rootDir: "packages/frontend",
      env: {
        VITE_API_URL: api.url.as<string>(),
      },
    });

    const github = yield* GitHub.GitHubEnv;
    if (github?.pr) {
      yield* GitHub.Comment("PreviewComment", {
        owner: github.owner,
        repository: github.repository,
        issueNumber: github.pr,
        body: Output.interpolate`
          ## Preview deployed

          **App:** ${web.url}

          ${process.env.DEMO_URL ? demoEmbed(process.env.DEMO_URL) : "_Recording a demo of this commit…_"}

          Built from commit ${github.sha.slice(0, 7)}.

          ---
          _This comment updates automatically with each push._
        `,
      });
    }

    return {
      apiUrl: api.url,
      url: web.url,
    };
  }),
);
