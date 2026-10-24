// "Living photo": turns one still picture into a 2.5D portrait that feels present.
// A small WebGL shader treats the middle of the picture (where a person usually is)
// as closer than the edges, so tilting the phone (or dragging, or an idle sway)
// moves the subject against the background like real depth. On top: gentle
// breathing, a soft sway at the edges like hair in a breeze, a small lift while
// she talks, and light that follows the tilt. Without WebGL it falls back to the
// plain picture with a CSS float. Used on Home, in the chat scene and in the alarm card.
window.createLivingPhoto = function createLivingPhoto(host, options) {
  'use strict';
  const opts = options || {};

  host.classList.add('living');
  host.innerHTML = '<div class="lp-frame"><canvas class="lp-canvas"></canvas><img class="lp-fallback" alt="" hidden>'
    + '<div class="lp-glare"></div><div class="lp-sparks">' + '<i>✦</i>'.repeat(5) + '</div></div>';
  const frame = host.querySelector('.lp-frame');
  const canvas = host.querySelector('canvas');
  const fallback = host.querySelector('.lp-fallback');
  const tiltFrame = opts.tiltFrame !== false; // the alarm card tilts itself; elsewhere the frame turns in 3D

  const VS = 'attribute vec2 p; varying vec2 uv; void main(){ uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }';
  const FS = `precision mediump float;
    uniform sampler2D img; uniform vec2 tilt; uniform float t; uniform float talk; uniform vec4 cover;
    varying vec2 uv;
    float bump(vec2 p, vec2 c, vec2 r) { vec2 d = (p - c) / r; return exp(-dot(d, d)); }
    void main() {
      vec2 p = uv;
      // Depth guess: a face in the upper middle, shoulders/body below it.
      float d = clamp(bump(p, vec2(.5, .4), vec2(.24, .26)) + .7 * bump(p, vec2(.5, .9), vec2(.42, .3)), 0., 1.);
      // Breathing: the lower half rises and falls a little.
      p.y -= sin(t * 1.25) * .007 * smoothstep(.45, 1., p.y) * (p.y - .45);
      // A breeze at the edges and the top (hair, background).
      float edge = smoothstep(.22, .5, abs(p.x - .5)) + .6 * smoothstep(.35, 0., p.y);
      p.x += sin(p.y * 10. + t * 1.7) * .0045 * edge;
      p.y += cos(p.x * 8. + t * 1.3) * .002 * edge;
      // Talking: a tiny lift around the face.
      p.y -= talk * .006 * (.5 + .5 * sin(t * 17.)) * bump(p, vec2(.5, .48), vec2(.14, .1));
      // Parallax: the subject moves more than the background.
      p -= tilt * (.04 * d - .014);
      vec2 q = cover.xy + p * cover.zw;
      vec3 c = texture2D(img, clamp(q, .002, .998)).rgb;
      // Light follows the tilt; the edges sink into the room's crimson shadow.
      float glow = .14 * exp(-pow(distance(uv, vec2(.5) + tilt * .35) / .45, 2.));
      float vig = smoothstep(.95, .35, distance(uv, vec2(.5, .45)));
      c = c * (.9 + glow) * mix(.55, 1., vig) + vec3(.55, .08, .18) * (1. - vig) * .18;
      gl_FragColor = vec4(c, 1.);
    }`;

  let gl = null, prog = null, tex = null, loc = {}, imgW = 1, imgH = 1, ready = false;
  try {
    gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: true }) || canvas.getContext('experimental-webgl');
    if (gl) {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const pl = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(pl);
      gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
      for (const n of ['img', 'tilt', 't', 'talk', 'cover']) loc[n] = gl.getUniformLocation(prog, n);
      tex = gl.createTexture();
    }
  } catch { gl = null; }
  if (!gl) { canvas.hidden = true; fallback.hidden = false; host.classList.add('lp-flat'); }

  function setSrc(src) {
    fallback.src = src;
    if (!gl) return;
    const im = new Image();
    im.onload = () => {
      imgW = im.naturalWidth; imgH = im.naturalHeight;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
      ready = true;
    };
    im.src = src;
  }

  // Tilt: phone motion, a finger/mouse over the picture, or an idle sway.
  let tx = 0, ty = 0, gx = 0, gy = 0, lastInput = 0, talkUntil = 0, raf = 0, dead = false;
  const onOrient = (e) => { if (e.gamma == null) return; lastInput = performance.now(); gx = Math.max(-1, Math.min(1, e.gamma / 25)); gy = Math.max(-1, Math.min(1, (e.beta - 45) / 25)); };
  const onPointer = (e) => { const r = host.getBoundingClientRect(); lastInput = performance.now(); gx = ((e.clientX - r.left) / r.width) * 2 - 1; gy = ((e.clientY - r.top) / r.height) * 2 - 1; };
  window.addEventListener('deviceorientation', onOrient);
  host.addEventListener('pointermove', onPointer);

  function frameLoop(now) {
    if (dead) return;
    raf = requestAnimationFrame(frameLoop);
    if (!host.isConnected || host.offsetParent === null || document.hidden) return; // off screen: skip the work
    if (now - lastInput > 2500) { gx = Math.sin(now / 2100) * .55; gy = Math.cos(now / 2900) * .35; }
    tx += (gx - tx) * .08; ty += (gy - ty) * .08;
    const s = host.style;
    s.setProperty('--lx', `${(50 + tx * 40).toFixed(1)}%`);
    s.setProperty('--ly', `${(45 + ty * 40).toFixed(1)}%`);
    if (tiltFrame) frame.style.transform = `rotateX(${(-ty * 9).toFixed(2)}deg) rotateY(${(tx * 12).toFixed(2)}deg)`;
    if (!gl || !ready) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    // object-fit: cover, biased a little toward the top (faces).
    const ca = w / h, ia = imgW / imgH;
    const sx = ia > ca ? ca / ia : 1, sy = ia > ca ? 1 : ia / ca;
    gl.uniform4f(loc.cover, (1 - sx) / 2, (1 - sy) * .3, sx, sy);
    gl.uniform2f(loc.tilt, tx, ty);
    gl.uniform1f(loc.t, now / 1000);
    gl.uniform1f(loc.talk, now < talkUntil ? 1 : 0);
    gl.uniform1i(loc.img, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  raf = requestAnimationFrame(frameLoop);

  return {
    setSrc,
    talk(ms) { talkUntil = performance.now() + Math.min(ms, 12000); host.classList.add('talking'); setTimeout(() => host.classList.remove('talking'), Math.min(ms, 12000)); },
    destroy() { dead = true; cancelAnimationFrame(raf); window.removeEventListener('deviceorientation', onOrient); host.removeEventListener('pointermove', onPointer); },
  };
};
