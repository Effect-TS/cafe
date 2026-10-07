import { defineVideo } from "termcut";

// Records the README demo: deploy with Alchemy, use the deployed app in a
// browser, then the local loop (alchemy dev, pnpm test, ALCHEMY_DEV=1 pnpm test).
//
//   pnpm --filter @cafe/demos record
//
// Deploys the stage `demo` with the Alchemy profile $ALCHEMY_PROFILE (default
// `testing`); record.ts runs `setup` and `teardown` around the recording.

const profile = process.env.ALCHEMY_PROFILE ?? "testing";
const stage = "demo";

const destroyStage = async () => {
  const proc = Bun.spawn(
    ["pnpm", "exec", "alchemy", "destroy", "--stage", stage, "--yes", "--no-input"],
    {
      cwd: `${import.meta.dir}/../..`,
      env: { ...process.env, ALCHEMY_PROFILE: profile },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if ((await proc.exited) !== 0) throw new Error(`alchemy destroy --stage ${stage} failed`);
};

/** Start from nothing deployed, so the recorded deploy creates the resources. */
export const setup = destroyStage;
export const teardown = destroyStage;

export default defineVideo(
  {
    output: ["out/demo.mp4"],
    width: 1920,
    height: 1080,
    cols: 100,
    rows: 34,
    fps: 30,
    maxPause: "1.5s",
    windowBar: "colorful",
    title: "cafe",
    browser: { position: "right", width: 960, height: 1080 },
    requires: ["pnpm"],
    cache: false,
  },
  async (t) => {
    await t.hide(async () => {
      await t.run(`cd ../.. && export ALCHEMY_PROFILE=${profile} && clear`);
    });

    // 1. Deploy
    await t.slide("Deploy to Cloudflare", {
      eyebrow: "alchemy deploy",
      subtitle: "One Worker for the Effect HttpApi + Durable Objects, one for the Foldkit site",
      duration: "2.5s",
    });
    await t.timelapse(
      async () => {
        await t.run(`pnpm exec alchemy deploy --stage ${stage} --yes`, {
          timeout: "5m",
        });
      },
      { speed: 4 },
    );
    const url = siteUrl(t.scrollback());
    const apiUrl = deployedApiUrl(t.scrollback());
    // A new workers.dev URL takes a while to start serving; wait off-camera.
    await t.hide(async () => {
      await whenServing(url);
      await whenServing(`${apiUrl}/health`);
    });

    // 2. Use the deployed app
    await t.slide("Chat with the deployed app", {
      eyebrow: "Foldkit + WebSocket + Workers AI",
      duration: "2s",
    });
    await t.browser.goto(url);
    await useChat(t, "coffee", "Write a haiku about coffee.");

    // 3. Local development
    await t.slide("Develop locally", {
      eyebrow: "alchemy dev",
      subtitle: "Workers run in workerd, the site in Vite, against real cloud resources",
      duration: "2.5s",
    });
    await t.clear();
    await t.type("pnpm dev");
    await t.enter();
    await t.wait(/Done:/, { scope: "scrollback", timeout: "3m" });
    const devUrl = localUrl(t.scrollback());
    await t.browser.goto(devUrl);
    await useChat(t, "local", "Say hello from localhost in one sentence.");
    await t.ctrl("c");
    await t.wait(undefined, { timeout: "60s" });

    // The deployed chat keeps its history: rejoin it while the tests run.
    await t.browser.goto(url);
    await t.browser.waitFor(/Join chat/);
    await fill(t, "#chat-key", "coffee");
    await submit(t);

    // 4. Tests against the cloud, then locally
    await t.slide("Test against the cloud", {
      eyebrow: "pnpm test",
      subtitle: "Test.make deploys a test stage, runs the suite, and destroys it",
      duration: "2.5s",
    });
    await t.clear();
    await t.timelapse(
      async () => {
        await t.run("pnpm test", { timeout: "10m" });
      },
      { speed: 4 },
    );
    await t.expect(/Tests\s+\d+ passed/, { scope: "scrollback" });

    await t.slide("Test locally", {
      eyebrow: "ALCHEMY_DEV=1 pnpm test",
      subtitle: "The same suites against workerd",
      duration: "2.5s",
    });
    await t.clear();
    await t.timelapse(
      async () => {
        await t.run("ALCHEMY_DEV=1 pnpm test", { timeout: "10m" });
      },
      { speed: 4 },
    );
    await t.expect(/Tests\s+\d+ passed/, { scope: "scrollback" });
    await t.sleep("3s");
  },
);

type Video = Parameters<Parameters<typeof defineVideo>[1]>[0];

/** Joins a chat in the browser pane, sends a prompt, and waits for the reply. */
const useChat = async (t: Video, chatKey: string, prompt: string) => {
  await t.browser.waitFor(/Join chat/);
  await fill(t, "#chat-key", chatKey);
  await submit(t);
  await t.browser.waitFor(new RegExp(`#${chatKey}`));
  await t.sleep("500ms");
  await fill(t, "#prompt", prompt);
  await submit(t);
  await waitUntil(
    t,
    `document.querySelector('li[data-role="assistant"]') !== null &&
     document.querySelector('li[data-role="assistant"] [aria-busy="true"]') === null`,
    "the assistant reply",
  );
  await t.sleep("2s");
};

/** Clicks the form's submit button once Foldkit has re-rendered it enabled. */
const submit = async (t: Video) => {
  await waitUntil(
    t,
    `(() => { const b = document.querySelector("button[type=submit]");
      return b !== null && !b.disabled && !b.hasAttribute("data-disabled"); })()`,
    "an enabled submit button",
  );
  await t.browser.click("button[type=submit]");
};

/** Types into a Foldkit input: set the value, then fire the `input` event it listens to. */
const fill = (t: Video, selector: string, value: string) =>
  t.browser.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);

const waitUntil = async (t: Video, condition: string, what: string) => {
  for (let attempt = 0; attempt < 240; attempt++) {
    if ((await t.browser.evaluate(condition)) === true) return;
    await t.sleep("250ms");
  }
  throw new Error(`timed out waiting for ${what}`);
};

/** Resolves once `url` has answered 200 five times in a row. */
const whenServing = async (url: string) => {
  let streak = 0;
  for (let attempt = 0; attempt < 120 && streak < 5; attempt++) {
    const ok = await fetch(url).then((r) => r.ok, () => false);
    streak = ok ? streak + 1 : 0;
    await Bun.sleep(1000);
  }
  if (streak < 5) throw new Error(`${url} is not serving`);
};

const deployedApiUrl = (output: string) => {
  const match = output.match(/apiUrl: '(https:\/\/[^']+)'/);
  if (!match?.[1]) throw new Error("deploy output has no api url");
  return match[1];
};

const siteUrl = (output: string) => {
  const match = output.match(/url: '(https:\/\/[^']+)'/);
  if (!match?.[1]) throw new Error("deploy output has no site url");
  return match[1];
};

const localUrl = (output: string) => {
  const matches = [...output.matchAll(/url: '(http:\/\/localhost:\d+)'/g)];
  const last = matches.at(-1)?.[1];
  if (!last) throw new Error("alchemy dev output has no local site url");
  return last;
};
