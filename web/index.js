/** @type {typeof import('pdfjs-dist')} */
const pdfjsLib = globalThis.pdfjsLib;

/**
 * @typedef {Object} RenderOptions
 * @property {string} url - PDF URL to render
 * @property {number} width - Target canvas width
 * @property {number} height - Target canvas height
 */

/**
 * Parse URL search params to get render options
 * @returns {RenderOptions}
 */
function getOptionsFromURL() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("url");
  const width = parseInt(params.get("width") || "1920", 10);
  const height = parseInt(params.get("height") || "1080", 10);

  if (typeof url !== "string" || !url) {
    throw new Error("Missing 'url' parameter");
  }

  return { url, width, height };
}

/**
 * Calculate scale and offset for cover-style rendering
 * @param {number} srcWidth - Source width
 * @param {number} srcHeight - Source height
 * @param {number} dstWidth - Destination width
 * @param {number} dstHeight - Destination height
 * @returns {{ scale: number, offsetX: number, offsetY: number }}
 */
function calculateCoverTransform(srcWidth, srcHeight, dstWidth, dstHeight) {
  const srcRatio = srcWidth / srcHeight;
  const dstRatio = dstWidth / dstHeight;

  let scale;
  let offsetX = 0;
  let offsetY = 0;

  if (srcRatio > dstRatio) {
    // Source is wider than destination - scale by height, crop width
    scale = dstHeight / srcHeight;
    offsetX = (dstWidth - srcWidth * scale) / 2;
  } else {
    // Source is taller than destination - scale by width, crop height
    scale = dstWidth / srcWidth;
    offsetY = (dstHeight - srcHeight * scale) / 2;
  }

  return { scale, offsetX, offsetY };
}

/**
 * Render the first page of a PDF to a canvas with cover-style scaling
 * @param {RenderOptions} options
 */
async function renderPDF(options) {
  const { url, width, height } = options;

  pdfjsLib.GlobalWorkerOptions.workerSrc = "pdfjs/pdf.worker.mjs";

  const loadingTask = pdfjsLib.getDocument(url);
  const pdf = await loadingTask.promise;

  const page = await pdf.getPage(1);
  const originalViewport = page.getViewport({ scale: 1 });

  const { scale, offsetX, offsetY } = calculateCoverTransform(
    originalViewport.width,
    originalViewport.height,
    width,
    height
  );

  const canvas = /** @type {HTMLCanvasElement} */ (
    document.getElementById("the-canvas")
  );
  canvas.width = width;
  canvas.height = height;

  const canvasContext = canvas.getContext("2d");

  const renderContext = {
    canvasContext,
    viewport: page.getViewport({ scale, offsetX, offsetY }),
  };

  await page.render(renderContext).promise;

  console.log("ready");
}

// Main
console.log(window.location.search);
const options = getOptionsFromURL();
renderPDF(options);
