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

  /* ---------------- three setup ---------------- */
  var canvas = document.getElementById('game');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  var HORIZON = 0xd8e2e9;
  scene.fog = new THREE.Fog(HORIZON, 300, 1350);
  var camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 1, 3200);

  var skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x2f6ea6) }, bot: { value: new THREE.Color(0xdfe7ec) } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ float t = clamp(h*1.5+0.12,0.0,1.0); gl_FragColor = vec4(mix(bot,top,pow(t,0.85)),1.0); }'
  });
  var sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 16), skyMat);
  scene.add(sky);

  var hemi = new THREE.HemisphereLight(0xcfe1f2, 0x6a6155, 0.75); scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
  sun.position.set(200, 300, 140);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150; sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150; sun.shadow.camera.bottom = -150;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));

  /* ---- procedural textures ---- */
  function mkCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function mkTex(c, rx, ry) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    t.anisotropy = 8; if ('encoding' in t) t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function grain(x, W, H, n, a) {
    for (var i = 0; i < n; i++) {
      var g = Math.random();
      x.fillStyle = 'rgba(' + (g < 0.5 ? '0,0,0,' : '255,255,255,') + (Math.random() * a) + ')';
      x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  }
  function facadeCanvas(base, cols, floors, trim) {
    var W = 256, H = 512, c = mkCanvas(W, H), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, W, H);
    grain(x, W, H, 2400, 0.07);
    var fh = H / floors, cw = W / cols;
    for (var f = 0; f < floors; f++) {
      if (trim) { x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(0, f * fh - 1, W, 2); }
      for (var cc = 0; cc < cols; cc++) {
        var wx = cc * cw + cw * 0.27, wy = f * fh + fh * 0.24, ww = cw * 0.46, wh = fh * 0.46;
        x.fillStyle = 'rgba(60,50,40,.20)'; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        var g = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
        g.addColorStop(0, '#4b6070'); g.addColorStop(0.45, '#7d95a6'); g.addColorStop(1, '#2b3a46');
        x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
        x.fillStyle = 'rgba(24,30,36,.55)'; x.fillRect(wx, wy, ww * 0.13, wh); x.fillRect(wx + ww * 0.87, wy, ww * 0.13, wh);
        x.fillStyle = 'rgba(255,255,255,.10)'; x.fillRect(wx, wy, ww, wh * 0.18);
        if (f < floors - 1) {
          x.fillStyle = 'rgba(30,26,22,.13)'; x.fillRect(wx - 5, wy + wh + 3, ww + 10, 4);
          x.strokeStyle = 'rgba(30,26,22,.18)'; x.lineWidth = 1;
          for (var b = 0; b <= 6; b++) { var bx = wx - 5 + b * (ww + 10) / 6; x.beginPath(); x.moveTo(bx, wy + wh + 3); x.lineTo(bx, wy + wh - 7); x.stroke(); }
        }
      }
    }
    x.fillStyle = 'rgba(40,32,24,.22)'; x.fillRect(0, H - 10, W, 10);
    return c;
  }
  function roofCanvas() {
    var c = mkCanvas(128, 128), x = c.getContext('2d');
    x.fillStyle = '#8d7b68'; x.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 900; i++) { x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0,' : '255,255,255,') + (Math.random() * 0.09) + ')'; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    x.strokeStyle = 'rgba(0,0,0,.16)'; x.lineWidth = 1;
    for (var k = 0; k < 128; k += 8) { x.beginPath(); x.moveTo(0, k); x.lineTo(128, k); x.stroke(); }
    return c;
  }
  function asphaltCanvas() {
    var c = mkCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#4a4c50'; x.fillRect(0, 0, 256, 256);
    grain(x, 256, 256, 9000, 0.1);
    for (var i = 0; i < 40; i++) { x.fillStyle = 'rgba(20,20,22,.16)'; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 12, 0, Math.PI * 2); x.fill(); }
    return c;
  }
  function groundCanvas() {
    var c = mkCanvas(256, 256), x = c.getContext('2d');
    x.fillStyle = '#8e887f'; x.fillRect(0, 0, 256, 256);
    grain(x, 256, 256, 6000, 0.08);
    return c;
  }

  /* ---- ground ---- */
  var gTex = mkTex(groundCanvas(), 420, 420);
  var ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ map: gTex, color: 0xb6b0a6, roughness: 0.98, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.06; ground.receiveShadow = true; scene.add(ground);

  /* ---- roads: sidewalks + asphalt + markings ---- */
  function pushQuad(pos, col, a1, a2, wd, y, c) {
    var ddx = a2[0] - a1[0], ddz = a2[1] - a1[1], len = Math.hypot(ddx, ddz);
    if (len < 0.001) return;
    var nx = -ddz / len * wd / 2, nz = ddx / len * wd / 2;
    pos.push(a1[0] + nx, y, a1[1] + nz, a1[0] - nx, y, a1[1] - nz, a2[0] - nx, y, a2[1] - nz,
             a1[0] + nx, y, a1[1] + nz, a2[0] - nx, y, a2[1] - nz, a2[0] + nx, y, a2[1] + nz);
    for (var q = 0; q < 6; q++) { if (col) col.push(c.r, c.g, c.b); }
  }
  var walkPos = [], roadPos = [], roadUv = [], markPos = [];
  var cA = new THREE.Color(0xdedad2), cPed = new THREE.Color(0xd2cec6);
  for (var li = 0; li < LINES.length; li++) {
    var L = LINES[li]; if (L.c >= 13) continue;
    var wdt = WID[L.c] || 6, pts2 = L.p;
    var isPed = L.c === 8;
    for (var k = 0; k < pts2.length - 1; k++) {
      var a1 = pts2[k], a2 = pts2[k + 1];
      pushQuad(walkPos, null, a1, a2, wdt + (isPed ? 3 : 7), 0.012, null);
      pushQuad(roadPos, null, a1, a2, wdt, isPed ? 0.045 : 0.03, null);
      var len = Math.hypot(a2[0] - a1[0], a2[1] - a1[1]);
      roadUv.push(len / 9, 1);
      if (L.c <= 4 && len > 6 && !isPed) {
        var dx = (a2[0] - a1[0]) / len, dz = (a2[1] - a1[1]) / len;
        for (var d = 3; d < len - 3; d += 11) {
          var cx = a1[0] + dx * d, cz = a1[1] + dz * d;
          var ex = cx + dx * 3.2, ez = cz + dz * 3.2;
          pushQuad(markPos, null, [cx, cz], [ex, ez], 0.5, 0.055, null);
        }
      }
    }
  }
  function lineMesh(pos, mat, y) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    var m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); return m;
  }
  lineMesh(walkPos, new THREE.MeshStandardMaterial({ color: 0xc9c3b8, roughness: 0.95 }), 0);
  var roadTex = mkTex(asphaltCanvas(), 1, 1);
  lineMesh(roadPos, new THREE.MeshStandardMaterial({ map: roadTex, color: 0x9b9c9f, roughness: 0.92, side: THREE.DoubleSide }), 0);
  lineMesh(markPos, new THREE.MeshBasicMaterial({ color: 0xf0efe6 }), 0);

  /* ---- parks / water ---- */
  function fillPoly(pts, color, y, rough) {
    if (pts.length < 3) return;
    var sh = new THREE.Shape();
    sh.moveTo(pts[0][0], -pts[0][1]);
    for (var i2 = 1; i2 < pts.length; i2++) sh.lineTo(pts[i2][0], -pts[i2][1]);
    var g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: color, roughness: rough || 0.95, metalness: 0, side: THREE.DoubleSide }));
    m.position.y = y; m.receiveShadow = true; scene.add(m);
  }
  for (var li2 = 0; li2 < LINES.length; li2++) {
    var LL = LINES[li2];
    if (LL.c === 13) fillPoly(LL.p, 0x5d7245, 0.04);
    else if (LL.c === 14) fillPoly(LL.p, 0x2c5c74, 0.02, 0.15);
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

  /* ---- buildings ---- */
  var bases = ['#e0d3bd', '#d6c5a8', '#cbbb9e', '#e6dac6', '#c2b3a0', '#d9c39f'];
  function wallMats(cols, floors) {
    var m = [];
    for (var b = 0; b < 3; b++) {
      var t = mkTex(facadeCanvas(bases[(b + cols) % bases.length], cols, floors, b === 0), 1, 1);
      m.push(new THREE.MeshStandardMaterial({ map: t, color: 0xffffff, roughness: 0.86, metalness: 0.02 }));
    }
    return m;
  }
  var wallGeo = new THREE.BoxGeometry(1, 1, 1); wallGeo.translate(0, 0.5, 0);
  var roofGeo = new THREE.PlaneGeometry(1, 1); roofGeo.rotateX(-Math.PI / 2);
  var roofTex = mkTex(roofCanvas(), 3, 3);
  var roofMat = new THREE.MeshStandardMaterial({ map: roofTex, color: 0xb9b2a6, roughness: 0.95 });

  var buckets = [{ w: [], r: [] }, { w: [], r: [] }, { w: [], r: [] }];
  var wallMatsByBucket = [wallMats(4, 7), wallMats(5, 9), wallMats(6, 11)];
  for (var bi = 0; bi < NB; bi++) {
    var B = BLD[bi], size = (B.w + B.h) / 2, bk = size < 15 ? 0 : (size < 30 ? 1 : 2);
    buckets[bk].w.push(bi);
  }
  var dummyM = new THREE.Matrix4(), dq = new THREE.Quaternion(), dp = new THREE.Vector3(), ds = new THREE.Vector3(), up0 = new THREE.Vector3(0, 1, 0), cc0 = new THREE.Color();
  var roofInst;
  for (var bk2 = 0; bk2 < 3; bk2++) {
    var idxs = buckets[bk2].w;
    for (var mm2 = 0; mm2 < 3; mm2++) {
      var sub = idxs.filter(function (v, i) { return i % 3 === mm2; });
      if (!sub.length) continue;
      var im = new THREE.InstancedMesh(wallGeo, wallMatsByBucket[bk2][mm2], sub.length);
      im.castShadow = true; im.receiveShadow = true;
      for (var s2 = 0; s2 < sub.length; s2++) {
        var Bd = BLD[sub[s2]];
        dq.setFromAxisAngle(up0, -Bd.a);
        dp.set(Bd.x, 0, Bd.z); ds.set(Bd.w, Bd.hh, Bd.h);
        dummyM.compose(dp, dq, ds); im.setMatrixAt(s2, dummyM);
        cc0.setHex(Bd.col); im.setColorAt(s2, cc0);
      }
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      scene.add(im);
    }
    var ri = new THREE.InstancedMesh(roofGeo, roofMat, idxs.length);
    ri.receiveShadow = true; ri.castShadow = true;
    for (var s3 = 0; s3 < idxs.length; s3++) {
      var Br = BLD[idxs[s3]];
      dq.setFromAxisAngle(up0, -Br.a); dp.set(Br.x, Br.hh + 0.04, Br.z); ds.set(Br.w + 0.4, 1, Br.h + 0.4);
      dummyM.compose(dp, dq, ds); ri.setMatrixAt(s3, dummyM);
      cc0.setHex(0xb8ada0); ri.setColorAt(s3, cc0);
    }
    ri.instanceMatrix.needsUpdate = true; if (ri.instanceColor) ri.instanceColor.needsUpdate = true;
    scene.add(ri);
  }

  /* ---- trees ---- */
  (function () {
    var spots = [];
    for (var i = 0; i < LINES.length; i++) {
      var Ln = LINES[i];
      if (Ln.c === 13) {
        var pp = Ln.p;
        for (var k2 = 0; k2 < pp.length - 1; k2++) {
          var a3 = pp[k2], b3 = pp[k2 + 1], ln = Math.hypot(b3[0] - a3[0], b3[1] - a3[1]);
          for (var t2 = 0; t2 < ln; t2 += 14) {
            var f = t2 / ln;
            spots.push([lerp(a3[0], b3[0], f), lerp(a3[1], b3[1], f)]);
          }
        }
      } else if (Ln.c <= 3) {
        var q2 = Ln.p;
        for (var k3 = 0; k3 < q2.length - 1; k3++) {
          if (Math.random() > 0.35) continue;
          var A3 = q2[k3], B3 = q2[k3 + 1], ln2 = Math.hypot(B3[0] - A3[0], B3[1] - A3[1]);
          if (ln2 < 8) continue;
          var dx2 = (B3[0] - A3[0]) / ln2, dz2 = (B3[1] - A3[1]) / ln2;
          var side = Math.random() < 0.5 ? 1 : -1, off = ((WID[Ln.c] || 8) / 2 + 4.4) * side;
          spots.push([A3[0] - dz2 * off, A3[1] + dx2 * off]);
        }
      }
    }
    spots = spots.filter(function (p2) { return isFree(p2[0], p2[1], 1.2); }).slice(0, 1500);
    var trGeo = new THREE.CylinderGeometry(0.17, 0.24, 2.6, 6); trGeo.translate(0, 1.3, 0);
    var trMat = new THREE.MeshStandardMaterial({ color: 0x5b4a37, roughness: 0.95 });
    var cnGeo = new THREE.IcosahedronGeometry(2.1, 1);
    var cnMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    var ti = new THREE.InstancedMesh(trGeo, trMat, spots.length);
    var ci = new THREE.InstancedMesh(cnGeo, cnMat, spots.length);
    ti.castShadow = true; ci.castShadow = true;
    for (var s4 = 0; s4 < spots.length; s4++) {
      var sp = spots[s4], hgt = 0.85 + Math.random() * 0.6;
      dq.setFromAxisAngle(up0, Math.random() * 6.28);
      dp.set(sp[0], 0, sp[1]); ds.set(1, hgt, 1); dummyM.compose(dp, dq, ds); ti.setMatrixAt(s4, dummyM);
      ds.set(1 + Math.random() * 0.35, 0.95 + Math.random() * 0.4, 1 + Math.random() * 0.35);
      dp.set(sp[0], 2.6 * hgt + 1.1, sp[1]); dummyM.compose(dp, dq, ds); ci.setMatrixAt(s4, dummyM);
      cc0.setHSL(0.26 + Math.random() * 0.07, 0.34 + Math.random() * 0.18, 0.24 + Math.random() * 0.12); ci.setColorAt(s4, cc0);
    }
    ti.instanceMatrix.needsUpdate = true; ci.instanceMatrix.needsUpdate = true;
    if (ci.instanceColor) ci.instanceColor.needsUpdate = true;
    scene.add(ti); scene.add(ci);
  })();

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
  if ('ontouchstart' in window) document.body.classList.add('touch');

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
    sun.position.set(tgt.x + 190, 300, tgt.z + 135);
    sun.target.position.set(tgt.x, 0, tgt.z);
    sun.target.updateMatrixWorld();
    sky.position.set(camera.position.x, 0, camera.position.z);

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
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  var last = 0;
  var fpsT = 0, fpsN = 0;
  function loop(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016; last = now;
    if (location.search.indexOf('fps') >= 0) { fpsT += dt; fpsN++; if (fpsT > 1) { document.title = 'FPS ' + Math.round(fpsN / fpsT); fpsT = 0; fpsN = 0; } }
    readPad();
    if (state.running && !state.paused) update(dt);
    renderer.render(scene, camera);
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
