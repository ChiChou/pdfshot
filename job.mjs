#!/usr/bin/env node --experimental-modules

import { join } from "path";
import { promises as fsp } from "fs";
import { parseArgs } from "util";

import { Hono } from "hono";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import puppeteer from "puppeteer";

(async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string", short: "i", default: "pdf" },
      output: { type: "string", short: "o", default: "output" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(
      "Usage: job.mjs [--input|-i <dir>] [--output|-o <dir>]\n" +
        "  --input, -i   Input directory (default: 'pdf')\n" +
        "  --output, -o  Output directory (default: 'output')",
    );
    process.exit(0);
  }

  const input = values.input;
  const output = values.output;

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
  app.get("/", async (c) =>
    c.html(await fsp.readFile(join("web", "index.html"), "utf-8")),
  );

  const server = serve({ fetch: app.fetch, port: 0 });
  const port = server.address().port;

  console.log(`Serving slides at http://localhost:${port}`);

  await fsp.access(output).catch(() => fsp.mkdir(output));

  const files = await fsp.readdir(input);
  const browser = await puppeteer.launch();

  for (const file of files) {
    if (!file.endsWith(".pdf")) continue;

    const path = join("output", file.replace(".pdf", ".png"));
    const page = await browser.newPage();
    console.log(
      `http://localhost:${port}/?url=${input}/${encodeURIComponent(file)}`,
    );
    await page.goto(
      `http://localhost:${port}/?url=${input}/${encodeURIComponent(file)}`,
    );

    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

    await new Promise((resolve) => {
      page.on("console", (msg) => {
        console.log("PAGE LOG:", msg.text());
        if (msg.text() === "ready") resolve();
      });
    });

    const canvas = await page.$("#the-canvas");
    await canvas.screenshot({ path });
    console.log("saved to", path);
    await page.close();
  }

  await browser.close();
  server.close();

  process.exit(0);
})();
