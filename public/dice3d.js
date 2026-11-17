// ลูกเต๋า 3 มิติ (Three.js) — ทอยลงกลางจอแล้วแสดงตัวเลข
window.Dice3D = (() => {
  const T = window.THREE;
  let renderer, scene, camera, canvas, ready = false;
  let dice = [], start = 0, raf = 0, hideTimer = 0, clearTimer = 0, last = 0;
  const COLORS = { 4: 0x2e7d32, 6: 0x1565c0, 8: 0x6a1b9a, 10: 0xb71c1c, 12: 0xe65100, 20: 0x8e1b3a, 100: 0x00695c };

  function init() {
    if (ready) return true;
    if (!T) return false;
    try {
      canvas = document.getElementById('dice3d');
      renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      scene = new T.Scene();
      camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
      camera.position.set(0, 0, 14);
      scene.add(new T.AmbientLight(0xffffff, 0.55));
      const key = new T.DirectionalLight(0xffffff, 1.5); key.position.set(3, 5, 8); scene.add(key);
      const warm = new T.PointLight(0xffc870, 1.4, 40); warm.position.set(-5, -3, 6); scene.add(warm);
      resize(); window.addEventListener('resize', resize);
      ready = true;
    } catch (e) { console.warn('WebGL ใช้งานไม่ได้', e); }
    return ready;
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function d10Geom() {
    const top = [0, 1.15, 0], bot = [0, -1.15, 0], ring = [];
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5;
      ring.push([Math.cos(a) * 1.0, i % 2 ? -0.11 : 0.11, Math.sin(a) * 1.0]);
    }
    const pos = [];
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    for (let k = 0; k < 5; k++) {
      const i = 2 * k;
      tri(top, ring[(i + 1) % 10], ring[i]); tri(top, ring[(i + 2) % 10], ring[(i + 1) % 10]);
      const j = 2 * k + 1;
      tri(bot, ring[j], ring[(j + 1) % 10]); tri(bot, ring[(j + 1) % 10], ring[(j + 2) % 10]);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
  function geom(s) {
    switch (s) {
      case 4: return new T.TetrahedronGeometry(1.2);
      case 6: return new T.BoxGeometry(1.35, 1.35, 1.35);
      case 8: return new T.OctahedronGeometry(1.1);
      case 10: case 100: return d10Geom();
      case 12: return new T.DodecahedronGeometry(1.1);
      default: return new T.IcosahedronGeometry(1.15);
    }
  }
  function label(text, tone) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.beginPath(); x.arc(128, 128, 104, 0, Math.PI * 2);
    x.fillStyle = 'rgba(16,12,10,.88)'; x.fill();
    x.lineWidth = 12; x.strokeStyle = tone === 'gold' ? '#ffd54a' : tone === 'red' ? '#ff4d4d' : tone === 'dim' ? '#6d6458' : '#e8c46a'; x.stroke();
    x.fillStyle = tone === 'dim' ? '#9a8f80' : '#fff6dc';
    x.font = `900 ${String(text).length > 2 ? 92 : 120}px Cinzel, serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 136);
    const tex = new T.CanvasTexture(c);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false }));
    sp.scale.set(1.25, 1.25, 1);
    return sp;
  }
  function clear() {
    for (const d of dice) {
      scene.remove(d.mesh); scene.remove(d.sprite);
      d.mesh.geometry.dispose(); d.mesh.material.dispose();
      d.mesh.children.forEach(ch => { ch.geometry.dispose(); ch.material.dispose(); });
      d.sprite.material.map.dispose(); d.sprite.material.dispose();
    }
    dice = [];
  }

  // rolls: [{s, v, dropped}]
  function roll(rolls, opts = {}) {
    if (!init()) return false;
    clearTimeout(hideTimer); clearTimeout(clearTimer); cancelAnimationFrame(raf); clear();
    const list = rolls.slice(0, 8);
    const n = list.length, gap = n > 5 ? 1.9 : 2.5;
    list.forEach((r, i) => {
      const color = COLORS[r.s] ?? 0x5d4037;
      const mat = new T.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.35, flatShading: true,
        emissive: opts.nat20 ? 0x664400 : opts.nat1 ? 0x440000 : 0x000000, transparent: true, opacity: r.dropped ? 0.45 : 1 });
      const g = geom(r.s);
      const mesh = new T.Mesh(g, mat);
      mesh.add(new T.LineSegments(new T.EdgesGeometry(g, 1), new T.LineBasicMaterial({ color: 0xf3d58a, transparent: true, opacity: r.dropped ? 0.3 : 0.85 })));
      const tx = (i - (n - 1) / 2) * gap, ty = 0.4;
      const from = new T.Vector3(tx * 0.3 + (Math.random() - 0.5) * 10, -7, 2);
      mesh.position.copy(from);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const tone = r.dropped ? 'dim' : (opts.nat20 && r.s === 20) ? 'gold' : (opts.nat1 && r.s === 20) ? 'red' : '';
      const sprite = label(r.v, tone);
      sprite.position.set(tx, ty, 2.2);
      scene.add(mesh); scene.add(sprite);
      dice.push({ mesh, sprite, from, to: new T.Vector3(tx, ty, 0), delay: i * 70,
        spin: new T.Vector3(8 + Math.random() * 8, 8 + Math.random() * 8, 4 + Math.random() * 6) });
    });
    canvas.classList.add('show');
    start = performance.now(); last = start;
    raf = requestAnimationFrame(tick);
    hideTimer = setTimeout(hide, 3600);
    return true;
  }
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const d of dice) {
      const t = Math.max(0, Math.min(1, (now - start - d.delay) / 1100));
      const e = 1 - Math.pow(1 - t, 3);
      d.mesh.position.lerpVectors(d.from, d.to, e);
      d.mesh.position.y += Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * 1.6;
      const slow = Math.pow(1 - t, 2) + 0.02;
      d.mesh.rotation.x += d.spin.x * dt * slow;
      d.mesh.rotation.y += d.spin.y * dt * slow;
      d.mesh.rotation.z += d.spin.z * dt * slow * 0.5;
      const lt = Math.max(0, Math.min(1, (now - start - d.delay - 950) / 250));
      d.sprite.material.opacity = lt;
      const sc = 1.25 * (0.6 + 0.4 * lt + (lt < 1 ? Math.sin(lt * Math.PI) * 0.25 : 0));
      d.sprite.scale.set(sc, sc, 1);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  function hide() {
    canvas.classList.remove('show');
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { cancelAnimationFrame(raf); clear(); renderer && renderer.render(scene, camera); }, 400);
  }
  return { roll, hide };
})();
