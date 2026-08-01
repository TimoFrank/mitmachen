import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

let sharp;
try {
  sharp = require("sharp");
} catch {
  throw new Error(
    "Das Paket sharp wurde nicht gefunden. Setze NODE_PATH auf das gebündelte Workspace-node_modules oder installiere sharp lokal."
  );
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const exportDirectory = join(
  repositoryRoot,
  "dokumentation",
  "assets",
  "brand",
  "mitmachen-alternativen",
  "motion",
  "exports"
);

const NAVY = "#08164F";
const GREEN = "#00A846";
const WHITE = "#FFFFFF";
const MINT = "#35F28A";
const SIGNET_LOOP_DURATION_SECONDS = 4.8;
const LOCKUP_REVEAL_DURATION_SECONDS = 3.2;
const FRAMES_PER_SECOND = 30;

function resolveFfmpeg() {
  const candidate = process.env.FFMPEG_BIN?.trim() || "ffmpeg";
  const pathProbe = spawnSync(candidate, ["-version"], { stdio: "ignore" });
  if (pathProbe.status === 0) return candidate;

  throw new Error(
    "ffmpeg wurde nicht gefunden. Installiere ffmpeg 6+ im PATH oder setze FFMPEG_BIN auf das Binary."
  );
}

function cubicBezier(x1, y1, x2, y2) {
  const sampleX = (t) =>
    ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t +
    3 * x1 * t;
  const sampleY = (t) =>
    ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t +
    3 * y1 * t;
  const sampleDerivativeX = (t) =>
    (3 * (1 - 3 * x2 + 3 * x1) * t + 2 * (3 * x2 - 6 * x1)) * t +
    3 * x1;

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    let estimate = x;
    for (let index = 0; index < 8; index += 1) {
      const error = sampleX(estimate) - x;
      const derivative = sampleDerivativeX(estimate);
      if (Math.abs(error) < 1e-7 || Math.abs(derivative) < 1e-7) break;
      estimate -= error / derivative;
    }

    let lower = 0;
    let upper = 1;
    estimate = Math.min(1, Math.max(0, estimate));
    for (let index = 0; index < 12; index += 1) {
      const position = sampleX(estimate);
      if (Math.abs(position - x) < 1e-7) break;
      if (position < x) lower = estimate;
      else upper = estimate;
      estimate = (lower + upper) / 2;
    }

    return sampleY(estimate);
  };
}

const weaveEase = cubicBezier(0.33, 0, 0.2, 1);
const wordEase = cubicBezier(0.22, 1, 0.36, 1);

function progressBetween(time, start, end, easing = weaveEase) {
  if (time <= start) return 0;
  if (time >= end) return 1;
  return easing((time - start) / (end - start));
}

function loopBandProgress(time, outStart, outEnd, inStart, inEnd) {
  if (time < outStart) return 1;
  if (time < outEnd) return 1 - progressBetween(time, outStart, outEnd);
  if (time < inStart) return 0;
  if (time < inEnd) return progressBetween(time, inStart, inEnd);
  return 1;
}

function squareLoopProgress(time) {
  return {
    verticalLeft: loopBandProgress(time, 1.848, 2.352, 2.549, 3.149),
    horizontalTop: loopBandProgress(time, 1.752, 2.16, 2.65, 3.25),
    verticalRight: loopBandProgress(time, 1.656, 2.064, 2.75, 3.35),
    horizontalBottom: loopBandProgress(time, 1.55, 1.968, 2.851, 3.451),
  };
}

function revealProgress(time) {
  return {
    verticalLeft: progressBetween(time, 0.08, 0.68),
    horizontalTop: progressBetween(time, 0.18, 0.78),
    verticalRight: progressBetween(time, 0.28, 0.88),
    horizontalBottom: progressBetween(time, 0.38, 0.98),
    word: progressBetween(time, 0.82, 1.42, wordEase),
  };
}

function number(value) {
  return Number(value.toFixed(4));
}

function markMasks(progress, prefix, x = 0, y = 0) {
  const size = 64;
  const verticalLeftHeight = size * progress.verticalLeft;
  const horizontalTopWidth = size * progress.horizontalTop;
  const verticalRightHeight = size * progress.verticalRight;
  const horizontalBottomWidth = size * progress.horizontalBottom;

  return `
    <mask id="${prefix}-v1" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${size}" height="${size}">
      <rect x="${x}" y="${y}" width="${size}" height="${number(verticalLeftHeight)}" fill="#fff"/>
    </mask>
    <mask id="${prefix}-h1" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${size}" height="${size}">
      <rect x="${x}" y="${y}" width="${number(horizontalTopWidth)}" height="${size}" fill="#fff"/>
    </mask>
    <mask id="${prefix}-v2" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${size}" height="${size}">
      <rect x="${x}" y="${number(y + size - verticalRightHeight)}" width="${size}" height="${number(verticalRightHeight)}" fill="#fff"/>
    </mask>
    <mask id="${prefix}-h2" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${size}" height="${size}">
      <rect x="${number(x + size - horizontalBottomWidth)}" y="${y}" width="${number(horizontalBottomWidth)}" height="${size}" fill="#fff"/>
    </mask>`;
}

function markPaths(prefix, verticalColor, horizontalColor) {
  return `
    <g fill="none" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M23 8 20.2 35M18.9 47 18 56" stroke="${verticalColor}" mask="url(#${prefix}-v1)"/>
      <path d="M9 23.5h6.5M27.5 23.5H55" stroke="${horizontalColor}" mask="url(#${prefix}-h1)"/>
      <path d="M46 8 45 17.5M43.8 29.5 41 56" stroke="${verticalColor}" mask="url(#${prefix}-v2)"/>
      <path d="M8 41h28M48 41h6" stroke="${horizontalColor}" mask="url(#${prefix}-h2)"/>
    </g>`;
}

function wordPaths(color) {
  return `
    <g transform="translate(78 72) scale(.066 -.066)" fill="${color}">
      <path transform="translate(0.000 0.000)" d="M80 0L80 653L231 653L340 348Q350 319 358.5 288.5Q367 258 376 224L380 224Q390 258 398 288.5Q406 319 416 348L523 653L674 653L674 0L553 0L553 268Q553 300 556 341.5Q559 383 563 425Q567 467 571 497L567 497L515 329L416 58L334 58L236 329L185 497L181 497Q185 467 189 425Q193 383 196 341.5Q199 300 199 268L199 0Z"/>
      <path transform="translate(743.680 0.000)" d="M68 0L68 493L200 493L200 0ZM134 573Q100 573 79 592.5Q58 612 58 645Q58 677 79 696.5Q100 716 134 716Q168 716 189 696.5Q210 677 210 645Q210 612 189 592.5Q168 573 134 573Z"/>
      <path transform="translate(1002.671 0.000)" d="M251 -10Q162 -10 124.5 41Q87 92 87 174L87 390L19 390L19 489L95 493L110 646L218 646L218 493L341 493L341 390L218 390L218 175Q218 133 236 113.5Q254 94 286 94Q298 94 310.5 95Q323 96 335 102L357 10Q338 2 311 -4Q284 -10 251 -10Z"/>
      <path transform="translate(1364.591 0.000)" d="M69 0L69 494L176 494L186 428L189 428Q220 460 256 483Q292 506 340 506Q393 506 425.5 483.5Q458 461 476 420Q510 456 547.5 481Q585 506 633 506Q713 506 749.5 453.5Q786 401 786 308L786 0L655 0L655 291Q655 348 638.5 371Q622 394 587 394Q566 394 543 380.5Q520 367 493 339L493 0L362 0L362 291Q362 348 345.5 371Q329 394 294 394Q251 394 200 339L200 0Z"/>
      <path transform="translate(2204.734 0.000)" d="M191 -12Q146 -12 113 6.5Q80 25 62 58.5Q44 92 44 135Q44 216 112 259Q180 302 329 318Q327 341 319 359.5Q311 378 293 388.5Q275 399 245 399Q211 399 177.5 387Q144 375 110 354L63 442Q92 460 125 474.5Q158 489 194 497Q230 505 269 505Q332 505 374 480.5Q416 456 438 408Q460 360 460 287L460 0L352 0L343 53L339 53Q306 24 270 6Q234 -12 191 -12ZM233 93Q261 93 283.5 104.5Q306 116 329 138L329 232Q269 225 234 213Q199 201 185 183.5Q171 166 171 145Q171 117 188.5 105Q206 93 233 93Z"/>
      <path transform="translate(2716.334 0.000)" d="M283 -12Q213 -12 158 18.5Q103 49 71 107Q39 165 39 246Q39 328 73.5 386Q108 444 166 474.5Q224 505 291 505Q338 505 373.5 490.5Q409 476 436 451L373 370Q358 383 340 391Q322 399 298 399Q261 399 232.5 380Q204 361 188.5 327.5Q173 294 173 246Q173 200 189 166.5Q205 133 232 114Q259 95 296 95Q322 95 346 104.5Q370 114 389 130L441 49Q410 22 369 5Q328 -12 283 -12Z"/>
      <path transform="translate(3171.134 0.000)" d="M69 0L69 703L200 703L200 527L194 434Q224 462 261.5 484Q299 506 350 506Q430 506 466 453.5Q502 401 502 308L502 0L371 0L371 291Q371 348 354.5 371Q338 394 302 394Q272 394 250 380Q228 366 200 339L200 0Z"/>
      <path transform="translate(3725.852 0.000)" d="M286 -12Q215 -12 159 19Q103 50 70.5 107.5Q38 165 38 247Q38 327 71.5 385Q105 443 157.5 474Q210 505 269 505Q338 505 384 474.5Q430 444 453 391Q476 338 476 270Q476 253 474 236Q472 219 470 207L137 207L137 301L362 301Q362 348 340 376Q318 404 271 404Q245 404 220.5 390Q196 376 180 341.5Q164 307 164 247Q165 190 184.5 156Q204 122 235.5 106.5Q267 91 302 91Q333 91 360.5 99.5Q388 108 413 124L458 41Q422 17 377 2.5Q332 -12 286 -12Z"/>
      <path transform="translate(4228.172 0.000)" d="M69 0L69 494L176 494L186 429L189 429Q222 461 260.5 483.5Q299 506 350 506Q430 506 466 453.5Q502 401 502 308L502 0L371 0L371 291Q371 348 354.5 371Q338 394 302 394Q272 394 250 380Q228 366 200 339L200 0Z"/>
    </g>`;
}

function squareFrameSvg(time, { background = null } = {}) {
  const progress = squareLoopProgress(time);
  const verticalColor = background ? WHITE : NAVY;
  const horizontalColor = background ? MINT : GREEN;
  const prefix = "square";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
    ${background ? `<rect width="1080" height="1080" fill="${background}"/>` : ""}
    <defs>${markMasks(progress, prefix)}</defs>
    <g transform="translate(270 270) scale(8.4375)">
      ${markPaths(prefix, verticalColor, horizontalColor)}
    </g>
  </svg>`;
}

function lockupFrameSvg(time) {
  const progress = revealProgress(time);
  const prefix = "lockup";
  const wordWidth = 332 * progress.word;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <rect width="1920" height="1080" fill="${NAVY}"/>
    <g transform="translate(304 386.4) scale(3.2)">
      <defs>
        ${markMasks(progress, prefix, 8, 16)}
        <mask id="${prefix}-word" maskUnits="userSpaceOnUse" x="78" y="0" width="332" height="96">
          <rect x="78" width="${number(wordWidth)}" height="96" fill="#fff"/>
        </mask>
      </defs>
      <g mask="url(#${prefix}-v1)">
        <g transform="translate(8 16)">
          <path d="M23 8 20.2 35M18.9 47 18 56" fill="none" stroke="${WHITE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </g>
      <g mask="url(#${prefix}-h1)">
        <g transform="translate(8 16)">
          <path d="M9 23.5h6.5M27.5 23.5H55" fill="none" stroke="${MINT}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </g>
      <g mask="url(#${prefix}-v2)">
        <g transform="translate(8 16)">
          <path d="M46 8 45 17.5M43.8 29.5 41 56" fill="none" stroke="${WHITE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </g>
      <g mask="url(#${prefix}-h2)">
        <g transform="translate(8 16)">
          <path d="M8 41h28M48 41h6" fill="none" stroke="${MINT}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </g>
      <g mask="url(#${prefix}-word)">
        ${wordPaths(WHITE)}
      </g>
    </g>
  </svg>`;
}

async function renderFrames({
  directory,
  duration,
  frameBuilder,
  width,
  height,
}) {
  await mkdir(directory, { recursive: true });
  const frameCount = Math.round(duration * FRAMES_PER_SECOND);
  const concurrency = 8;

  for (let start = 0; start < frameCount; start += concurrency) {
    const jobs = [];
    for (
      let frameIndex = start;
      frameIndex < Math.min(start + concurrency, frameCount);
      frameIndex += 1
    ) {
      const time = frameIndex / FRAMES_PER_SECOND;
      const fileName = `frame-${String(frameIndex).padStart(4, "0")}.png`;
      jobs.push(
        sharp(Buffer.from(frameBuilder(time)))
          .resize(width, height)
          .png({ compressionLevel: 9, adaptiveFiltering: false })
          .toFile(join(directory, fileName))
      );
    }
    await Promise.all(jobs);
  }
}

function runFfmpeg(ffmpeg, argumentsList) {
  const result = spawnSync(ffmpeg, argumentsList, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg ist fehlgeschlagen:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`
    );
  }
}

async function main() {
  const ffmpeg = resolveFfmpeg();
  await mkdir(exportDirectory, { recursive: true });
  const temporaryRoot = await mkdtemp(join(tmpdir(), "flechtwerk-motion-"));
  const squareAlphaFrames = join(temporaryRoot, "square-alpha");
  const squareDarkFrames = join(temporaryRoot, "square-dark");
  const lockupFrames = join(temporaryRoot, "lockup");

  try {
    await renderFrames({
      directory: squareAlphaFrames,
      duration: SIGNET_LOOP_DURATION_SECONDS,
      frameBuilder: (time) => squareFrameSvg(time),
      width: 1080,
      height: 1080,
    });

    await renderFrames({
      directory: squareDarkFrames,
      duration: SIGNET_LOOP_DURATION_SECONDS,
      frameBuilder: (time) => squareFrameSvg(time, { background: NAVY }),
      width: 1080,
      height: 1080,
    });

    await renderFrames({
      directory: lockupFrames,
      duration: LOCKUP_REVEAL_DURATION_SECONDS,
      frameBuilder: lockupFrameSvg,
      width: 1920,
      height: 1080,
    });

    await sharp(Buffer.from(squareFrameSvg(0, { background: NAVY })))
      .png({ compressionLevel: 9 })
      .toFile(join(exportDirectory, "flechtwerk-signet-poster-dark-1080.png"));

    await sharp(Buffer.from(lockupFrameSvg(LOCKUP_REVEAL_DURATION_SECONDS)))
      .png({ compressionLevel: 9 })
      .toFile(join(exportDirectory, "flechtwerk-lockup-poster-dark-1920x1080.png"));

    const squareAlphaInput = join(squareAlphaFrames, "frame-%04d.png");
    const squareDarkInput = join(squareDarkFrames, "frame-%04d.png");
    const lockupInput = join(lockupFrames, "frame-%04d.png");

    runFfmpeg(ffmpeg, [
      "-y",
      "-framerate",
      String(FRAMES_PER_SECOND),
      "-i",
      squareDarkInput,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      join(exportDirectory, "flechtwerk-signet-loop-dark-1080.mp4"),
    ]);

    runFfmpeg(ffmpeg, [
      "-y",
      "-framerate",
      String(FRAMES_PER_SECOND),
      "-i",
      squareDarkInput,
      "-filter_complex",
      "fps=20,scale=640:640:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none",
      "-loop",
      "0",
      join(exportDirectory, "flechtwerk-signet-loop-dark-640.gif"),
    ]);

    runFfmpeg(ffmpeg, [
      "-y",
      "-framerate",
      String(FRAMES_PER_SECOND),
      "-i",
      squareAlphaInput,
      "-an",
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      "yuva420p",
      "-auto-alt-ref",
      "0",
      "-b:v",
      "0",
      "-crf",
      "24",
      "-metadata:s:v:0",
      "alpha_mode=1",
      join(exportDirectory, "flechtwerk-signet-loop-alpha-1080.webm"),
    ]);

    runFfmpeg(ffmpeg, [
      "-y",
      "-framerate",
      String(FRAMES_PER_SECOND),
      "-i",
      lockupInput,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      join(exportDirectory, "flechtwerk-lockup-reveal-dark-1920x1080.mp4"),
    ]);

    const outputs = [
      "flechtwerk-signet-loop-dark-640.gif",
      "flechtwerk-signet-loop-dark-1080.mp4",
      "flechtwerk-signet-loop-alpha-1080.webm",
      "flechtwerk-lockup-reveal-dark-1920x1080.mp4",
      "flechtwerk-signet-poster-dark-1080.png",
      "flechtwerk-lockup-poster-dark-1920x1080.png",
    ];

    console.log(`Motion-Exporte erzeugt mit ${ffmpeg}:`);
    for (const output of outputs) {
      console.log(`- ${join(exportDirectory, output)}`);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
