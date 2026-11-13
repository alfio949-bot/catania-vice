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
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  var NIGHT = 0x0a1020;
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.FogExp2(0x0a0b16, 0.0017);
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
      ' vec3 top = vec3(0.012,0.022,0.055); vec3 hor = vec3(0.075,0.058,0.105);',
      ' vec3 c = mix(hor, top, pow(y,0.55));',
      ' vec2 sp = floor(vec2(atan(p.x,p.z)*220.0, p.y*220.0));',
      ' float st = step(0.9965, h(sp)) * smoothstep(0.08,0.4,p.y) * (0.5+0.5*sin(t*2.0+h(sp)*40.0));',
      ' c += vec3(st);',
      ' float g = exp(-pow(distance(normalize(p.xz), normalize(vec2(0.35,-0.94))) * 2.6, 2.0)) * exp(-p.y*3.2);',
      ' c += vec3(0.70,0.22,0.05) * g * 0.95;',
      ' gl_FragColor = vec4(c,1.0);',
      '}'
    ].join('\n')
  });
  var sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 18), skyMat);
  sky.renderOrder = -10; scene.add(sky);

  /* luna come luce direzionale fredda, ombre morbide */
  scene.add(new THREE.HemisphereLight(0x54709c, 0x1d1a24, 0.40));
  var sun = new THREE.DirectionalLight(0x9fb4e0, 0.42);
  sun.position.set(-180, 320, 140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY === 3 ? 3072 : 1024, QUALITY === 3 ? 3072 : 1024);
  sun.shadow.camera.left = -140; sun.shadow.camera.right = 140; sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  scene.add(sun); scene.add(sun.target);
  var fill = new THREE.DirectionalLight(0xffa860, 0.22); fill.position.set(120, 80, -180); scene.add(fill);
  var fill2 = new THREE.DirectionalLight(0x5f8cdd, 0.16); fill2.position.set(-160, 60, -60); scene.add(fill2);

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

  /* ---- ambiente riflettente: cielo, Etna e bagliore urbano ---- */
  (function () {
    try {
      var cubeRT = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
      var cubeCam = new THREE.CubeCamera(10, 6000, cubeRT);
      cubeCam.position.set(0, 40, 0);
      scene.add(cubeCam);
      cubeCam.update(renderer, scene);
      var pmrem = new THREE.PMREMGenerator(renderer);
      var envRT = pmrem.fromCubemap(cubeRT.texture);
      scene.environment = envRT.texture;
      pmrem.dispose(); cubeRT.dispose(); scene.remove(cubeCam);
    } catch (e) { console.warn('envmap', e); }
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
  /* ================= FACCIATE REALISTICHE =================
     Una baia = 3.2 m, un piano = 3.2 m, tile = 4 baie x 4 piani (12.8 m).
     Le UV sono in spazio mondo, quindi le finestre hanno la stessa misura
     su ogni palazzo: niente piu' texture stirate. */
  var TILE_M = 12.8, BAY_M = 3.2, SHOP_W = 6.4, SHOP_H = 4.8;
  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var STYLES = [
    { base: '#a18d6c', trim: '#bcae8e', shut: '#33493a', warm: '#ffbe6a', iron: '#171a1c' },
    { base: '#9c8168', trim: '#b9a487', shut: '#4a3826', warm: '#ffc27e', iron: '#191613' },
    { base: '#9a958a', trim: '#b8b4a9', shut: '#27404f', warm: '#ffd49b', iron: '#161a1c' }
  ];
  function makeFacadeTile(st, seed) {
    var S = 1024, c = mkCanvas(S, S), x = c.getContext('2d');
    var ec = mkCanvas(S, S), ex = ec.getContext('2d');
    var r = mulberry(seed);
    ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
    x.fillStyle = st.base; x.fillRect(0, 0, S, S);
    /* macchie, umidita', intonaco consumato */
    for (var i = 0; i < 800; i++) {
      var rr = 18 + r() * 170;
      x.fillStyle = 'rgba(' + (r() < 0.5 ? '255,250,240,' : '58,44,30,') + (0.012 + r() * 0.04) + ')';
      x.beginPath(); x.ellipse(r() * S, r() * S, rr, rr * (0.4 + r()), r() * 3, 0, 6.2832); x.fill();
    }
    /* colature verticali dal cornicione */
    for (var i2 = 0; i2 < 80; i2++) {
      var sx = r() * S;
      var g = x.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, 'rgba(38,30,20,' + (0.06 + r() * 0.1) + ')');
      g.addColorStop(0.55, 'rgba(38,30,20,0)');
      x.fillStyle = g; x.fillRect(sx, 0, 2 + r() * 10, S);
    }
    var bayW = S / 4, fH = S / 4;
    for (var f = 0; f < 4; f++) {
      var yBot = S - f * fH, yTop = yBot - fH;
      /* cornice marcapiano */
      x.fillStyle = st.trim; x.fillRect(0, yBot - 20, S, 14);
      x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, yBot - 20, S, 3);
      x.fillStyle = 'rgba(0,0,0,0.30)'; x.fillRect(0, yBot - 6, S, 7);
      /* balcone continuo in pietra + ringhiera in ferro */
      var slabY = yBot - 8;
      x.fillStyle = 'rgba(0,0,0,0.32)'; x.fillRect(0, slabY + 20, S, 30);
      x.fillStyle = st.trim; x.fillRect(0, slabY, S, 20);
      var gg = x.createLinearGradient(0, slabY, 0, slabY + 20);
      gg.addColorStop(0, 'rgba(255,255,255,0.38)'); gg.addColorStop(1, 'rgba(0,0,0,0.38)');
      x.fillStyle = gg; x.fillRect(0, slabY, S, 20);
      var ry0 = slabY - 74, ry1 = slabY;
      x.strokeStyle = st.iron; x.lineWidth = 3;
      x.beginPath();
      for (var bx = 6; bx < S; bx += 15) { x.moveTo(bx, ry0); x.lineTo(bx, ry1); }
      x.stroke();
      x.fillStyle = st.iron; x.fillRect(0, ry0 - 7, S, 8);
      /* finestre */
      for (var b = 0; b < 4; b++) {
        var cx = b * bayW + bayW * 0.5;
        var wW = bayW * 0.40, wH = fH * 0.46, wy = yTop + fH * 0.24;
        var lit = r() < 0.4;
        x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(cx - wW / 2 - 8, wy - 8, wW + 16, wH + 16);
        x.fillStyle = st.trim; x.fillRect(cx - wW / 2 - 4, wy - 4, wW + 8, wH + 8);
        if (lit) {
          var lg = x.createLinearGradient(0, wy, 0, wy + wH);
          lg.addColorStop(0, st.warm); lg.addColorStop(1, '#c07a26');
          x.fillStyle = lg; x.fillRect(cx - wW / 2, wy, wW, wH);
          if (r() < 0.45) { x.fillStyle = 'rgba(255,232,190,0.5)'; x.fillRect(cx - wW / 2 + 3, wy + 3, wW * 0.42, wH - 6); }
          x.fillStyle = 'rgba(30,18,8,0.6)'; x.fillRect(cx - 2, wy, 4, wH); x.fillRect(cx - wW / 2, wy + wH * 0.44, wW, 4);
          ex.fillStyle = 'rgba(255,186,108,0.95)'; ex.fillRect(cx - wW / 2, wy, wW, wH);
          ex.fillStyle = 'rgba(255,160,70,0.16)'; ex.fillRect(cx - wW / 2 - 30, wy - 30, wW + 60, wH + 60);
        } else {
          var dg = x.createLinearGradient(cx - wW / 2, wy, cx + wW / 2, wy + wH);
          dg.addColorStop(0, '#0c141f'); dg.addColorStop(0.42, '#1c2b3c'); dg.addColorStop(0.56, '#264258'); dg.addColorStop(1, '#090f17');
          x.fillStyle = dg; x.fillRect(cx - wW / 2, wy, wW, wH);
          x.fillStyle = 'rgba(130,170,210,0.09)'; x.fillRect(cx - wW / 2, wy, wW * 0.33, wH);
          x.fillStyle = 'rgba(30,18,8,0.6)'; x.fillRect(cx - 2, wy, 4, wH);
        }
        /* persiane */
        if (r() < 0.72) {
          var sw = wW * 0.23;
          x.fillStyle = st.shut;
          x.fillRect(cx - wW / 2 - sw - 3, wy, sw, wH);
          x.fillRect(cx + wW / 2 + 3, wy, sw, wH);
          x.fillStyle = 'rgba(0,0,0,0.28)';
          for (var sy = wy; sy < wy + wH; sy += 6) { x.fillRect(cx - wW / 2 - sw - 3, sy, sw, 2); x.fillRect(cx + wW / 2 + 3, sy, sw, 2); }
        }
        /* condizionatore o vasi, dettagli di vita */
        if (r() < 0.18) {
          x.fillStyle = '#9aa0a6'; x.fillRect(cx + wW * 0.62, wy + wH + 6, 26, 18);
          x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(cx + wW * 0.62, wy + wH + 22, 26, 4);
        }
      }
    }
    return { map: c, emissive: ec };
  }
  function makeShopTile(seed) {
    var W = 512, H = 384, c = mkCanvas(W, H), x = c.getContext('2d');
    var ec = mkCanvas(W, H), ex = ec.getContext('2d');
    var r = mulberry(seed);
    ex.fillStyle = '#000'; ex.fillRect(0, 0, W, H);
    x.fillStyle = '#9b9080'; x.fillRect(0, 0, W, H);
    for (var i = 0; i < 400; i++) {
      x.fillStyle = 'rgba(' + (r() < 0.5 ? '255,250,240,' : '52,40,28,') + (0.02 + r() * 0.05) + ')';
      x.fillRect(r() * W, r() * H, 6 + r() * 40, 4 + r() * 26);
    }
    /* basamento in pietra lavica, il nero di Catania */
    x.fillStyle = '#1b1e24'; x.fillRect(0, H - 66, W, 66);
    for (var j = 0; j < 420; j++) {
      x.fillStyle = 'rgba(' + (r() < 0.4 ? '255,255,255,' : '0,0,0,') + (0.02 + r() * 0.07) + ')';
      x.fillRect(r() * W, H - 66 + r() * 66, 4 + r() * 18, 3 + r() * 7);
    }
    x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, H - 66, W, 5);
    for (var u = 0; u < 2; u++) {
      var x0 = u * W / 2 + 22, wW = W / 2 - 44, y0 = H - 86 - 152;
      var open = r() < 0.58;
      if (open) {
        var g = x.createLinearGradient(0, y0, 0, y0 + 152);
        g.addColorStop(0, '#ffdda8'); g.addColorStop(0.6, '#f0b463'); g.addColorStop(1, '#b97b32');
        x.fillStyle = g; x.fillRect(x0, y0, wW, 152);
        ex.fillStyle = 'rgba(255,196,126,0.9)'; ex.fillRect(x0, y0, wW, 152);
        ex.fillStyle = 'rgba(255,170,90,0.14)'; ex.fillRect(x0 - 40, y0 - 40, wW + 80, 232);
        x.fillStyle = 'rgba(56,34,14,0.45)';
        for (var m = 0; m < 6; m++) x.fillRect(x0 + 8 + r() * (wW - 50), y0 + 46 + r() * 66, 14 + r() * 30, 22 + r() * 44);
        if (r() < 0.55) {
          x.fillStyle = r() < 0.5 ? '#8a3224' : '#26543c';
          x.beginPath(); x.moveTo(x0 - 10, y0 - 4); x.lineTo(x0 + wW + 10, y0 - 4); x.lineTo(x0 + wW + 22, y0 + 30); x.lineTo(x0 - 22, y0 + 30); x.closePath(); x.fill();
          x.fillStyle = 'rgba(0,0,0,0.2)';
          for (var s2 = 0; s2 < 7; s2++) x.fillRect(x0 - 16 + s2 * ((wW + 40) / 7), y0 - 4, (wW + 40) / 14, 34);
        }
      } else {
        x.fillStyle = '#565c63'; x.fillRect(x0, H - 238, wW, 152);
        x.fillStyle = 'rgba(0,0,0,0.26)';
        for (var sy2 = H - 238; sy2 < H - 86; sy2 += 8) x.fillRect(x0, sy2, wW, 3);
        x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(x0, H - 238, wW, 7);
        if (r() < 0.5) {
          x.strokeStyle = 'rgba(238,238,255,0.14)'; x.lineWidth = 6; x.beginPath();
          x.moveTo(x0 + 18, H - 132); x.bezierCurveTo(x0 + 64, H - 206, x0 + 140, H - 104, x0 + wW - 18, H - 168); x.stroke();
        }
      }
    }
    /* fascia insegna */
    x.fillStyle = '#17120e'; x.fillRect(0, 0, W, 46);
    x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, 44, W, 3);
    return { map: c, emissive: ec };
  }
  var FAC_TILES = [], SHOP_TILES = [];
  for (var ft = 0; ft < 3; ft++) { FAC_TILES.push(makeFacadeTile(STYLES[ft], 1301 + ft * 977)); }
  for (var st2 = 0; st2 < 2; st2++) { SHOP_TILES.push(makeShopTile(4409 + st2 * 613)); }
  function makeWallMaterial(fi, si) {
    var fac = FAC_TILES[fi], shp = SHOP_TILES[si];
    var m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.03 });
    m.userData.u = {
      uFac: { value: mkTex(fac.map, 1, 1) },
      uFacE: { value: mkTex(fac.emissive, 1, 1) },
      uShop: { value: mkTex(shp.map, 1, 1) },
      uShopE: { value: mkTex(shp.emissive, 1, 1) },
      uTint: { value: new THREE.Color(1, 1, 1) }
    };
    m.onBeforeCompile = function (sh) {
      for (var k in m.userData.u) sh.uniforms[k] = m.userData.u[k];
      sh.vertexShader = [
        'varying vec3 vWP;',
        'varying vec2 vU2;',
        'varying float vTint;'
      ].join('\n') + '\n' + sh.vertexShader;
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vec4 _wp = vec4( transformed, 1.0 );',
        '#ifdef USE_INSTANCING',
        '  _wp = instanceMatrix * _wp;',
        '  vec3 _axX = normalize( instanceMatrix[0].xyz );',
        '  vec3 _axZ = normalize( instanceMatrix[2].xyz );',
        '  float _h = fract( sin( dot( instanceMatrix[3].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );',
        '#else',
        '  vec3 _axX = vec3( 1.0, 0.0, 0.0 );',
        '  vec3 _axZ = vec3( 0.0, 0.0, 1.0 );',
        '  float _h = 0.5;',
        '#endif',
        '_wp = modelMatrix * _wp;',
        'vWP = _wp.xyz;',
        'float _faceX = step( 0.5, abs( objectNormal.x ) );',
        'float _hc = mix( dot( _wp.xyz, _axX ), dot( _wp.xyz, _axZ ), _faceX );',
        'vU2 = vec2( _hc / ' + TILE_M.toFixed(1) + ' + floor( _h * 4.0 ) * 0.25, _wp.y / ' + TILE_M.toFixed(1) + ' );',
        'vTint = 0.86 + _h * 0.26;'
      ].join('\n'));
      sh.fragmentShader = [
        'uniform sampler2D uFac;',
        'uniform sampler2D uFacE;',
        'uniform sampler2D uShop;',
        'uniform sampler2D uShopE;',
        'varying vec3 vWP;',
        'varying vec2 vU2;',
        'varying float vTint;'
      ].join('\n') + '\n' + sh.fragmentShader;
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', [
        'vec2 _sU = vec2( vU2.x * ' + (TILE_M / SHOP_W).toFixed(4) + ', vWP.y / ' + SHOP_H.toFixed(1) + ' );',
        'float _shopM = 1.0 - smoothstep( 3.7, 4.9, vWP.y );',
        'vec3 _fac = texture2D( uFac, vU2 ).rgb;',
        'vec3 _shp = texture2D( uShop, _sU ).rgb;',
        'diffuseColor.rgb *= mix( _fac, _shp, _shopM ) * vTint;'
      ].join('\n'));
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        'vec2 _sUe = vec2( vU2.x * ' + (TILE_M / SHOP_W).toFixed(4) + ', vWP.y / ' + SHOP_H.toFixed(1) + ' );',
        'float _shopMe = 1.0 - smoothstep( 3.7, 4.9, vWP.y );',
        'vec3 _facE = texture2D( uFacE, vU2 ).rgb;',
        'vec3 _shpE = texture2D( uShopE, _sUe ).rgb;',
        'totalEmissiveRadiance = mix( _facE, _shpE, _shopMe ) * 1.85;'
      ].join('\n'));
    };
    m.customProgramCacheKey = function () { return 'wallv2_' + fi + '_' + si; };
    return m;
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
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ map: gTex, color: 0x8a8c96, roughness: 0.9 }));
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
  lineMesh(roadPos, new THREE.MeshStandardMaterial({ map: wetTex, roughnessMap: wetRough, color: 0x8f9098, roughness: 0.28, metalness: 0.55, side: THREE.DoubleSide, envMapIntensity: 1.4 }));
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
    if (LL.c === 13) fillPoly(LL.p, 0x2b4a30, 0.04, 0.95);
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
  /* ================= DETTAGLI 3D: balconi, cornicioni, tetti =================
     Le facciate restano piatte solo in lontananza. Entro 175 m dal giocatore
     ogni palazzo riceve balconi aggettanti, cornicione e roba sui tetti:
     sono i volumi che rompono l'effetto "scatola". */
  var DET_R = 175, DET_CAP = 30000, DET_GEN = 0;
  var detStamp = new Int32Array(NB);
  var detSlab = null, detRail = null, detCorn = null, detClut = null;
  var detLastX = 1e9, detLastZ = 1e9, detTimer = 0;
  var UPY = new THREE.Vector3(0, 1, 0);
  (function () {
    var rc = mkCanvas(64, 64), rx = rc.getContext('2d');
    rx.clearRect(0, 0, 64, 64);
    rx.fillStyle = '#191b1e';
    rx.fillRect(0, 0, 64, 7);
    rx.fillRect(0, 58, 64, 6);
    for (var i = 4; i < 64; i += 9) rx.fillRect(i, 0, 3, 64);
    var railTex = new THREE.CanvasTexture(rc);
    railTex.wrapS = railTex.wrapT = THREE.RepeatWrapping;
    railTex.anisotropy = 4;
    var g1 = new THREE.BoxGeometry(1, 1, 1);
    var slabMat = new THREE.MeshStandardMaterial({ color: 0x9c9484, roughness: 0.9, metalness: 0.02 });
    var railMat = new THREE.MeshStandardMaterial({ map: railTex, color: 0x3a3d42, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.65 });
    var cornMat = new THREE.MeshStandardMaterial({ color: 0xa89c86, roughness: 0.93, metalness: 0.02 });
    var clutMat = new THREE.MeshStandardMaterial({ color: 0x565b60, roughness: 0.82, metalness: 0.15 });
    detSlab = new THREE.InstancedMesh(g1, slabMat, DET_CAP);
    detRail = new THREE.InstancedMesh(g1, railMat, DET_CAP);
    detCorn = new THREE.InstancedMesh(g1, cornMat, 6000);
    detClut = new THREE.InstancedMesh(g1, clutMat, 8000);
    detSlab.castShadow = false; detSlab.receiveShadow = true;
    detRail.castShadow = false; detRail.receiveShadow = true;
    detCorn.castShadow = true; detCorn.receiveShadow = true;
    detClut.castShadow = true; detClut.receiveShadow = true;
    detSlab.frustumCulled = false; detRail.frustumCulled = false;
    detCorn.frustumCulled = false; detClut.frustumCulled = false;
    detSlab.count = 0; detRail.count = 0; detCorn.count = 0; detClut.count = 0;
    scene.add(detSlab); scene.add(detRail); scene.add(detCorn); scene.add(detClut);
  })();
  var _m4 = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _p1 = new THREE.Vector3(), _s1 = new THREE.Vector3();
  function rebuildDetail(px, pz) {
    DET_GEN++;
    var gen = DET_GEN, nS = 0, nR = 0, nC = 0, nK = 0;
    var cx0 = Math.floor((px - DET_R) / CELL), cx1 = Math.floor((px + DET_R) / CELL);
    var cz0 = Math.floor((pz - DET_R) / CELL), cz1 = Math.floor((pz + DET_R) / CELL);
    for (var cx = cx0; cx <= cx1; cx++) for (var cz = cz0; cz <= cz1; cz++) {
      var arr = grid.get(gkey(cx, cz));
      if (!arr) continue;
      for (var i = 0; i < arr.length; i++) {
        var bi = arr[i];
        if (detStamp[bi] === gen) continue;
        detStamp[bi] = gen;
        var B = BLD[bi];
        var dx = B.x - px, dz = B.z - pz;
        if (dx * dx + dz * dz > DET_R * DET_R) continue;
        if (B.w < 5 || B.h < 5 || B.hh < 5) continue;
        var ca = Math.cos(B.a), sa = Math.sin(B.a);
        _q1.setFromAxisAngle(UPY, -B.a);
        var ax = B.w, az = B.h;
        var floors = Math.floor(B.hh / 3.2);
        var alongX = ax >= az;
        var span = alongX ? ax : az;
        var dep = alongX ? az : ax;
        if (nC < 6000) {
          _p1.set(B.x, B.hh + 0.2, B.z);
          _s1.set(ax + 0.8, 0.42, az + 0.8);
          _m4.compose(_p1, _q1, _s1); detCorn.setMatrixAt(nC++, _m4);
        }
        var nk = 2 + (bi % 3);
        for (var k = 0; k < nk && nK < 8000; k++) {
          var r1 = ((bi * 37 + k * 91) % 100) / 100, r2 = ((bi * 53 + k * 17) % 100) / 100, r3 = ((bi * 29 + k * 71) % 100) / 100;
          var lx = (r1 - 0.5) * (ax - 2.4), lz = (r2 - 0.5) * (az - 2.4);
          var hgt = 0.5 + r3 * 1.9;
          var wx = B.x + lx * ca - lz * sa, wz = B.z + lx * sa + lz * ca;
          _p1.set(wx, B.hh + 0.4 + hgt * 0.5, wz);
          _s1.set(0.8 + r1 * 1.6, hgt, 0.8 + r2 * 1.6);
          _m4.compose(_p1, _q1, _s1); detClut.setMatrixAt(nK++, _m4);
        }
        for (var f = 1; f < floors; f++) {
          var y = f * 3.2;
          for (var s = 0; s < 2; s++) {
            var sg = s === 0 ? 1 : -1;
            if (nS >= DET_CAP) break;
            var ox, oz, sxs, szs, rx2, rz2, rxs, rzs;
            if (alongX) {
              ox = 0; oz = sg * (dep / 2 + 0.45);
              sxs = span * 0.94; szs = 0.9;
              rx2 = 0; rz2 = sg * (dep / 2 + 0.88);
              rxs = span * 0.94; rzs = 0.07;
            } else {
              ox = sg * (dep / 2 + 0.45); oz = 0;
              sxs = 0.9; szs = span * 0.94;
              rx2 = sg * (dep / 2 + 0.88); rz2 = 0;
              rxs = 0.07; rzs = span * 0.94;
            }
            _p1.set(B.x + ox * ca - oz * sa, y, B.z + ox * sa + oz * ca);
            _s1.set(sxs, 0.16, szs);
            _m4.compose(_p1, _q1, _s1); detSlab.setMatrixAt(nS++, _m4);
            if (nR < DET_CAP) {
              _p1.set(B.x + rx2 * ca - rz2 * sa, y + 0.58, B.z + rx2 * sa + rz2 * ca);
              _s1.set(rxs, 1.05, rzs);
              _m4.compose(_p1, _q1, _s1); detRail.setMatrixAt(nR++, _m4);
            }
          }
        }
      }
    }
    detSlab.count = nS; detRail.count = nR; detCorn.count = nC; detClut.count = nK;
    detSlab.instanceMatrix.needsUpdate = true; detRail.instanceMatrix.needsUpdate = true;
    detCorn.instanceMatrix.needsUpdate = true; detClut.instanceMatrix.needsUpdate = true;
    detLastX = px; detLastZ = pz;
  }
  function updateDetail(dt, px, pz) {
    detTimer -= dt;
    if (detTimer > 0) return;
    var dx = px - detLastX, dz = pz - detLastZ;
    if (dx * dx + dz * dz < 26 * 26) return;
    detTimer = 0.5;
    rebuildDetail(px, pz);
  }
  /* sagoma vera dell'auto, estrusa: niente piu' scatole impilate */
  function carBodyGeo() {
    var sh = new THREE.Shape();
    sh.moveTo(0.05, 0.34);
    sh.lineTo(0.02, 0.62);
    sh.lineTo(0.30, 0.74);
    sh.lineTo(1.02, 0.88);
    sh.lineTo(1.52, 1.32);
    sh.lineTo(2.86, 1.36);
    sh.lineTo(3.38, 0.94);
    sh.lineTo(3.86, 0.82);
    sh.lineTo(4.02, 0.56);
    sh.lineTo(4.00, 0.34);
    sh.closePath();
    var g = new THREE.ExtrudeGeometry(sh, { depth: 1.86, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -0.93);
    g.rotateY(Math.PI / 2);
    g.translate(0, 0, 2.03);
    g.computeVertexNormals();
    return g;
  }

  /* ---- palazzi: facciate reali mappate in spazio mondo ---- */
  var wallMatsByBucket = [];
  (function () {
    var MATS = [];
    for (var fi = 0; fi < 3; fi++) for (var si = 0; si < 2; si++) MATS.push(makeWallMaterial(fi, si));
    for (var b = 0; b < 3; b++) {
      var arr = [];
      for (var m2 = 0; m2 < 3; m2++) arr.push(MATS[(b * 3 + m2) % MATS.length]);
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
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth/2, window.innerHeight/2), 0.9, 0.75, 0.68);
    composer.addPass(bloom);
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ---------------- entities ---------------- */
  function carMesh(bodyColor) {
    var g = new THREE.Group();
    var paint = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.32, metalness: 0.55 });
    var glass = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.12, metalness: 0.7 });
    var shell = new THREE.Mesh(carBodyGeo(), paint);
    shell.castShadow = true; shell.receiveShadow = true; g.add(shell);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.36, 1.44), glass);
    cabin.position.set(0, 1.205, -0.12); g.add(cabin);
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

  /* ================= VITA IN STRADA: traffico e pedoni ================= */
  function mergeGeos(list) {
    var pos = [], nor = [], uv = [], idx = [], off = 0;
    for (var i = 0; i < list.length; i++) {
      var g = list[i], p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      for (var k = 0; k < p.count; k++) {
        pos.push(p.getX(k), p.getY(k), p.getZ(k));
        if (n) nor.push(n.getX(k), n.getY(k), n.getZ(k)); else nor.push(0, 1, 0);
        if (u) uv.push(u.getX(k), u.getY(k)); else uv.push(0, 0);
      }
      if (g.index) { for (var k2 = 0; k2 < g.index.count; k2++) idx.push(g.index.getX(k2) + off); }
      else { for (var k3 = 0; k3 < p.count; k3++) idx.push(k3 + off); }
      off += p.count;
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(idx);
    return out;
  }
  function instColorMat(mat) {
    mat.onBeforeCompile = function (sh) {
      sh.vertexShader = 'varying vec3 vIC;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n#ifdef USE_INSTANCING_COLOR\n vIC = instanceColor;\n#else\n vIC = vec3(1.0);\n#endif');
      sh.fragmentShader = 'varying vec3 vIC;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= vIC;');
    };
    mat.customProgramCacheKey = function () { return 'ic'; };
    return mat;
  }
  var traffic = null, peds = null, carColors = [0xb8352f, 0x2c3e70, 0xd9d5cc, 0x1c1d21, 0x6d7278, 0x3d6b52, 0x8c6a2f, 0x8f2b45, 0x37607a, 0xa8a196];
  function lineLens(L) {
    var segs = [], total = 0;
    for (var i = 0; i < L.p.length - 1; i++) { var d = Math.hypot(L.p[i + 1][0] - L.p[i][0], L.p[i + 1][1] - L.p[i][1]); segs.push(d); total += d; }
    return { segs: segs, total: total };
  }
  function atDist(L, ln, s) {
    var acc = 0;
    for (var i = 0; i < ln.segs.length; i++) {
      if (acc + ln.segs[i] >= s || i === ln.segs.length - 1) {
        var t = ln.segs[i] > 0.001 ? (s - acc) / ln.segs[i] : 0;
        var a = L.p[i], b = L.p[i + 1];
        return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: ((b[0] - a[0]) / ln.segs[i]) || 0, dz: ((b[1] - a[1]) / ln.segs[i]) || 0 };
      }
      acc += ln.segs[i];
    }
    return { x: L.p[0][0], z: L.p[0][1], dx: 0, dz: 1 };
  }
  (function buildTraffic() {
    var cands = [];
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i];
      if (L.c <= 6 && L.p.length >= 3) { var ln = lineLens(L); if (ln.total > 40) cands.push({ L: L, ln: ln }); }
    }
    if (!cands.length) return;
    function pick(near) {
      var best = cands[0], bd = 1e18;
      for (var t = 0; t < 14; t++) {
        var c = cands[(Math.random() * cands.length) | 0];
        var mid = Math.floor(c.L.p.length / 2), m = c.L.p[mid];
        var d = (m[0] - near.x) * (m[0] - near.x) + (m[1] - near.z) * (m[1] - near.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    }
    var N = 38;
    var bodyGeo = carBodyGeo();
    var wg = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10); wg.rotateZ(Math.PI / 2);
    var wp = [];
    [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.34], [0.9, -1.34]].forEach(function (p) {
      var w = wg.clone(); w.translate(p[0], 0.35, p[1]); wp.push(w);
    });
    var wheelGeo = mergeGeos(wp);
    var hl = new THREE.BoxGeometry(0.36, 0.17, 0.09); hl.translate(0, 0.72, 2.08);
    var h2 = hl.clone(); h2.translate(-0.62, 0, 0);
    var h3 = hl.clone(); h3.translate(0.62, 0, 0);
    var headGeo = mergeGeos([h2, h3]);
    var tl = new THREE.BoxGeometry(0.34, 0.15, 0.09); tl.translate(0, 0.74, -2.08);
    var t2 = tl.clone(); t2.translate(-0.62, 0, 0);
    var t3 = tl.clone(); t3.translate(0.62, 0, 0);
    var tailGeo = mergeGeos([t2, t3]);
    var bodyMat = instColorMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.72, envMapIntensity: 1.6 }));
    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.85 });
    var headMat = new THREE.MeshBasicMaterial({ color: 0xfff2d2, toneMapped: false });
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a26, toneMapped: false });
    var body = new THREE.InstancedMesh(bodyGeo, bodyMat, N); body.castShadow = true;
    var wheel = new THREE.InstancedMesh(wheelGeo, wheelMat, N);
    var head = new THREE.InstancedMesh(headGeo, headMat, N);
    var tail = new THREE.InstancedMesh(tailGeo, tailMat, N);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wheel.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    var cc = new THREE.Color(), start = { x: 560, z: 850 };
    var cars = [];
    for (var j = 0; j < N; j++) {
      var c = pick(start);
      cars.push({ line: c.L, ln: c.ln, s: Math.random() * c.ln.total, sp: 7 + Math.random() * 6, lane: 1.4 + Math.random() * 0.7, x: 0, z: 0, ang: 0 });
      cc.setHex(carColors[j % carColors.length]); body.setColorAt(j, cc);
    }
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    scene.add(body); scene.add(wheel); scene.add(head); scene.add(tail);
    traffic = { cars: cars, body: body, wheel: wheel, head: head, tail: tail, pick: pick };
  })();
  function updateTraffic(dt) {
    if (!traffic) return;
    var T = traffic, m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    for (var i = 0; i < T.cars.length; i++) {
      var c = T.cars[i];
      c.s += c.sp * dt;
      if (c.s > c.ln.total) { c.s = 0; if (Math.random() < 0.25) { var nc = T.pick({ x: P.x, z: P.z }); c.line = nc.L; c.ln = nc.ln; } }
      var q2 = atDist(c.line, c.ln, c.s);
      var ang = Math.atan2(q2.dx, q2.dz);
      var px = q2.x + q2.dz * c.lane, pz = q2.z - q2.dx * c.lane;
      c.x = px; c.z = pz; c.ang = ang;
      q.setFromAxisAngle(up, ang); p.set(px, 0, pz);
      m.compose(p, q, one);
      T.body.setMatrixAt(i, m); T.wheel.setMatrixAt(i, m); T.head.setMatrixAt(i, m); T.tail.setMatrixAt(i, m);
    }
    T.body.instanceMatrix.needsUpdate = true; T.wheel.instanceMatrix.needsUpdate = true;
    T.head.instanceMatrix.needsUpdate = true; T.tail.instanceMatrix.needsUpdate = true;
  }
  (function buildPeds() {
    var cands = [];
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i];
      if (L.c <= 9 && L.p.length >= 2) { var ln = lineLens(L); if (ln.total > 25) cands.push({ L: L, ln: ln }); }
    }
    if (!cands.length) return;
    function pick(near) {
      var best = cands[0], bd = 1e18;
      for (var t = 0; t < 12; t++) {
        var c = cands[(Math.random() * cands.length) | 0];
        var m = c.L.p[Math.floor(c.L.p.length / 2)];
        var d = (m[0] - near.x) * (m[0] - near.x) + (m[1] - near.z) * (m[1] - near.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    }
    var N = 150, start = { x: 560, z: 850 };
    var bodyGeo = new THREE.CapsuleGeometry(0.3, 0.72, 3, 7); bodyGeo.translate(0, 0.98, 0);
    var headGeo = new THREE.SphereGeometry(0.22, 9, 7); headGeo.translate(0, 1.63, 0);
    var bMat = instColorMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
    var hMat = new THREE.MeshStandardMaterial({ color: 0xc99b76, roughness: 0.8 });
    var bm = new THREE.InstancedMesh(bodyGeo, bMat, N);
    var hm = new THREE.InstancedMesh(headGeo, hMat, N);
    bm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); hm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bm.castShadow = true;
    var shirts = [0xdfd8cc, 0x2c3a52, 0x8c3a3a, 0x3f5c46, 0x1f2124, 0xb8a98e, 0x5a6d84, 0xd4b063];
    var cc = new THREE.Color(), list = [];
    for (var j = 0; j < N; j++) {
      var c = pick(start);
      list.push({ line: c.L, ln: c.ln, s: Math.random() * c.ln.total, sp: 1.1 + Math.random() * 0.9, lane: 3.6 + Math.random() * 1.6, ph: Math.random() * 6.28, x: 0, z: 0, ang: 0 });
      cc.setHex(shirts[j % shirts.length]); bm.setColorAt(j, cc);
    }
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    scene.add(bm); scene.add(hm);
    peds = { list: list, body: bm, head: hm, pick: pick };
  })();
  function updatePeds(dt, t) {
    if (!peds) return;
    var Q = peds, m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    for (var i = 0; i < Q.list.length; i++) {
      var c = Q.list[i];
      c.s += c.sp * dt;
      if (c.s > c.ln.total) { c.s = 0; if (Math.random() < 0.2) { var nc = Q.pick({ x: P.x, z: P.z }); c.line = nc.L; c.ln = nc.ln; } }
      var q2 = atDist(c.line, c.ln, c.s);
      var ang = Math.atan2(q2.dx, q2.dz);
      var side = (c.ph > 3.14) ? 1 : -1;
      var px = q2.x + q2.dz * c.lane * side, pz = q2.z - q2.dx * c.lane * side;
      c.x = px; c.z = pz; c.ang = ang;
      q.setFromAxisAngle(up, ang + (side < 0 ? Math.PI : 0));
      p.set(px, Math.abs(Math.sin(t * 6 + c.ph)) * 0.06, pz);
      m.compose(p, q, one);
      Q.body.setMatrixAt(i, m);
      p.set(px, Math.abs(Math.sin(t * 6 + c.ph)) * 0.06, pz);
      Q.head.setMatrixAt(i, m);
    }
    Q.body.instanceMatrix.needsUpdate = true; Q.head.instanceMatrix.needsUpdate = true;
  }


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
  if (location.search.indexOf('drive') >= 0) { state.autoDrive = true; }
  if (location.search.indexOf('view=high') >= 0) { state.high = true; }

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
    var back = P.onFoot ? 3.7 : 7.2, high = P.onFoot ? 1.95 : 3.2;
    var desX = tgt.x - Math.sin(camYaw) * back, desZ = tgt.z - Math.cos(camYaw) * back;
    var baseY = (P.onFoot ? 0 : 0) + high;
    camPos.set(desX, baseY, desZ);
    camera.position.lerp(camPos, Math.min(1, dt * 7));
    camLook.set(tgt.x + Math.sin(camYaw) * 5.5, 1.75, tgt.z + Math.cos(camYaw) * 5.5);
    camera.lookAt(camLook);
    if (state.high) { camera.position.set(tgt.x + 165, 115, tgt.z + 165); camera.lookAt(tgt.x, 14, tgt.z); }
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
    updateTraffic(dt);
    updateDetail(dt, camera.position.x, camera.position.z);
    updatePeds(dt, skyMat.uniforms.t.value);
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
    d.textContent = 'LUM=' + Math.round(sum / n) + ' SCENE=' + scene.children.length + ' SIGN=' + signCount + ' LAMP=' + lampList.length + ' DARK=' + Math.round(100 * dark / n) + '% BRIGHT=' + Math.round(100 * bright / n) + '% FPS=' + lastFps + ' V=' + Math.round(P.x) + ',' + Math.round(P.z);
  }
  var lastFps = 0;
  var fpsT = 0, fpsN = 0;
  var perfT = 0, perfN = 0, perfDone = false;
  function perfCheck(dt) {
    if (perfDone) return;
    perfT += dt; perfN++;
    if (perfT < 4) return;
    var fps = perfN / perfT; perfDone = true;
    if (fps < 26) {
      if (composer) { composer = null; }
      renderer.shadowMap.enabled = false;
      renderer.setPixelRatio(1);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      if (bloom) bloom.enabled = false;
      scene.traverse(function (o) { if (o.isMesh) o.castShadow = false; });
      toast('Qualit\u00e0 ridotta automaticamente per fluidit\u00e0.');
    }
  }
  function loop(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    { fpsT += dt; fpsN++; if (fpsT > 1) { lastFps = Math.round(fpsN / fpsT); if (location.search.indexOf('fps') >= 0) document.title = 'FPS ' + lastFps; fpsT = 0; fpsN = 0; } }
    readPad();
    if (state.autoDrive) { touch.gas = 1; touch.ax = 0.02; }
    if (state.running && !state.paused) { update(dt); perfCheck(dt); }
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
  window.__CV = { P: P, car: car, BLD: BLD, LINES: LINES, MISSIONS: MISSIONS, state: state, cops: cops, enemies: enemies, camera: camera, scene: scene, renderer: renderer, THREE: THREE };
  requestAnimationFrame(loop);
  window.addEventListener('gamepadconnected', function () { toast('Controller collegato. Guida con lo stick, RT accelera.'); });
})();
