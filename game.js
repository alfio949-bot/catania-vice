/* CATANIA VICE 6 - open world 3D su dati reali OpenStreetMap di Catania */
(function () {
  'use strict';
  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var TAU = Math.PI * 2;
  function angLerp(a, b, t) { var d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; }
  function b64buf(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

  /* ---------------- decode map ---------------- */
  var bBuf = b64buf(CAT_MAP.b), bv = new DataView(bBuf), NB = (bBuf.byteLength / 7) | 0;
  var BLD = new Array(NB);
  var PALETTE = [0xd8cfbe, 0xcfc0a6, 0xc2b49b, 0xb8ada0, 0xd9c8a8, 0xa89e93, 0xe0d6c4, 0xc9a98a];
  for (var i = 0; i < NB; i++) {
    var o = i * 7, w = bv.getUint8(o + 4), h = bv.getUint8(o + 5);
    BLD[i] = {
      x: bv.getInt16(o, true), z: bv.getInt16(o + 2, true), w: w, h: h,
      a: bv.getUint8(o + 6) / 256 * TAU - Math.PI,
      hh: 7 + Math.min(23, Math.sqrt(w * h) * 0.42) * (0.85 + ((i * 131) % 97) / 323),
      col: PALETTE[(i * 7919) % PALETTE.length]
    };
  }
  var lBuf = b64buf(CAT_MAP.l), lv = new DataView(lBuf), LINES = [], lo = 0;
  while (lo < lBuf.byteLength) {
    var cnt = lv.getUint8(lo), cls = lv.getUint8(lo + 1);
    var px = lv.getInt16(lo + 2, true), pz = lv.getInt16(lo + 4, true); lo += 6;
    var pts = [[px * 3, pz * 3]];
    for (var j = 1; j < cnt; j++) { px += lv.getInt8(lo); pz += lv.getInt8(lo + 1); lo += 2; pts.push([px * 3, pz * 3]); }
    LINES.push({ c: cls, p: pts });
  }
  var WID = [17, 16, 14, 12, 11, 9, 8, 7, 6, 10, 10, 10, 5, 0, 0, 3];

  /* ---------------- three setup: NOTTE CINEMATOGRAFICA ---------------- */
  var canvas = document.getElementById('game');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
  var QUALITY = (location.search.match(/q=(\d)/) || [0, 0])[1] | 0; /* 0 auto, 1 bassa, 2 media, 3 alta/4K */
  var dprMax = QUALITY === 3 ? 3 : (QUALITY === 1 ? 1 : 2);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprMax));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  var NIGHT = 0x0a1020;
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.FogExp2(0x120f1e, 0.0021);
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.8, 3600);

  /* cielo notturno con stelle + alone arancione dell'eruzione */
  var skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { t: { value: 0 } },
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 p; uniform float t;',
      'float h(vec2 s){ return fract(sin(dot(s, vec2(12.9898,78.233)))*43758.5453); }',
      'void main(){',
      ' float y = clamp(p.y,0.0,1.0);',
      ' vec3 top = vec3(0.012,0.02,0.055); vec3 hor = vec3(0.10,0.07,0.13);',
      ' vec3 c = mix(hor, top, pow(y,0.55));',
      ' vec2 sp = floor(vec2(atan(p.x,p.z)*220.0, p.y*220.0));',
      ' float st = step(0.9965, h(sp)) * smoothstep(0.08,0.4,p.y) * (0.5+0.5*sin(t*2.0+h(sp)*40.0));',
      ' c += vec3(st);',
      ' float g = exp(-pow(distance(normalize(p.xz), normalize(vec2(0.35,-0.94))) * 2.6, 2.0)) * exp(-p.y*3.2);',
      ' c += vec3(0.62,0.20,0.05) * g * 0.75;',
      ' gl_FragColor = vec4(c,1.0);',
      '}'
    ].join('\n')
  });
  var sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 18), skyMat);
  sky.renderOrder = -10; scene.add(sky);

  /* luna come luce direzionale fredda, ombre morbide */
  scene.add(new THREE.HemisphereLight(0x3b4a7a, 0x1b1420, 0.55));
  var sun = new THREE.DirectionalLight(0x8fa6d8, 0.85);
  sun.position.set(-180, 320, 140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY === 3 ? 4096 : 2048, QUALITY === 3 ? 4096 : 2048);
  sun.shadow.camera.left = -140; sun.shadow.camera.right = 140; sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  scene.add(sun); scene.add(sun.target);

  /* ---- Etna in eruzione ---- */
  var ETNA = { x: 740, z: -2350 };
  (function () {
    var g = new THREE.ConeGeometry(1500, 1500, 56, 14, true);
    var pos = g.attributes.position, col = [];
    for (var i = 0; i < pos.count; i++) {
      var y = pos.getY(i), a = Math.atan2(pos.getX(i), pos.getZ(i)), r = Math.hypot(pos.getX(i), pos.getZ(i));
      var n = Math.sin(a * 7 + y * 0.011) * 38 + Math.sin(a * 17 + y * 0.03) * 14 + Math.sin(a * 3 - y * 0.006) * 70;
      var k = (y + 750) / 1500;
      pos.setX(i, pos.getX(i) + Math.sin(a) * n * (1 - k)); pos.setZ(i, pos.getZ(i) + Math.cos(a) * n * (1 - k));
      var lava = Math.pow(Math.max(0, Math.sin(a * 9 + y * 0.02) * Math.sin(a * 4 - y * 0.015)), 3) * smoothstep01(k, 0.52, 0.97);
      var rr = 0.05 + lava * 2.4, gg = 0.04 + lava * 0.62, bb = 0.06 + lava * 0.05;
      col.push(rr, gg, bb);
    }
    function smoothstep01(x, a, b) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0x2a0d00, emissiveIntensity: 1.0, fog: false }));
    m.position.set(ETNA.x, 560, ETNA.z); scene.add(m);
    var crater = new THREE.PointLight(0xff6a1a, 4.2, 4200, 1.3); crater.position.set(ETNA.x, 1360, ETNA.z + 40); scene.add(crater);
    var glow = new THREE.Mesh(new THREE.SphereGeometry(70, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff8a2a, fog: false }));
    glow.position.set(ETNA.x, 1330, ETNA.z + 20); scene.add(glow);
    /* colonna di fumo e cenere */
    var puffs = [];
    var pg = new THREE.IcosahedronGeometry(1, 2);
    for (var p = 0; p < 46; p++) {
      var f = p / 46;
      var hot = f < 0.4;
      var pm = new THREE.MeshBasicMaterial({ color: hot ? 0xff7a2c : 0x3a2a30, transparent: true, opacity: hot ? 0.5 : 0.62, fog: false, depthWrite: false });
      var mesh = new THREE.Mesh(pg, pm);
      var rad = 55 + f * 210 + Math.random() * 40;
      mesh.scale.setScalar(rad);
      mesh.position.set(ETNA.x + (Math.random() - 0.5) * (40 + f * 280), 1360 + f * 1150, ETNA.z + (Math.random() - 0.5) * 120);
      mesh.userData = { f: f, bx: mesh.position.x, by: mesh.position.y, ph: Math.random() * 6.28 };
      scene.add(mesh); puffs.push(mesh);
    }
    window.__etna = { puffs: puffs, crater: crater, glow: glow };
  })();

  /* ---- texture procedurali ---- */
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function mkTex(c, rx, ry, srgb) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    t.anisotropy = 8; if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function grain(x, W, H, n, a) {
    for (var i = 0; i < n; i++) {
      x.fillStyle = 'rgba(' + (Math.random() < 0.55 ? '0,0,0,' : '255,255,255,') + (Math.random() * a) + ')';
      x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
    }
  }
  var WARM = ['#ffcf7a', '#ffb84d', '#ffe3a8', '#ff9d3a'], COOL = ['#cfe3ff', '#9fc3f0'];
  function facadeCanvas(base, cols, floors, seed) {
    var W = 256, H = 512, c = mkCanvas(W, H), x = c.getContext('2d');
    var rnd = function (i) { var v = Math.sin(seed * 91.7 + i * 12.9898) * 43758.5453; return v - Math.floor(v); };
    x.fillStyle = base; x.fillRect(0, 0, W, H);
    grain(x, W, H, 2600, 0.12);
    var fh = H / floors, cw = W / cols, n = 0;
    for (var f = 0; f < floors; f++) {
      x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(0, f * fh, W, 2);
      for (var cc = 0; cc < cols; cc++) {
        var wx = cc * cw + cw * 0.26, wy = f * fh + fh * 0.2, ww = cw * 0.48, wh = fh * 0.54, r = rnd(n++);
        x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        if (f === floors - 1 && cc % 2 === 0 || r > 0.52) {
          x.fillStyle = WARM[(r * 100 | 0) % 4];
          x.fillRect(wx, wy, ww, wh);
          var gg = x.createLinearGradient(0, wy, 0, wy + wh);
          gg.addColorStop(0, 'rgba(255,255,255,.35)'); gg.addColorStop(1, 'rgba(120,50,0,.25)');
          x.fillStyle = gg; x.fillRect(wx, wy, ww, wh);
          x.fillStyle = 'rgba(40,20,10,.55)'; x.fillRect(wx + ww * 0.48, wy, ww * 0.04, wh);
          if (r > 0.8) { x.fillStyle = 'rgba(20,10,6,.7)'; x.fillRect(wx, wy, ww * 0.5, wh); }
        } else {
          var g2 = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
          g2.addColorStop(0, '#1c2a3e'); g2.addColorStop(0.5, '#34506e'); g2.addColorStop(1, '#101a28');
          x.fillStyle = g2; x.fillRect(wx, wy, ww, wh);
        }
        x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(wx - 5, wy + wh + 3, ww + 10, 4);
      }
    }
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, H - 14, W, 14);
    return c;
  }
  function emissiveFromFacade(src) {
    var W = src.width, H = src.height, c = mkCanvas(W, H), x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    var sx, out;
    try { sx = src.getContext('2d').getImageData(0, 0, W, H); out = x.createImageData(W, H); } catch (err) { return c; }
    var d = sx.data, o = out.data;
    for (var i = 0; i < d.length; i += 4) {
      var warm = d[i] > 200 && d[i + 1] > 140 && d[i + 2] < 190 && d[i] - d[i + 2] > 55;
      o[i] = warm ? d[i] : 0; o[i + 1] = warm ? d[i + 1] * 0.8 : 0; o[i + 2] = warm ? d[i + 2] * 0.45 : 0; o[i + 3] = 255;
    }
    x.putImageData(out, 0, 0); return c;
  }
  function asphaltCanvas() {
    var c = mkCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#26272c'; x.fillRect(0, 0, 256, 256);
    grain(x, 256, 256, 9000, 0.16);
    for (var i = 0; i < 26; i++) { x.fillStyle = 'rgba(8,8,12,.28)'; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 20, 0, 6.28); x.fill(); }
    return c;
  }
  function roughCanvas() {
    var c = mkCanvas(128, 128), x = c.getContext('2d');
    x.fillStyle = '#5a5a5a'; x.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 30; i++) { var v = 20 + Math.random() * 60 | 0; x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 22, 0, 6.28); x.fill(); }
    grain(x, 128, 128, 1200, 0.2);
    return c;
  }

  /* ---- terreno ---- */
  var gC = mkCanvas(256, 256), gx = gC.getContext('2d'); gx.fillStyle = '#181a1c'; gx.fillRect(0, 0, 256, 256); grain(gx, 256, 256, 5000, 0.12);
  var gTex = mkTex(gC, 500, 500);
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ map: gTex, color: 0x70727a, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; scene.add(ground);

  /* ---- strade: asfalto bagnato riflettente, marciapiedi, strisce ---- */
  function pushQuad(pos, a1, a2, wd, y) {
    var ddx = a2[0] - a1[0], ddz = a2[1] - a1[1], len = Math.hypot(ddx, ddz);
    if (len < 0.001) return;
    var nx = -ddz / len * wd / 2, nz = ddx / len * wd / 2;
    pos.push(a1[0] + nx, y, a1[1] + nz, a1[0] - nx, y, a1[1] - nz, a2[0] - nx, y, a2[1] - nz,
             a1[0] + nx, y, a1[1] + nz, a2[0] - nx, y, a2[1] - nz, a2[0] + nx, y, a2[1] + nz);
  }
  var walkPos = [], roadPos = [], markPos = [], lamps = [];
  for (var li = 0; li < LINES.length; li++) {
    var L = LINES[li]; if (L.c >= 13) continue;
    var wdt = WID[L.c] || 6, pts2 = L.p, isPed = L.c === 8;
    for (var k = 0; k < pts2.length - 1; k++) {
      var a1 = pts2[k], a2 = pts2[k + 1];
      pushQuad(walkPos, a1, a2, wdt + (isPed ? 3 : 7), 0.012);
      pushQuad(roadPos, a1, a2, wdt, isPed ? 0.05 : 0.03);
      var len = Math.hypot(a2[0] - a1[0], a2[1] - a1[1]);
      if (len < 1) continue;
      var dx = (a2[0] - a1[0]) / len, dz = (a2[1] - a1[1]) / len;
      if (L.c <= 4 && !isPed) {
        for (var d = 3; d < len - 3; d += 10) {
          var cx = a1[0] + dx * d, cz = a1[1] + dz * d;
          pushQuad(markPos, [cx, cz], [cx + dx * 3.6, cz + dz * 3.6], 0.45, 0.06);
        }
      }
      if (L.c <= 6 && !isPed) {
        for (var d2 = 6; d2 < len - 2; d2 += 34) {
          var side = ((li + k + (d2 / 34 | 0)) % 2) ? 1 : -1, off = (wdt / 2 + 2.4) * side;
          lamps.push([a1[0] + dx * d2 - dz * off, a1[1] + dz * d2 * 0 + dx * off + dz * d2]);
        }
      }
    }
  }
  function lineMesh(pos, mat) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    var uv = [], p = pos;
    for (var i = 0; i < p.length; i += 3) uv.push(p[i] / 14, p[i + 2] / 14);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    var m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
  }
  var wetTex = mkTex(asphaltCanvas(), 1, 1), wetRough = mkTex(roughCanvas(), 1, 1, false);
  lineMesh(walkPos, new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.55, metalness: 0.1 }));
  lineMesh(roadPos, new THREE.MeshStandardMaterial({ map: wetTex, roughnessMap: wetRough, color: 0xb0b0b8, roughness: 0.32, metalness: 0.55, side: THREE.DoubleSide, envMapIntensity: 1.4 }));
  lineMesh(markPos, new THREE.MeshBasicMaterial({ color: 0xd8d6c8 }));

  /* ---- parchi / acqua ---- */
  function fillPoly(pts, color, y, rough, metal) {
    if (pts.length < 3) return;
    var sh = new THREE.Shape(); sh.moveTo(pts[0][0], -pts[0][1]);
    for (var i2 = 1; i2 < pts.length; i2++) sh.lineTo(pts[i2][0], -pts[i2][1]);
    var g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: color, roughness: rough, metalness: metal || 0, side: THREE.DoubleSide }));
    m.position.y = y; m.receiveShadow = true; scene.add(m);
  }
  for (var li2 = 0; li2 < LINES.length; li2++) {
    var LL = LINES[li2];
    if (LL.c === 13) fillPoly(LL.p, 0x1e3a24, 0.04, 0.95);
    else if (LL.c === 14) fillPoly(LL.p, 0x0d2233, 0.02, 0.08, 0.7);
  }

  /* ---- collision grid ---- */
  var CELL = 44, grid = new Map();
  function gkey(cx, cz) { return cx * 100000 + cz; }
  for (var gi = 0; gi < NB; gi++) {
    var G = BLD[gi], rad = Math.hypot(G.w, G.h) / 2;
    var c0 = Math.floor((G.x - rad) / CELL), c1 = Math.floor((G.x + rad) / CELL);
    var d0 = Math.floor((G.z - rad) / CELL), d1 = Math.floor((G.z + rad) / CELL);
    for (var cx = c0; cx <= c1; cx++) for (var cz = d0; cz <= d1; cz++) {
      var kk = gkey(cx, cz), arr = grid.get(kk); if (!arr) { arr = []; grid.set(kk, arr); } arr.push(gi);
    }
  }
  function nearB(x, z) { return grid.get(gkey(Math.floor(x / CELL), Math.floor(z / CELL))) || []; }
  function pushOut(x, z, r) {
    var list = nearB(x, z), res = null;
    for (var n = 0; n < list.length; n++) {
      var B2 = BLD[list[n]];
      if (Math.abs(x - B2.x) > B2.w + B2.h + r + 4 || Math.abs(z - B2.z) > B2.w + B2.h + r + 4) continue;
      var ca = Math.cos(-B2.a), sa = Math.sin(-B2.a);
      var dx = x - B2.x, dz = z - B2.z;
      var u = dx * ca - dz * sa, v = dx * sa + dz * ca;
      var hw = B2.w / 2 + r, hh = B2.h / 2 + r;
      if (Math.abs(u) < hw && Math.abs(v) < hh) {
        var pu = hw - Math.abs(u), pv = hh - Math.abs(v);
        var ou = 0, ov = 0;
        if (pu < pv) ou = (u > 0 ? pu : -pu); else ov = (v > 0 ? pv : -pv);
        var cb = Math.cos(B2.a), sb = Math.sin(B2.a);
        res = res || { x: 0, z: 0 };
        res.x += ou * cb - ov * sb; res.z += ou * sb + ov * cb;
      }
    }
    return res;
  }
  function isFree(x, z, r) { return !pushOut(x, z, r); }
  function roadSpot(x, z) {
    var bd = 1e9, bi = -1, bk = 0;
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i]; if (L.c > 11) continue;
      var pp = L.p;
      for (var k = 0; k < pp.length; k++) {
        var d = Math.hypot(pp[k][0] - x, pp[k][1] - z);
        if (d < bd) { bd = d; bi = i; bk = k; }
      }
    }
    if (bi < 0) return { x: x, z: z, ang: 0 };
    var P2 = LINES[bi].p, kk = Math.min(bk, P2.length - 2);
    return { x: P2[bk][0], z: P2[bk][1], ang: Math.atan2(P2[kk + 1][0] - P2[kk][0], P2[kk + 1][1] - P2[kk][1]) };
  }
  function freeSpot(x, z, r) {
    if (isFree(x, z, r)) return { x: x, z: z };
    for (var d = 5; d < 240; d += 5) {
      for (var a = 0; a < 18; a++) {
        var nx = x + Math.sin(a / 18 * TAU) * d, nz = z + Math.cos(a / 18 * TAU) * d;
        if (isFree(nx, nz, r)) return { x: nx, z: nz };
      }
    }
    return { x: x, z: z };
  }

  /* ---- palazzi: facciate con finestre accese ---- */
  var bases = ['#4a4038', '#3d3630', '#554a40', '#42383a', '#4f463c', '#38322e'];
  var wallMatsByBucket = [];
  (function () {
    var dims = [[4, 7], [5, 9], [6, 12]];
    for (var b = 0; b < 3; b++) {
      var arr = [];
      for (var m = 0; m < 3; m++) {
        var fc = facadeCanvas(bases[(b * 2 + m) % bases.length], dims[b][0], dims[b][1], b * 7 + m);
        var em = emissiveFromFacade(fc);
        arr.push(new THREE.MeshStandardMaterial({ map: mkTex(fc, 1, 1), emissiveMap: mkTex(em, 1, 1), emissive: 0xffffff, emissiveIntensity: 1.35, roughness: 0.85, metalness: 0.02 }));
      }
      wallMatsByBucket.push(arr);
    }
  })();
  var wallGeo = new THREE.BoxGeometry(1, 1, 1); wallGeo.translate(0, 0.5, 0);
  var roofGeo = new THREE.PlaneGeometry(1, 1); roofGeo.rotateX(-Math.PI / 2);
  var roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.95 });
  var dummyM = new THREE.Matrix4(), dq = new THREE.Quaternion(), dp = new THREE.Vector3(), ds = new THREE.Vector3(), up0 = new THREE.Vector3(0, 1, 0), cc0 = new THREE.Color();
  var buckets = [[], [], []];
  for (var bi = 0; bi < NB; bi++) { var B0 = BLD[bi], sz = (B0.w + B0.h) / 2; buckets[sz < 15 ? 0 : (sz < 30 ? 1 : 2)].push(bi); }
  for (var bk2 = 0; bk2 < 3; bk2++) {
    var idxs = buckets[bk2];
    for (var mm2 = 0; mm2 < 3; mm2++) {
      var sub = idxs.filter(function (v, i) { return i % 3 === mm2; });
      if (!sub.length) continue;
      var im = new THREE.InstancedMesh(wallGeo, wallMatsByBucket[bk2][mm2], sub.length);
      im.castShadow = true; im.receiveShadow = true;
      for (var s2 = 0; s2 < sub.length; s2++) {
        var Bd = BLD[sub[s2]];
        dq.setFromAxisAngle(up0, -Bd.a); dp.set(Bd.x, 0, Bd.z); ds.set(Bd.w, Bd.hh, Bd.h);
        dummyM.compose(dp, dq, ds); im.setMatrixAt(s2, dummyM);
      }
      im.instanceMatrix.needsUpdate = true; scene.add(im);
    }
    var ri = new THREE.InstancedMesh(roofGeo, roofMat, idxs.length);
    for (var s3 = 0; s3 < idxs.length; s3++) {
      var Br = BLD[idxs[s3]];
      dq.setFromAxisAngle(up0, -Br.a); dp.set(Br.x, Br.hh + 0.05, Br.z); ds.set(Br.w + 0.4, 1, Br.h + 0.4);
      dummyM.compose(dp, dq, ds); ri.setMatrixAt(s3, dummyM);
    }
    ri.instanceMatrix.needsUpdate = true; scene.add(ri);
  }

  /* ---- lampioni caldi + insegne neon ---- */
  var lampList = lamps.filter(function (p2, i) { return i % 2 === 0 && isFree(p2[0], p2[1], 0.5); }).slice(0, 900);
  (function () {
    var poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 6.4, 6); poleGeo.translate(0, 3.2, 0);
    var pole = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.6, metalness: 0.7 }), lampList.length);
    var head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), lampList.length);
    var halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), lampList.length);
    var pool = new THREE.InstancedMesh(new THREE.CircleGeometry(7.5, 20), new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.17, depthWrite: false, blending: THREE.AdditiveBlending }), lampList.length);
    for (var i = 0; i < lampList.length; i++) {
      var p = lampList[i];
      dq.identity(); dp.set(p[0], 0, p[1]); ds.set(1, 1, 1); dummyM.compose(dp, dq, ds); pole.setMatrixAt(i, dummyM);
      dp.set(p[0], 6.5, p[1]); dummyM.compose(dp, dq, ds); head.setMatrixAt(i, dummyM);
      halo.setMatrixAt(i, dummyM);
      dq.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); dp.set(p[0], 0.09, p[1]); dummyM.compose(dp, dq, ds); pool.setMatrixAt(i, dummyM);
    }
    scene.add(pole); scene.add(head); scene.add(pool);
    window.__halo = halo; scene.add(halo);
    /* vere luci puntuali solo nelle vicinanze del giocatore */
    window.__lampLights = [];
    for (var j = 0; j < 14; j++) {
      var pl = new THREE.PointLight(0xffa24a, 1.5, 36, 1.8); pl.position.set(0, 6.4, 0); scene.add(pl); window.__lampLights.push(pl);
    }
  })();
  function signCanvas(text, color) {
    var c = mkCanvas(256, 96), x = c.getContext('2d');
    x.fillStyle = '#05060a'; x.fillRect(0, 0, 256, 96);
    x.strokeStyle = color; x.lineWidth = 4; x.shadowColor = color; x.shadowBlur = 18; x.strokeRect(8, 8, 240, 80);
    x.fillStyle = color; x.font = '800 40px Inter, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 50);
    return c;
  }
  var SIGNS = [['TABACCHI', '#ff3cc8'], ['FARMACIA', '#46ff9a'], ['ETNA DRINK', '#ff2f8a'], ['PIZZERIA', '#ff9d2e'], ['BAR', '#38d8ff'], ['CAFFE', '#ffb54a'], ['TRATTORIA', '#ff5c5c'], ['GELATERIA', '#b57cff'], ['PESCHERIA', '#46c8ff']];
  var signMats = SIGNS.map(function (sg) {
    var t = mkTex(signCanvas(sg[0], sg[1]), 1, 1);
    return new THREE.MeshBasicMaterial({ map: t, transparent: false, toneMapped: false, side: THREE.DoubleSide });
  });
  var signGeo = new THREE.PlaneGeometry(4.6, 1.75);
  var signCount = 0, signMeshes = [];
  for (var bs = 0; bs < NB && signCount < 360; bs += 4) {
    var Bs = BLD[bs];
    if (Math.abs(Bs.x - 450) > 1100 || Math.abs(Bs.z - 350) > 1150) continue;
    var ca = Math.cos(Bs.a), sa = Math.sin(Bs.a);
    var side = bs % 8 === 0 ? 1 : -1, ox = Bs.w / 2 * side, nxl = Bs.x + ox * ca, nzl = Bs.z + ox * sa;
    var sg = new THREE.Mesh(signGeo, signMats[bs % signMats.length]);
    sg.position.set(nxl + sa * 0.02 * side * 0, 3.4 + (bs % 3) * 0.6, nzl); sg.rotation.y = -Bs.a + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
    scene.add(sg); signCount++;
  }

  /* ---- palme e alberi ---- */
  (function () {
    var spots = [];
    for (var i = 0; i < LINES.length; i++) {
      var Ln = LINES[i];
      if (Ln.c === 13) {
        var pp = Ln.p;
        for (var k2 = 0; k2 < pp.length - 1; k2++) {
          var a3 = pp[k2], b3 = pp[k2 + 1], ln = Math.hypot(b3[0] - a3[0], b3[1] - a3[1]);
          for (var t2 = 0; t2 < ln; t2 += 13) { var f = t2 / ln; spots.push([lerp(a3[0], b3[0], f), lerp(a3[1], b3[1], f)]); }
        }
      } else if (Ln.c <= 3) {
        var q2 = Ln.p;
        for (var k3 = 0; k3 < q2.length - 1; k3++) {
          if ((i + k3) % 3) continue;
          var A3 = q2[k3], B3 = q2[k3 + 1], ln2 = Math.hypot(B3[0] - A3[0], B3[1] - A3[1]);
          if (ln2 < 8) continue;
          var dx2 = (B3[0] - A3[0]) / ln2, dz2 = (B3[1] - A3[1]) / ln2, side = (i + k3) % 2 ? 1 : -1, off = ((WID[Ln.c] || 8) / 2 + 4.6) * side;
          spots.push([A3[0] - dz2 * off, A3[1] + dx2 * off]);
        }
      }
    }
    spots = spots.filter(function (p2) { return isFree(p2[0], p2[1], 1.2); }).slice(0, 1400);
    var trunkGeo = new THREE.CylinderGeometry(0.2, 0.34, 7.2, 7); trunkGeo.translate(0, 3.6, 0);
    var trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 }), spots.length);
    var frond = new THREE.ConeGeometry(2.6, 1.1, 7); frond.translate(0, 7.5, 0);
    var crown = new THREE.InstancedMesh(frond, new THREE.MeshStandardMaterial({ color: 0x1f4a27, roughness: 0.9, flatShading: true }), spots.length);
    var foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.0, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), spots.length);
    trunk.castShadow = crown.castShadow = true;
    for (var s4 = 0; s4 < spots.length; s4++) {
      var sp = spots[s4], hg = 0.8 + ((s4 * 37) % 50) / 100, isPalm = s4 % 3 !== 0;
      dq.setFromAxisAngle(up0, s4);
      dp.set(sp[0], 0, sp[1]); ds.set(1, isPalm ? hg : hg * 0.55, 1); dummyM.compose(dp, dq, ds); trunk.setMatrixAt(s4, dummyM);
      ds.set(isPalm ? 1 : 0.0001, hg, isPalm ? 1 : 0.0001); dummyM.compose(dp, dq, ds); crown.setMatrixAt(s4, dummyM);
      dp.set(sp[0], isPalm ? -50 : 4.6 * hg, sp[1]); ds.set(1.5, 1.2, 1.5); dummyM.compose(dp, dq, ds); foliage.setMatrixAt(s4, dummyM);
      cc0.setHSL(0.27 + (s4 % 9) * 0.006, 0.4, 0.14 + (s4 % 5) * 0.012); foliage.setColorAt(s4, cc0);
    }
    trunk.instanceMatrix.needsUpdate = crown.instanceMatrix.needsUpdate = foliage.instanceMatrix.needsUpdate = true;
    scene.add(trunk); scene.add(crown); scene.add(foliage);
  })();

  /* ---- post-processing: bloom cinematografico ---- */
  var composer = null, bloom = null;
  if (THREE.EffectComposer && QUALITY !== 1) {
    var rtSize = new THREE.Vector2(window.innerWidth, window.innerHeight);
    composer = new THREE.EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY === 3 ? 2 : 1.5));
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloom = new THREE.UnrealBloomPass(rtSize, 0.95, 0.85, 0.62);
    composer.addPass(bloom);
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ---------------- entities ---------------- */
  function carMesh(bodyColor) {
    var g = new THREE.Group();
    var paint = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.32, metalness: 0.55 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.12, metalness: 0.7 });
    var lower = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.56, 4.35), paint);
    lower.position.y = 0.62; lower.castShadow = true; g.add(lower);
    var mid = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.34, 4.05), paint);
    mid.position.y = 0.95; mid.castShadow = true; g.add(mid);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.62, 2.25), glass);
    cabin.position.set(0, 1.34, -0.12); cabin.castShadow = true; g.add(cabin);
    var roofpl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 1.9), paint);
    roofpl.position.set(0, 1.66, -0.16); g.add(roofpl);
    var wg = new THREE.CylinderGeometry(0.37, 0.37, 0.26, 14);
    var wm = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.9 });
    var rim = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 10);
    var rm = new THREE.MeshStandardMaterial({ color: 0xb9bfc7, roughness: 0.35, metalness: 0.8 });
    [[-0.95, 1.38], [0.95, 1.38], [-0.95, -1.42], [0.95, -1.42]].forEach(function (p) {
      var w = new THREE.Mesh(wg, wm); w.rotation.z = Math.PI / 2; w.position.set(p[0], 0.38, p[1]); w.castShadow = true; g.add(w);
      var r = new THREE.Mesh(rim, rm); r.rotation.z = Math.PI / 2; r.position.set(p[0] * 1.01, 0.38, p[1]); g.add(r);
    });
    var hl = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c0, emissiveIntensity: 0.8, roughness: 0.2 });
    [[-0.62, 2.16], [0.62, 2.16]].forEach(function (p) {
      var l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.1), hl); l.position.set(p[0], 0.82, -p[1]); g.add(l);
    });
    var tl = new THREE.MeshStandardMaterial({ color: 0x8c1a1a, emissive: 0xd42020, emissiveIntensity: 0.7, roughness: 0.3 });
    [[-0.66, 2.16], [0.66, 2.16]].forEach(function (p) {
      var l = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.1), tl); l.position.set(p[0], 0.86, p[1]); g.add(l);
    });
    var beam = new THREE.SpotLight(0xfff0d0, 2.6, 90, 0.5, 0.6, 1.2);
    beam.position.set(0, 0.9, 1.8); beam.target.position.set(0, 0, 30); g.add(beam); g.add(beam.target);
    var glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0.88, -2.3); g.add(glow);
    return g;
  }
  function pedMesh(shirt) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.75, 4, 8), new THREE.MeshLambertMaterial({ color: shirt }));
    body.position.y = 0.95; g.add(body);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd9ab86 }));
    head.position.y = 1.62; g.add(head);
    return g;
  }
  function policeMesh() {
    var g = carMesh(0x1d2b6b), bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 0.42), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    bar.position.set(0, 1.72, -0.15); g.add(bar);
    var bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.17, 0.44), new THREE.MeshBasicMaterial({ color: 0xff3344 }));
    bar2.position.set(0, 1.73, -0.15); g.add(bar2);
    return g;
  }

  var LAND = {
    duomo: { x: 574, z: 861, n: 'Piazza del Duomo' },
    pescheria: { x: 688, z: 989, n: 'La Pescheria' },
    porto: { x: 971, z: 1183, n: 'Porto' },
    villa: { x: 446, z: -50, n: 'Villa Bellini' },
    stesicoro: { x: 357, z: 283, n: 'Piazza Stesicoro' },
    massimo: { x: 410, z: 547, n: 'Teatro Massimo' },
    ursino: { x: 432, z: 1239, n: 'Castello Ursino' },
    universita: { x: 371, z: 553, n: 'Piazza Università' },
    corso: { x: -397, z: 553, n: 'Corso Sicilia' },
    sanzio: { x: -120, z: 90, n: 'Via Etnea' },
    barriera: { x: 120, z: -560, n: 'Barriera del Bosco' }
  };

  var sp0 = roadSpot(LAND.duomo.x, LAND.duomo.z);
  var car = { x: sp0.x, z: sp0.z, ang: sp0.ang, v: 0, mesh: carMesh(0xb8352f) };
  var P = { x: car.x, z: car.z, ang: car.ang, v: 0, hp: 100, money: 320, wanted: 0, onFoot: false, ammo: 60, mag: 12, reload: 0, dead: false, killT: 0 };
  scene.add(car.mesh);
  var pMesh = pedMesh(0xe8e2d8); scene.add(pMesh);

  var cops = [], enemies = [], bullets = [], particles = [];
  var camYaw = 0, decayT = 0, camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  var state = { running: false, paused: false, msg: '', msgT: 0 };

  function toast(t) { state.msg = t; state.msgT = 3.4; }

  /* ---------------- input ---------------- */
  var keys = {};
  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'KeyE') toggleVehicle();
    if (e.code === 'KeyF') shoot();
    if (e.code === 'KeyR') reload();
    if (e.code === 'KeyM') cycleMission();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  var touch = { ax: 0, ay: 0, gas: 0, brake: 0 };
  var pad = { ax: 0, ay: 0, gas: 0, brake: 0, enter: false, fire: false };

  function readPad() {
    pad.ax = 0; pad.ay = 0; pad.gas = 0; pad.brake = 0;
    var gps = navigator.getGamepads ? navigator.getGamepads() : [];
    var gp = null;
    for (var i3 = 0; i3 < gps.length; i3++) if (gps[i3] && gps[i3].connected) { gp = gps[i3]; break; }
    document.body.dataset.pad = gp ? '1' : '0';
    if (!gp) { pad.enter = false; pad.fire = false; return; }
    var ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (Math.abs(ax) > 0.16) pad.ax = ax;
    if (Math.abs(ay) > 0.16) pad.ay = ay;
    var rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
    pad.gas = Math.max(rt, gp.buttons[0] && gp.buttons[0].pressed ? 1 : 0);
    pad.brake = lt;
    var enterNow = !!(gp.buttons[1] && gp.buttons[1].pressed) || !!(gp.buttons[9] && gp.buttons[9].pressed);
    var fireNow = !!(gp.buttons[2] && gp.buttons[2].pressed) || !!(gp.buttons[5] && gp.buttons[5].pressed);
    if (enterNow && !pad.enter) toggleVehicle();
    if (fireNow && !pad.fire) shoot();
    pad.enter = enterNow; pad.fire = fireNow;
  }

  function axes() {
    var ax = 0, ay = 0, gas = 0, brake = 0;
    if (keys['KeyA'] || keys['ArrowLeft']) ax -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ax += 1;
    if (keys['KeyW'] || keys['ArrowUp']) ay -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) ay += 1;
    if (keys['ShiftLeft'] || keys['ShiftRight']) gas = 1;
    if (keys['Space']) brake = 1;
    ax = clamp(ax + touch.ax + pad.ax, -1, 1);
    ay = clamp(ay + touch.ay + pad.ay, -1, 1);
    gas = clamp(gas + touch.gas + pad.gas, 0, 1);
    brake = clamp(brake + touch.brake + pad.brake, 0, 1);
    return { ax: ax, ay: ay, gas: gas, brake: brake };
  }

  /* touch buttons */
  function bindBtn(id, setter) {
    var el = document.getElementById(id); if (!el) return;
    var on = function (e) { e.preventDefault(); setter(1); el.classList.add('act'); };
    var off = function (e) { e.preventDefault(); setter(0); el.classList.remove('act'); };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
    el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
  }
  bindBtn('bGas', function (v) { touch.gas = v; });
  bindBtn('bBrake', function (v) { touch.brake = v; });
  bindBtn('bEnter', function (v) { if (v) toggleVehicle(); });
  bindBtn('bFire', function (v) { if (v) shoot(); });
  (function () {
    var zone = document.getElementById('stick'), knob = document.getElementById('knob');
    if (!zone) return;
    var active = false, cx = 0, cy = 0, R = 52;
    function start(e) {
      var t = e.touches ? e.touches[0] : e; active = true;
      var r = zone.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      move(e);
    }
    function move(e) {
      if (!active) return; e.preventDefault();
      var t = e.touches ? e.touches[0] : e;
      var dx = t.clientX - cx, dy = t.clientY - cy;
      var d = Math.hypot(dx, dy); if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      touch.ax = dx / R; touch.ay = dy / R;
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }
    function end() { active = false; touch.ax = 0; touch.ay = 0; knob.style.transform = 'translate(0,0)'; }
    zone.addEventListener('touchstart', start, { passive: false });
    zone.addEventListener('touchmove', move, { passive: false });
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    zone.addEventListener('mousedown', start); window.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
  })();
  if ('ontouchstart' in window || location.search.indexOf('touch') >= 0) document.body.classList.add('touch');

  /* ---------------- vehicles ---------------- */
  function toggleVehicle() {
    if (!state.running || state.paused) return;
    if (P.onFoot) {
      if (Math.hypot(P.x - car.x, P.z - car.z) < 4.5) { P.onFoot = false; P.x = car.x; P.z = car.z; toast('Sei in auto. W/S accelerare e frenare, A/D sterzo.'); }
      else toast('Non c\u2019è nessuna auto qui vicino.');
    } else {
      if (Math.abs(car.v) > 5) { toast('Rallenta prima di scendere.'); return; }
      P.onFoot = true; P.ang = car.ang;
      var ep = freeSpot(car.x - Math.sin(car.ang) * 3.0, car.z - Math.cos(car.ang) * 3.0, 0.7);
      P.x = ep.x; P.z = ep.z;
    }
  }

  /* ---------------- combat ---------------- */
  function reload() { if (P.onFoot && P.ammo > 0 && P.mag < 12) { P.reload = 1.1; toast('Ricarica...'); } }
  function shoot() {
    if (!state.running || state.paused || P.dead) return;
    if (P.onFoot === false) { toast('Devi scendere dall\u2019auto per sparare.'); return; }
    if (P.reload > 0) return;
    if (P.mag <= 0) { if (P.ammo > 0) { P.reload = 1.1; toast('Ricarica...'); } else toast('Munizioni finite.'); return; }
    P.mag--; P.killT = 0;
    var dx = Math.sin(camYaw), dz = Math.cos(camYaw);
    bullets.push({ x: P.x + dx * 0.9, z: P.z + dz * 0.9, dx: dx, dz: dz, life: 1.4, own: 'p' });
    if (P.wanted < 1) setWanted(1);
  }

  function setWanted(n) {
    var prev = P.wanted;
    n = clamp(Math.round(n), 0, 5);
    P.wanted = n;
    while (cops.length < n * 2) spawnCop();
    while (cops.length > n * 2) { var c = cops.pop(); scene.remove(c.mesh); }
    if (n > 0 && n > prev) toast('Ricercato: ' + n + ' stelle. La polizia ti sta cercando.');
  }
  function spawnCop() {
    var ang = Math.random() * TAU, dist = 160 + Math.random() * 120;
    var x = P.x + Math.sin(ang) * dist, z = P.z + Math.cos(ang) * dist;
    for (var tries = 0; tries < 40; tries++) {
      if (isFree(x, z, 4)) break;
      ang = Math.random() * TAU; dist = 120 + Math.random() * 200;
      x = P.x + Math.sin(ang) * dist; z = P.z + Math.cos(ang) * dist;
    }
    var m = policeMesh(); m.position.set(x, 0, z); scene.add(m);
    cops.push({ x: x, z: z, ang: 0, v: 0, mesh: m, stuck: 0 });
  }
  function spawnEnemy(x, z) {
    var m = pedMesh(0x2a2a33); m.position.set(x, 0, z); scene.add(m);
    enemies.push({ x: x, z: z, hp: 3, mesh: m, t: 1 + Math.random() * 1.5 });
  }

  /* ---------------- missions ---------------- */
  var MISSIONS = [
    { t: 'Il primo pacco', d: 'Vai alla Pescheria: \u2019u Piscispada ti aspetta con la merce.', at: LAND.pescheria, pay: 250 },
    { t: 'Consegna al porto', d: 'Porta il pacco ai container del Porto senza farti fermare.', at: LAND.porto, pay: 400, heat: 1 },
    { t: 'Il traditore', d: 'Qualcuno ha parlato. Vai a Castello Ursino e sistemalo (elimina le guardie).', at: LAND.ursino, pay: 600, guards: 2 },
    { t: 'Colpo in Via Etnea', d: 'Raggiungi Piazza Stesicoro, poi scappa: la polizia ti inseguir\u00e0.', at: LAND.stesicoro, pay: 900, heat: 2 },
    { t: 'Il carico di Corso Sicilia', d: 'Corri a Corso Sicilia prima che il carico sparisca.', at: LAND.corso, pay: 1200, heat: 1 },
    { t: 'U capu', d: 'Il boss ti aspetta in Villa Bellini. Chiudi i conti (elimina la scorta).', at: LAND.villa, pay: 2500, guards: 3, heat: 1 }
  ];
  var mIdx = 0, mDone = false, marker = null;
  var beacon = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.24, side: THREE.DoubleSide }));
  beacon.position.y = 30; scene.add(beacon);
  var arrow = new THREE.Mesh(new THREE.ConeGeometry(3, 9, 8), new THREE.MeshBasicMaterial({ color: 0xffc94d }));
  arrow.rotation.x = Math.PI; arrow.position.y = 16; scene.add(arrow);

  function startMission(i) { mIdx = clamp(i, 0, MISSIONS.length - 1); mDone = false; var M = MISSIONS[mIdx]; marker = M.at; toast('MISSIONE: ' + M.t); if (M.heat) setWanted(M.heat); }
  function cycleMission() { if (!state.running) return; startMission((mIdx + 1) % MISSIONS.length); }
  function checkMission() {
    var M = MISSIONS[mIdx]; if (!M || mDone) return;
    var d = Math.hypot(P.x - M.at.x, P.z - M.at.z);
    var guardsLeft = enemies.length;
    if (M.guards && d < 90 && !M.spawned) { M.spawned = true; for (var i4 = 0; i4 < M.guards; i4++) spawnEnemy(M.at.x + Math.sin(i4 * 2.1) * 12, M.at.z + Math.cos(i4 * 2.1) * 12); toast('Le guardie ti hanno visto! Sparagli.'); }
    if (M.guards && guardsLeft > 0) return;
    if (d < 14) {
      mDone = true; P.money += M.pay; toast('Missione compiuta: +' + M.pay + '\u20ac');
      setTimeout(function () { if (mIdx < MISSIONS.length - 1) startMission(mIdx + 1); else toast('Hai finito tutte le missioni. Catania è tua.'); }, 2200);
    }
  }

  function updateLamps(px, pz) {
    if (!window.__lampLights) return;
    var near = [];
    for (var i = 0; i < lampList.length; i++) {
      var dx = lampList[i][0] - px, dz = lampList[i][1] - pz, d = dx * dx + dz * dz;
      if (d < 4900) near.push([d, i]);
    }
    near.sort(function (a, b) { return a[0] - b[0]; });
    for (var j = 0; j < window.__lampLights.length; j++) {
      var L = window.__lampLights[j];
      if (j < near.length) { var p = lampList[near[j][1]]; L.position.set(p[0], 6.2, p[1]); L.visible = true; } else L.visible = false;
    }
  }
  /* ---------------- update ---------------- */
  function update(dt) {
    var A = axes();
    if (!P.onFoot) {
      var acc = 10.5, maxS = 33, brakeF = 22;
      var thr = clamp(Math.max(A.gas, A.ay < 0 ? -A.ay : 0), 0, 1);
      var brk = clamp(Math.max(A.brake, A.ay > 0 ? A.ay : 0), 0, 1);
      if (thr > 0.05) car.v += acc * thr * dt;
      else if (brk > 0.05) {
        if (car.v > 0.4) car.v -= brakeF * brk * dt;
        else car.v -= 7 * brk * dt;
      } else { car.v -= car.v * 1.5 * dt; }
      car.v = clamp(car.v, -11, maxS);
      var steer = A.ax;
      var grip = clamp(Math.abs(car.v) / 7, 0, 1);
      car.ang += steer * 1.9 * dt * grip * (car.v < 0 ? -1 : 1);
      var fx = Math.sin(car.ang), fz = Math.cos(car.ang);
      car.x += fx * car.v * dt; car.z += fz * car.v * dt;
      var hit = pushOut(car.x, car.z, 1.85);
      if (hit) { car.x += hit.x; car.z += hit.z; if (Math.abs(car.v) > 12) { P.hp -= 3; } car.v *= 0.35; }
      P.x = car.x; P.z = car.z; P.ang = car.ang;
      car.mesh.position.set(car.x, 0, car.z); car.mesh.rotation.y = car.ang;
    } else {
      var mx = A.ax, mz = A.ay;
      var sp = 5.4;
      if (keys['ShiftLeft'] || keys['ShiftRight']) sp = 8.6;
      if (Math.hypot(mx, mz) > 0.12) {
        var len2 = Math.hypot(mx, mz); mx /= len2; mz /= len2;
        var wx = -mz * Math.sin(camYaw) + mx * Math.cos(camYaw);
        var wz = -mz * Math.cos(camYaw) - mx * Math.sin(camYaw);
        var nx2 = P.x + wx * sp * dt, nz2 = P.z + wz * sp * dt;
        var h2 = pushOut(nx2, nz2, 0.55);
        if (h2) { nx2 += h2.x; nz2 += h2.z; }
        P.x = clamp(nx2, -1700, 1700); P.z = clamp(nz2, -1780, 1790);
        P.ang = angLerp(P.ang, Math.atan2(wx, wz), Math.min(1, dt * 12));
      }
      pMesh.position.set(P.x, 0, P.z); pMesh.rotation.y = P.ang;
    }
    pMesh.visible = P.onFoot;

    if (P.reload > 0) { P.reload -= dt; if (P.reload <= 0) { var need = 12 - P.mag, take = Math.min(need, P.ammo); P.mag += take; P.ammo -= take; } }

    /* bullets */
    for (var b4 = bullets.length - 1; b4 >= 0; b4--) {
      var bl = bullets[b4];
      var sp2 = 150 * dt;
      bl.x += bl.dx * sp2; bl.z += bl.dz * sp2; bl.life -= dt;
      var dead = bl.life <= 0 || pushOut(bl.x, bl.z, 0.15);
      if (!dead) for (var e4 = 0; e4 < enemies.length; e4++) {
        if (Math.hypot(enemies[e4].x - bl.x, enemies[e4].z - bl.z) < 1.0) { enemies[e4].hp--; dead = true; if (enemies[e4].hp <= 0) { scene.remove(enemies[e4].mesh); enemies.splice(e4, 1); P.money += 60; } break; }
      }
      if (!dead) for (var c4 = 0; c4 < cops.length; c4++) {
        if (Math.hypot(cops[c4].x - bl.x, cops[c4].z - bl.z) < 2.2) { dead = true; setWanted(Math.min(5, P.wanted + 1)); break; }
      }
      if (dead) bullets.splice(b4, 1);
    }

    /* cops */
    for (var ci = 0; ci < cops.length; ci++) {
      var cp = cops[ci];
      var dxp = P.x - cp.x, dzp = P.z - cp.z, dist = Math.hypot(dxp, dzp);
      var want = Math.atan2(dxp, dzp);
      cp.ang = angLerp(cp.ang, want, Math.min(1, dt * 2.2));
      cp.v = lerp(cp.v, dist > 30 ? 30 : 14, dt * 1.6);
      cp.x += Math.sin(cp.ang) * cp.v * dt; cp.z += Math.cos(cp.ang) * cp.v * dt;
      var hc = pushOut(cp.x, cp.z, 2.0);
      if (hc) { cp.x += hc.x; cp.z += hc.z; cp.stuck += dt; cp.v *= 0.5; }
      if (cp.stuck > 2.5) {
        cp.stuck = 0; var na = Math.random() * TAU;
        var tx = P.x + Math.sin(na) * 150, tz = P.z + Math.cos(na) * 150;
        if (isFree(tx, tz, 4)) { cp.x = tx; cp.z = tz; }
      }
      cp.mesh.position.set(cp.x, 0, cp.z); cp.mesh.rotation.y = cp.ang;
      if (dist < 3.4) {
        if (!P.onFoot) { P.hp -= 12 * dt; car.v *= 0.9; }
        else if (dist < 2.6) { P.dead = true; }
      }
    }
    if (P.wanted > 0) {
      var near = false;
      for (var c5 = 0; c5 < cops.length; c5++) if (Math.hypot(cops[c5].x - P.x, cops[c5].z - P.z) < 240) near = true;
      if (!near) { decayT += dt; if (decayT > 7) { decayT = 0; setWanted(P.wanted - 1); } } else decayT = 0;
    } else decayT = 0;

    /* enemies */
    for (var ei = 0; ei < enemies.length; ei++) {
      var en = enemies[ei];
      var de = Math.hypot(P.x - en.x, P.z - en.z);
      en.mesh.rotation.y = Math.atan2(P.x - en.x, P.z - en.z);
      if (de < 48) {
        en.t -= dt;
        if (en.t <= 0) {
          en.t = 1.3 + Math.random();
          var ddx2 = P.x - en.x, ddz2 = P.z - en.z, dl = Math.hypot(ddx2, ddz2) || 1;
          bullets.push({ x: en.x, z: en.z, dx: ddx2 / dl, dz: ddz2 / dl, life: 1.2, own: 'e' });
        }
        if (de > 10) { en.x += (P.x - en.x) / de * 3.2 * dt; en.z += (P.z - en.z) / de * 3.2 * dt; }
      }
      en.mesh.position.set(en.x, 0, en.z);
    }
    for (var b5 = bullets.length - 1; b5 >= 0; b5--) {
      var b2 = bullets[b5];
      if (b2.own === 'e' && Math.hypot(b2.x - P.x, b2.z - P.z) < 1.2) { P.hp -= 9; bullets.splice(b5, 1); }
    }

    /* death */
    if (P.hp <= 0 || P.dead) {
      P.hp = 100; P.dead = false; setWanted(0);
      P.money = Math.max(0, P.money - 150);
      var rsp = roadSpot(LAND.duomo.x, LAND.duomo.z);
      car.x = rsp.x; car.z = rsp.z; car.v = 0;
      P.x = car.x; P.z = car.z; P.onFoot = false;
      toast('Ti hanno steso. Sei tornato in Piazza del Duomo (-150\u20ac).');
      enemies.forEach(function (e) { scene.remove(e.mesh); }); enemies.length = 0;
    }

    /* camera */
    var tgt = P.onFoot ? P : car;
    camYaw = angLerp(camYaw, tgt.ang, Math.min(1, dt * (P.onFoot ? 3.4 : 5)));
    var back = P.onFoot ? 7.4 : 9.4, high = P.onFoot ? 3.5 : 5.0;
    var desX = tgt.x - Math.sin(camYaw) * back, desZ = tgt.z - Math.cos(camYaw) * back;
    var baseY = (P.onFoot ? 0 : 0) + high;
    camPos.set(desX, baseY, desZ);
    camera.position.lerp(camPos, Math.min(1, dt * 7));
    camLook.set(tgt.x + Math.sin(camYaw) * 8, 2.0, tgt.z + Math.cos(camYaw) * 8);
    camera.lookAt(camLook);
    sun.position.set(tgt.x - 150, 300, tgt.z + 110);
    sun.target.position.set(tgt.x, 0, tgt.z);
    sun.target.updateMatrixWorld();
    sky.position.set(camera.position.x, 0, camera.position.z);
    skyMat.uniforms.t.value += dt;
    updateLamps(tgt.x, tgt.z);
    var E = window.__etna;
    if (E) {
      for (var pi = 0; pi < E.puffs.length; pi++) {
        var pf = E.puffs[pi], u = pf.userData;
        pf.position.y = u.by + Math.sin(skyMat.uniforms.t.value * 0.35 + u.ph) * 14;
        pf.position.x = u.bx + Math.sin(skyMat.uniforms.t.value * 0.22 + u.ph * 2) * 22;
      }
      E.crater.intensity = 4.0 + Math.sin(skyMat.uniforms.t.value * 3.1) * 0.8 + Math.sin(skyMat.uniforms.t.value * 7.7) * 0.4;
    }

    /* markers */
    if (marker && !mDone) { beacon.position.set(marker.x, 30, marker.z); arrow.position.set(marker.x, 16, marker.z); beacon.visible = arrow.visible = true; }
    else { var nx3 = MISSIONS[Math.min(mIdx + 1, MISSIONS.length - 1)].at; beacon.position.set(nx3.x, 30, nx3.z); arrow.position.set(nx3.x, 16, nx3.z); }

    pMesh.visible = P.onFoot;
    checkMission();
    if (state.msgT > 0) state.msgT -= dt;
    hud();
  }

  /* ---------------- HUD ---------------- */
  var el = {
    money: document.getElementById('vMoney'), stars: document.getElementById('vStars'),
    hp: document.getElementById('hpfill'), spd: document.getElementById('vSpeed'),
    miss: document.getElementById('mTitle'), desc: document.getElementById('mDesc'),
    ammo: document.getElementById('vAmmo'), msg: document.getElementById('toast'),
    dist: document.getElementById('mDist')
  };
  var mm = document.createElement('canvas'); mm.width = 660; mm.height = 660;
  (function drawMap() {
    var c = mm.getContext('2d');
    var S = 660 / 3545, OX = 1677, OZ = 1780;
    c.fillStyle = '#101a22'; c.fillRect(0, 0, 660, 660);
    function poly(p) {
      c.beginPath();
      for (var i6 = 0; i6 < p.length; i6++) {
        var X = (p[i6][0] + OX) * S, Y = (p[i6][1] + OZ) * S;
        if (i6) c.lineTo(X, Y); else c.moveTo(X, Y);
      }
      c.closePath(); c.fill();
    }
    c.save(); c.translate(0, 0);
    for (var i5 = 0; i5 < LINES.length; i5++) {
      var Ln = LINES[i5];
      if (Ln.c === 14) { c.fillStyle = '#16303d'; poly(Ln.p); continue; }
      if (Ln.c === 13) { c.fillStyle = '#1d3324'; poly(Ln.p); continue; }
    }
    c.strokeStyle = '#27323c'; c.lineWidth = 1;
    for (var i7 = 0; i7 < LINES.length; i7++) {
      var Ln2 = LINES[i7]; if (Ln2.c >= 13) continue;
      c.strokeStyle = Ln2.c <= 4 ? '#404e5a' : '#333d47';
      c.lineWidth = Math.max(1, (WID[Ln2.c] || 6) * S * 0.9);
      c.beginPath();
      for (var i8 = 0; i8 < Ln2.p.length; i8++) {
        var X2 = (Ln2.p[i8][0] + OX) * S, Y2 = (Ln2.p[i8][1] + OZ) * S;
        if (i8) c.lineTo(X2, Y2); else c.moveTo(X2, Y2);
      }
      c.stroke();
    }
    c.restore();
  })();
  var mmx = document.getElementById('mini').getContext('2d');
  function hud() {
    el.money.textContent = P.money + '\u20ac';
    var st = '';
    for (var i9 = 0; i9 < 5; i9++) st += (i9 < Math.round(P.wanted) ? '\u2605' : '\u2606');
    el.stars.textContent = st;
    el.hp.style.width = clamp(P.hp, 0, 100) + '%';
    el.spd.textContent = P.onFoot ? '\u2014' : Math.round(Math.abs(car.v) * 3.6) + ' km/h';
    el.ammo.textContent = P.mag + '/' + P.ammo;
    var M = MISSIONS[mIdx];
    if (M) {
      el.miss.textContent = M.t; el.desc.textContent = M.d;
      var d = Math.hypot(P.x - M.at.x, P.z - M.at.z);
      el.dist.textContent = d > 14 ? Math.round(d) + ' m a ' + M.at.n : 'ARRIVATO';
    }
    el.msg.textContent = state.msgT > 0 ? state.msg : '';
    el.msg.style.opacity = state.msgT > 0 ? 1 : 0;
    document.body.dataset.pad = document.body.dataset.pad || '0';
    /* minimap */
    var W = 660, sw = W * (280 / 3545), sh = W * (200 / 3545);
    var sx = (P.x + 1677) / 3545 * W - sw / 2, sy = (P.z + 1780) / 3545 * W - sh / 2;
    mmx.clearRect(0, 0, 168, 120);
    mmx.drawImage(mm, sx, sy, sw, sh, 0, 0, 168, 120);
    mmx.save(); mmx.translate(84, 60);
    mmx.strokeStyle = 'rgba(255,255,255,.5)'; mmx.lineWidth = 1;
    mmx.beginPath(); mmx.arc(0, 0, 26, 0, TAU); mmx.stroke();
    mmx.restore();
    mmx.save(); mmx.translate(84, 60); mmx.rotate(-(P.onFoot ? P.ang : car.ang));
    mmx.fillStyle = '#ff5566'; mmx.beginPath(); mmx.moveTo(0, -6); mmx.lineTo(4.5, 5); mmx.lineTo(-4.5, 5); mmx.closePath(); mmx.fill();
    mmx.restore();
    if (M) {
      var mx2 = 84 + (M.at.x - P.x) * 0.6, my2 = 60 + (M.at.z - P.z) * 0.6;
      var cl = Math.hypot(mx2 - 84, my2 - 60);
      if (cl > 54) { mx2 = 84 + (mx2 - 84) / cl * 54; my2 = 60 + (my2 - 60) / cl * 54; }
      mmx.fillStyle = '#ffc94d'; mmx.beginPath(); mmx.arc(mx2, my2, 3.4, 0, TAU); mmx.fill();
    }
  }

  /* ---------------- boot ---------------- */
  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  var last = 0;
  var STATS = location.search.indexOf('stats') >= 0;
  var statT = 0;
  function statsTick() {
    var gl = renderer.getContext();
    var W = 240, H = 160;
    var bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    var px = new Uint8Array(W * H * 4);
    gl.readPixels(Math.max(0, (bw - W) >> 1), Math.max(0, (bh - H) >> 1), W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    var sum = 0, dark = 0, bright = 0;
    for (var i = 0; i < px.length; i += 4) {
      var lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      sum += lum; if (lum < 80) dark++; if (lum > 205) bright++;
    }
    var n = px.length / 4;
    var d = document.getElementById('dbg');
    if (!d) { d = document.createElement('div'); d.id = 'dbg'; d.style.cssText = 'position:fixed;left:0;bottom:0;z-index:99;color:#0f0;font:11px monospace;background:#000a;padding:3px'; document.body.appendChild(d); }
    d.textContent = 'LUM=' + Math.round(sum / n) + ' DARK=' + Math.round(100 * dark / n) + '% BRIGHT=' + Math.round(100 * bright / n) + '% FPS=' + lastFps + ' V=' + Math.round(P.x) + ',' + Math.round(P.z);
  }
  var lastFps = 0;
  var fpsT = 0, fpsN = 0;
  function loop(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    if (location.search.indexOf('fps') >= 0) { fpsT += dt; fpsN++; if (fpsT > 1) { lastFps = Math.round(fpsN / fpsT); if (location.search.indexOf('fps') >= 0) document.title = 'FPS ' + lastFps; fpsT = 0; fpsN = 0; } }
    readPad();
    if (state.running && !state.paused) update(dt);
    if (composer) composer.render(); else renderer.render(scene, camera);
    if (STATS) statsTick();
    requestAnimationFrame(loop);
  }
  camera.position.set(P.x - Math.sin(P.ang) * 8, 4, P.z - Math.cos(P.ang) * 8);
  camera.lookAt(P.x, 2, P.z);
  document.getElementById('start').addEventListener('click', function () {
    document.getElementById('intro').classList.add('hide');
    state.running = true;
    startMission(0);
    last = 0;
  });
  window.addEventListener('keydown', function (e) { if (e.code === 'Escape' && state.running) { state.paused = !state.paused; toast(state.paused ? 'In pausa' : 'Ripresa'); } });
  window.__CV = { P: P, car: car, BLD: BLD, LINES: LINES, MISSIONS: MISSIONS, state: state, cops: cops, enemies: enemies };
  requestAnimationFrame(loop);
  window.addEventListener('gamepadconnected', function () { toast('Controller collegato. Guida con lo stick, RT accelera.'); });
})();
