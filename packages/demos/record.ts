// Records demo.video.ts through tcut's library API. tcut's CLI (`tcut <script>`)
// intermittently exits before starting the shell, so this runs the same steps.
import path from "node:path";
import { isVideo } from "termcut";

/** GitHub's image proxy (camo) won't serve README/comment images over ~5 MB. */
const MAX_GIF_BYTES = 4_500_000;

const args = process.argv.slice(2);
const encodeOnly = args.includes("--encode-only");
const file = path.resolve(import.meta.dir, args.find((a) => !a.startsWith("--")) ?? "demo.video.ts");
const module = await import(file);
const video = module.default;
if (!isVideo(video)) throw new Error(`${file} must export default defineVideo(...)`);
video.source = file;

// Optional off-camera hooks, e.g. provisioning or cleaning up a stage.
const setup: (() => Promise<void>) | undefined = module.setup;
const teardown: (() => Promise<void>) | undefined = module.teardown;

if (encodeOnly) {
  // Re-encode the existing recording's MP4 outputs without re-recording.
  for (const output of video.config.output.filter((o: string) => o.endsWith(".mp4"))) {
    await encodeForWeb(path.resolve(import.meta.dir, output));
  }
  process.exit(0);
}

await setup?.();
try {
  const result = await video.run({ force: true, log: (message: string) => console.log(message) });
  for (const output of result.outputs) console.log(`wrote ${output}`);
  console.log(`${result.frames} frames, ${result.durationSeconds.toFixed(1)}s of video`);
  for (const output of result.outputs.filter((o: string) => o.endsWith(".mp4"))) {
    await encodeForWeb(output);
  }
} finally {
  await teardown?.();
}

/**
 * tcut sizes the composite from the browser's Retina capture (e.g. 5792×2160),
 * so shrink the MP4 to 1920 wide and write a README-sized GIF next to it.
 */
async function encodeForWeb(mp4: string) {
  const resized = mp4.replace(/\.mp4$/, ".resized.mp4");
  const gif = mp4.replace(/\.mp4$/, ".gif");
  await ffmpeg(["-i", mp4, "-vf", "scale=1920:-2:flags=lanczos", "-c:v", "libx264", "-crf", "23", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", resized]);
  await Bun.write(mp4, Bun.file(resized));
  await Bun.file(resized).delete();
  // GitHub proxies README/comment images through camo, which refuses anything
  // over ~5 MB (the image renders blank), so step down until the GIF fits.
  const attempts = [
    { width: 1280, fps: 10, colors: 128 },
    { width: 1024, fps: 8, colors: 96 },
    { width: 900, fps: 6, colors: 64 },
    { width: 800, fps: 5, colors: 48 },
  ];
  for (const { width, fps, colors } of attempts) {
    await ffmpeg([
      "-i", mp4,
      "-vf", `fps=${fps},scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      "-loop", "0", gif,
    ]);
    const size = Bun.file(gif).size;
    console.log(`${gif}: ${width}px ${fps}fps ${colors} colors → ${(size / 1e6).toFixed(1)} MB`);
    if (size <= MAX_GIF_BYTES) break;
  }
  if (Bun.file(gif).size > MAX_GIF_BYTES) throw new Error(`${gif} is still over ${MAX_GIF_BYTES} bytes`);
  console.log(`wrote ${mp4} (1920 wide) and ${gif}`);
}

async function ffmpeg(args: Array<string>) {
  const proc = Bun.spawn(["ffmpeg", "-v", "error", "-y", ...args], { stdout: "inherit", stderr: "inherit" });
  if ((await proc.exited) !== 0) throw new Error(`ffmpeg ${args.join(" ")} failed`);
}
