#!/usr/bin/env node --experimental-modules

import { join } from 'path';
import { promises as fsp } from 'fs';

import Koa from 'koa';
import serve from 'koa-static';
import mount from 'koa-mount';
import puppeteer from 'puppeteer';

const __dirname = import.meta.dirname;


(async () => {
    const pdf = 'pdf';
    const app = new Koa();

    const __dirname = import.meta.resolve('.').substring('file://'.length);

    app.use(mount('/pdf', serve(pdf)));
    app.use(mount('/pdfjs/', serve(join(__dirname, 'node_modules', 'pdfjs-dist', 'build'))));
    app.use(mount('/', serve(join(__dirname, 'web'))));

    const server = app.listen();
    const port = server.address().port;

    console.log(`Serving slides at http://localhost:${port}`);

    const files = await fsp.readdir(pdf);
    const browser = await puppeteer.launch();
    for (const file of files) {
        if (!file.endsWith('.pdf')) continue;

        const path = join('output', file.replace('.pdf', '.png'));
        const page = await browser.newPage();
        console.log(`http://localhost:${port}/index.html?url=${pdf}/${file}`);
        await page.goto(`http://localhost:${port}/index.html?url=${pdf}/${file}`);

        page.on('console', msg => {
            console.log('PAGE LOG:', msg.text());
        });
    
        await new Promise(resolve => {
            page.on('console', msg => {
                console.log('PAGE LOG:', msg.text());
                if (msg.text() === 'ready') resolve();
            });
        });

        const canvas = await page.$('#the-canvas');        
        await canvas.screenshot({ path });
        console.log('saved to', path);
        await page.close();
    }

    await browser.close();
    server.close();
})();