// Creates or updates the PR's demo comment (found by MARKER), linking the
// preview site and this commit's demo in the demos bucket:
//
//   bun comment.ts
//
// Reads GITHUB_TOKEN, GITHUB_REPOSITORY, PULL_REQUEST, DEMO_URL (the demo's
// folder, e.g. https://pub-….r2.dev/pr-12/<sha>), APP_URL and DEMO_SHA.
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

const MARKER = "<!-- cafe-demo -->";

const config = Effect.runSync(
  Config.all({
    token: Config.Redacted("GITHUB_TOKEN"),
    repository: Config.String("GITHUB_REPOSITORY"),
    pr: Config.Number("PULL_REQUEST"),
    demoUrl: Config.String("DEMO_URL"),
    appUrl: Config.String("APP_URL"),
    sha: Config.String("DEMO_SHA"),
  }),
);

const body = `## Demo of this preview

[![Demo of this preview](${config.demoUrl}/demo.gif)](${config.demoUrl}/demo.mp4)

**Video:** ${config.demoUrl}/demo.mp4
**App:** ${config.appUrl}

Recorded from commit ${config.sha.slice(0, 7)}: \`alchemy deploy\`, chatting in the browser, \`alchemy dev\`, \`pnpm test\`, \`ALCHEMY_DEV=1 pnpm test\`.

${MARKER}`;

const github = (path: string, init?: RequestInit) =>
  fetch(`https://api.github.com/repos/${config.repository}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${Redacted.value(config.token)}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`GitHub ${init?.method ?? "GET"} ${path}: ${response.status} ${await response.text()}`);
    }
    return response.json();
  });

const comments: Array<{ id: number; body?: string }> = await github(
  `/issues/${config.pr}/comments?per_page=100`,
);
const existing = comments.find((comment) => comment.body?.includes(MARKER));

if (existing) {
  await github(`/issues/comments/${existing.id}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
  console.log(`updated demo comment ${existing.id}`);
} else {
  const created: { id: number } = await github(`/issues/${config.pr}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  console.log(`created demo comment ${created.id}`);
}
