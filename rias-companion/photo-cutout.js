// Cuts the subject out of a photo so it can step out of the alarm card's frame.
// Runs on the phone with Google's MediaPipe "magic touch" segmenter: the engine and
// model (~20 MB) are downloaded once, only when you choose a pop-out photo; the
// photo itself never leaves the phone. Result: the subject on a transparent
// background (WebP), or null when the cutout doesn't look right.
window.RiasCutout = (() => {
  'use strict';
  const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/latest/magic_touch.tflite';
  let segmenter = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.Vision) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('script'));
      document.head.append(s);
    });
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src; });
  }
  async function getSegmenter() {
    if (segmenter) return segmenter;
    await loadScript('vendor/mediapipe/vision_bundle.js');
    const files = await window.Vision.FilesetResolver.forVisionTasks(WASM);
    segmenter = await window.Vision.InteractiveSegmenterLegacy.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, outputConfidenceMasks: true, outputCategoryMask: false,
    });
    return segmenter;
  }

  // The subject is usually in the middle; try a couple of points and keep the best-sized mask.
  async function cut(dataUrl) {
    const seg = await getSegmenter();
    const img = await loadImage(dataUrl);
    let best = null;
    for (const pt of [{ x: 0.5, y: 0.38 }, { x: 0.5, y: 0.55 }, { x: 0.5, y: 0.25 }]) {
      const res = seg.segment(img, { keypoint: pt });
      const m = res.confidenceMasks && res.confidenceMasks[0];
      if (!m) continue;
      const data = m.getAsFloat32Array().slice();
      const w = m.width, h = m.height;
      res.confidenceMasks.forEach((x) => x.close && x.close());
      let on = 0;
      for (let i = 0; i < data.length; i++) if (data[i] > 0.5) on++;
      const cover = on / data.length;
      // A real subject covers a fair part of the picture, but not all of it.
      const score = cover > 0.06 && cover < 0.9 ? 1 - Math.abs(cover - 0.4) : -1;
      if (!best || score > best.score) best = { data, w, h, score, cover };
    }
    if (!best || best.score < 0) return null;

    // Mask → soft-edged alpha at the photo's size.
    const mc = document.createElement('canvas');
    mc.width = best.w; mc.height = best.h;
    const mctx = mc.getContext('2d');
    const md = mctx.createImageData(best.w, best.h);
    for (let i = 0; i < best.data.length; i++) {
      const a = Math.max(0, Math.min(1, (best.data[i] - 0.35) / 0.3)); // smoothstep-ish edge
      md.data[i * 4 + 3] = Math.round(a * 255);
    }
    mctx.putImageData(md, 0, 0);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.filter = 'blur(1px)';
    ctx.drawImage(mc, 0, 0, c.width, c.height);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(img, 0, 0);
    // Crop to the subject (keeping a little room) so it can fill the card.
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y += 2) {
      for (let x = 0; x < c.width; x += 2) {
        if (px[(y * c.width + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 <= x0 || y1 <= y0) return null;
    const pad = Math.round(Math.max(c.width, c.height) * 0.015);
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width, x1 + pad); y1 = Math.min(c.height, y1 + pad);
    const out = document.createElement('canvas');
    out.width = x1 - x0; out.height = y1 - y0;
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return { cutout: out.toDataURL('image/webp', 0.9), cover: best.cover };
  }

  return { cut };
})();
