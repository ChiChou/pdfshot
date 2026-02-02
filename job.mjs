#!/usr/bin/env node --experimental-modules

import { join } from "node:path";
import { promises as fsp } from "node:fs";
import { parseArgs } from "node:util";

import { Hono } from "hono";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import puppeteer from "puppeteer";
import sharp from "sharp";

(async function main() {
  const validFormats = ["png", "jpg", "jpeg", "webp", "avif", "tif", "jxl"];

  const { values } = parseArgs({
    options: {
      input: { type: "string", short: "i", default: "pdf" },
      output: { type: "string", short: "o", default: "output" },
      size: { type: "string", short: "s", default: "1920x1080" },
      format: { type: "string", short: "f", default: "png" },
      quality: { type: "string", short: "q", default: "80" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(
      "Usage: job.mjs [options]\n" +
        "  --input, -i    Input directory (default: 'pdf')\n" +
        "  --output, -o   Output directory (default: 'output')\n" +
        "  --size, -s     Output image size (default: '1920x1080')\n" +
        "  --format, -f   Output format: png, jpg, jpeg, webp, avif, tif, jxl (default: 'png')\n" +
        "  --quality, -q  Image quality 1-100, for lossy formats (default: '80')",
    );
    process.exit(0);
  }

  if (!/^\d+x\d+$/.test(values.size)) {
    console.error(
      `Invalid size format "${values.size}". Expected format: WxH (e.g., 1920x1080)`,
    );
    process.exit(1);
  }

  if (!validFormats.includes(values.format)) {
    console.error(
      `Invalid format "${values.format}". Supported formats: ${validFormats.join(", ")}`,
    );
    process.exit(1);
  }

  const quality = parseInt(values.quality, 10);
  if (isNaN(quality) || quality < 1 || quality > 100) {
    console.error(`Invalid quality "${values.quality}". Must be 1-100.`);
    process.exit(1);
  }

  const [width, height] = values.size.split("x").map(Number);
  const { input, output, format } = values;

  if (
    !(await fsp
      .access(input)
      .catch(() => false)
      .then(() => true))
  ) {
    console.error(`Input directory "${input}" does not exist.`);
    process.exit(1);
  }

  const app = new Hono();

  app.use(logger());
  app.get(
    "/pdf/*",
    serveStatic({
      root: "./",
      rewriteRequestPath: (path) => path.replace(/^\/pdf/, "/pdf"),
    }),
  );
  app.get(
    "/pdfjs/*",
    serveStatic({
      root: "./",
      rewriteRequestPath: (path) =>
        path.replace(/^\/pdfjs/, "/node_modules/pdfjs-dist/build"),
    }),
  );
  app.get(
    "/*",
    serveStatic({
      root: "./web",
      index: "index.html",
    }),
  );

  const server = serve({ fetch: app.fetch, port: 0 });
  const port = server.address().port;

  console.log(`Serving slides at http://localhost:${port}`);

  await fsp.access(output).catch(() => fsp.mkdir(output));

  const files = await fsp.readdir(input);
  const browser = await puppeteer.launch();

  for (const file of files) {
    if (!file.endsWith(".pdf")) continue;

    const path = join(output, file.replace(".pdf", `.${format}`));
    const page = await browser.newPage();
    const pageUrl = `http://localhost:${port}/?url=${input}/${encodeURIComponent(file)}&width=${width}&height=${height}`;
    console.log(pageUrl);
    await page.goto(pageUrl);

    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

    await new Promise((resolve) => {
      page.on("console", (msg) => {
        console.log("PAGE LOG:", msg.text());
        if (msg.text() === "ready") resolve();
      });
    });

    const canvas = await page.$("#the-canvas");

    // Puppeteer supports: png, jpeg, webp
    // Use sharp for formats requiring conversion: avif, tif, jxl
    const sharpFormats = ["avif", "tif", "jxl"];
    if (sharpFormats.includes(format)) {
      const buffer = await canvas.screenshot({ type: "png" });
      let img = sharp(buffer);
      if (format === "avif") {
        img = img.avif({ quality });
      } else if (format === "tif") {
        img = img.tiff({ quality });
      } else if (format === "jxl") {
        img = img.jxl({ quality });
      }
      await img.toFile(path);
    } else {
      const type = format === "jpg" ? "jpeg" : format;

      // Quality only applies to jpeg and webp in puppeteer
      const opts = { path, type };
      if (type === "jpeg" || type === "webp") {
        opts.quality = quality;
      }
      await canvas.screenshot(opts);
    }

    console.log("saved to", path);
    await page.close();
  }

  await browser.close();
  server.close();

  process.exit(0);
})();
