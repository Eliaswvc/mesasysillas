// Modelos 3D procedurales de la mesa y la silla (basados en las fotos del catálogo).
// Medidas en metros. Mesa plegable 183x76 cm, silla plegable de plástico.
export function makeModels(THREE) {
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  function plasticTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#f3f3f4'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      x.fillStyle = `rgba(${90 + Math.random() * 60 | 0},${90 + Math.random() * 60 | 0},${100 + Math.random() * 60 | 0},${.08 + Math.random() * .16})`;
      x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, .5 + Math.random() * 1.1, 0, 7); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  const M = {
    plastic: new THREE.MeshStandardMaterial({ color: 0xffffff, map: plasticTexture(), roughness: .55, metalness: 0 }),
    plasticChair: new THREE.MeshStandardMaterial({ color: 0xf6f6f8, roughness: .5, metalness: 0 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x3c3c42, roughness: .42, metalness: .55 }),
    steelGray: new THREE.MeshStandardMaterial({ color: 0x9a9ca3, roughness: .45, metalness: .5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: .9, metalness: 0 }),
    plasticBlack: new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: .55, metalness: 0 }),
    steelBlack: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: .4, metalness: .5 }),
    seam: new THREE.MeshStandardMaterial({ color: 0xc9cad0, roughness: .8 })
  };

  function tube(a, b, r, mat) {
    const va = V(a), vb = V(b), len = va.distanceTo(vb);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
    m.position.copy(va).add(vb).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    return m;
  }
  function path(g, pts, r, mat) {
    for (let i = 0; i < pts.length - 1; i++) g.add(tube(pts[i], pts[i + 1], r, mat));
    pts.forEach((p, i) => { if (i > 0 && i < pts.length - 1) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat); s.position.copy(V(p)); g.add(s); } });
  }
  function foot(g, x, z, r) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, .022, 14), M.rubber);
    f.position.set(x, .011, z); g.add(f);
  }
  function rrect(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  // losa horizontal con bordes redondeados; ocupa y de 0 a t
  function slab(w, d, t, r, bevel, mat) {
    const geo = new THREE.ExtrudeGeometry(rrect(w, d, r), { depth: t - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
    geo.rotateX(-Math.PI / 2); geo.translate(0, bevel, 0);
    // UV simples para la textura del plástico
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + .5, p.getZ(i) / d + .5);
    return new THREE.Mesh(geo, mat);
  }

  function buildTable() {
    const g = new THREE.Group(), L = 1.83, W = .76, H = .74, T = .05, r = .016;
    const top = slab(L, W, T, .035, .011, M.plastic); top.position.y = H - T; g.add(top);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(.004, .002, W - .03), M.seam); seam.position.y = H + .001; g.add(seam);
    const yb = H - T - .014;
    for (const sx of [-1, 1]) {
      const e = sx * (L / 2 - .17);
      for (const sz of [-1, 1]) {
        path(g, [[e, yb, sz * .27], [e + sx * .03, 0.02, sz * .345]], r, M.steelDark);
        foot(g, e + sx * .03, sz * .345, r);
        // diagonales bajo el tablero (como en la foto)
        path(g, [[e, yb, sz * .25], [sx * .2, yb, -sz * .25]], r * .8, M.steelDark);
      }
      path(g, [[e, yb, -.27], [e, yb, .27]], r, M.steelDark);
      path(g, [[e + sx * .017, .24, -.31], [e + sx * .017, .24, .31]], r * .9, M.steelDark);
    }
    return g;
  }

  function buildChair(plasticMat = M.plasticChair, steelMat = M.steelGray) {
    const g = new THREE.Group(), r = .0115;
    const seat = slab(.43, .40, .03, .05, .008, plasticMat); seat.position.set(0, .42, .02); g.add(seat);
    // respaldo con agarradera
    const sh = rrect(.37, .29, .07), hole = new THREE.Path(), hx = -.065, hy = .075, hw = .13, hh = .032;
    hole.moveTo(hx + .012, hy); hole.lineTo(hx + hw - .012, hy); hole.quadraticCurveTo(hx + hw, hy, hx + hw, hy + .012);
    hole.lineTo(hx + hw, hy + hh - .012); hole.quadraticCurveTo(hx + hw, hy + hh, hx + hw - .012, hy + hh);
    hole.lineTo(hx + .012, hy + hh); hole.quadraticCurveTo(hx, hy + hh, hx, hy + hh - .012);
    hole.lineTo(hx, hy + .012); hole.quadraticCurveTo(hx, hy, hx + .012, hy); sh.holes.push(hole);
    const bg = new THREE.ExtrudeGeometry(sh, { depth: .014, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 2, curveSegments: 8 });
    const back = new THREE.Mesh(bg, plasticMat); back.position.set(0, .655, -.2); back.rotation.x = -.12; g.add(back);
    for (const sx of [-1, 1]) {
      const x = sx * .205;
      path(g, [[x, .02, -.3], [x, .43, -.2], [x, .80, -.225]], r, steelMat); // pata trasera + parante del respaldo
      path(g, [[x, .02, .27], [x, .42, .17]], r, steelMat);                    // pata delantera
      path(g, [[x, .2, .215], [x, .2, -.256]], r * .85, steelMat);             // riel lateral
      path(g, [[x, .41, .15], [x, .41, -.2]], r * .85, steelMat);              // soporte bajo el asiento
      foot(g, x, -.3, r); foot(g, x, .27, r);
    }
    path(g, [[-.205, .16, .232], [.205, .16, .232]], r * .85, steelMat);       // travesaño delantero
    path(g, [[-.205, .17, -.26], [.205, .17, -.26]], r * .85, steelMat);       // travesaño trasero
    path(g, [[-.205, .41, -.2], [.205, .41, -.2]], r * .85, steelMat);
    path(g, [[-.205, .41, .15], [.205, .41, .15]], r * .85, steelMat);
    return g;
  }

  function buildPack(sillas) {
    const g = new THREE.Group(), k = Math.max(1, Math.round(sillas / 2));
    g.add(buildTable());
    for (let i = 0; i < k; i++) {
      const x = (i - (k - 1) / 2) * .44;
      const a = buildChair(); a.position.set(x, 0, -.5); g.add(a);
      const b = buildChair(); b.position.set(x, 0, .5); b.rotation.y = Math.PI; g.add(b);
    }
    return g;
  }

  // ---- Pack Familiar: mesa cuadrada blanca + 4 sillas monobloc con brazos (basado en la foto) ----
  function buildTableSquare() {
    const g = new THREE.Group(), S = .82, H = .72, T = .04;
    const top = slab(S, S, T, .05, .01, M.plastic); top.position.y = H - T; g.add(top);
    const lip = slab(S - .08, S - .08, .05, .04, .008, M.plastic); lip.position.y = H - T - .05; g.add(lip); // faldón bajo el tablero
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = slab(.075, .075, H - T - .01, .018, .007, M.plastic);
      leg.position.set(sx * (S / 2 - .06), 0, sz * (S / 2 - .06)); g.add(leg);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(.03, .032, .012, 14), M.plasticChair);
      pad.position.set(sx * (S / 2 - .06), .006, sz * (S / 2 - .06)); g.add(pad);
    }
    for (let i = -2; i <= 2; i++) { // ranuras sutiles del tablero
      const gr = new THREE.Mesh(new THREE.BoxGeometry(.003, .0015, S - .12), M.seam); gr.position.set(i * .13, H + .0008, 0); g.add(gr);
    }
    return g;
  }

  function buildChairMonobloc() {
    const g = new THREE.Group(), seatY = .40;
    const seat = slab(.46, .44, .045, .06, .012, M.plasticChair); seat.position.set(0, seatY, 0); g.add(seat);
    for (let i = -2; i <= 2; i++) { // surcos del asiento
      const gr = new THREE.Mesh(new THREE.BoxGeometry(.004, .002, .34), M.seam); gr.position.set(i * .07, seatY + .0455, .01); g.add(gr);
    }
    // patas ligeramente cónicas
    for (const [x, z] of [[-.19, .18], [.19, .18], [-.19, -.17], [.19, -.17]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.03, .022, seatY + .01, 14), M.plasticChair);
      leg.position.set(x, (seatY + .01) / 2, z); g.add(leg);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(.024, .026, .01, 12), M.plasticChair); pad.position.set(x, .005, z); g.add(pad);
    }
    // travesaños bajos
    for (const sx of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.02, .025, .36), M.plasticChair); rail.position.set(sx * .19, .16, .005); g.add(rail); }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(.36, .025, .02), M.plasticChair); cross.position.set(0, .16, -.17); g.add(cross);
    // respaldo en abanico con ranuras
    const sh = new THREE.Shape();
    sh.moveTo(-.2, 0); sh.lineTo(.2, 0); sh.lineTo(.255, .36); sh.quadraticCurveTo(0, .45, -.255, .36); sh.lineTo(-.2, 0);
    for (let i = -3; i <= 3; i++) {
      const h = new THREE.Path(), x0 = i * .052, x1 = i * .066, w = .011;
      h.moveTo(x0 - w, .07); h.lineTo(x0 + w, .07); h.lineTo(x1 + w * 1.3, .31); h.lineTo(x1 - w * 1.3, .31); h.lineTo(x0 - w, .07);
      sh.holes.push(h);
    }
    const bg = new THREE.ExtrudeGeometry(sh, { depth: .018, bevelEnabled: true, bevelThickness: .004, bevelSize: .004, bevelSegments: 2, curveSegments: 10 });
    const back = new THREE.Mesh(bg, M.plasticChair); back.position.set(0, .47, -.2); back.rotation.x = -.2; g.add(back);
    const base = new THREE.Mesh(new THREE.BoxGeometry(.42, .06, .04), M.plasticChair); base.position.set(0, .465, -.195); g.add(base);
    // apoyabrazos con soporte delantero
    for (const sx of [-1, 1]) {
      const arm = slab(.06, .42, .032, .026, .009, M.plasticChair); arm.position.set(sx * .245, .62, -.03); g.add(arm);
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(.02, .024, .22, 12), M.plasticChair); sup.position.set(sx * .225, .515, .16); g.add(sup);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .24, 12), M.plasticChair); post.position.set(sx * .225, .52, -.17); post.rotation.x = -.12; g.add(post);
    }
    return g;
  }

  function buildPackFamiliar() {
    const g = new THREE.Group(), d = .6;
    g.add(buildTableSquare());
    [[0, -d, 0], [0, d, Math.PI], [-d, 0, Math.PI / 2], [d, 0, -Math.PI / 2]].forEach(([x, z, ry]) => {
      const c = buildChairMonobloc(); c.position.set(x, 0, z); c.rotation.y = ry; g.add(c);
    });
    return g;
  }

  // ---- Pack Evento: mesa rectangular marrón tipo ratán + 6 sillas altas con brazos (basado en la foto) ----
  function rattanTexture() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#6f5a4c'; x.fillRect(0, 0, 128, 128);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      x.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.13)';
      x.fillRect(i * 8, j * 8 + ((i % 2) ? 3 : 0), 7, 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 3); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  M.rattan = new THREE.MeshStandardMaterial({ color: 0xffffff, map: rattanTexture(), roughness: .72, metalness: 0 });
  M.rattanSolid = new THREE.MeshStandardMaterial({ color: 0x66524a, roughness: .65, metalness: 0 });

  function buildTableRattan() {
    const g = new THREE.Group(), L = 1.62, W = .85, H = .74, T = .045;
    const top = slab(L, W, T, .03, .01, M.rattan); top.position.y = H - T; g.add(top);
    const lip = slab(L - .1, W - .1, .06, .03, .008, M.rattanSolid); lip.position.y = H - T - .06; g.add(lip);
    const mid = new THREE.Mesh(new THREE.BoxGeometry(.006, .002, W - .1), M.rattanSolid); mid.position.y = H + .001; g.add(mid);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = slab(.085, .085, H - T - .01, .02, .008, M.rattan);
      leg.position.set(sx * (L / 2 - .07), 0, sz * (W / 2 - .07)); g.add(leg);
    }
    return g;
  }

  function buildChairRattan() {
    const g = new THREE.Group(), seatY = .43;
    const seat = slab(.48, .46, .05, .06, .012, M.rattan); seat.position.set(0, seatY, 0); g.add(seat);
    // patas laterales macizas (paneles) como en la foto
    for (const sx of [-1, 1]) {
      const fl = slab(.06, .09, seatY + .01, .02, .008, M.rattanSolid); fl.position.set(sx * .2, 0, .17); g.add(fl);
      const rl = slab(.06, .12, seatY + .01, .02, .008, M.rattanSolid); rl.position.set(sx * .2, 0, -.2); g.add(rl);
      const side = slab(.03, .36, .1, .012, .005, M.rattanSolid); side.position.set(sx * .2, seatY - .09, -.01); g.add(side);
    }
    // respaldo alto, ligeramente inclinado, con listones verticales
    const sh = new THREE.Shape();
    sh.moveTo(-.2, 0); sh.lineTo(.2, 0); sh.lineTo(.215, .5); sh.quadraticCurveTo(0, .56, -.215, .5); sh.lineTo(-.2, 0);
    const bg = new THREE.ExtrudeGeometry(sh, { depth: .03, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 2, curveSegments: 10 });
    const pu = bg.attributes.position, uv = bg.attributes.uv;
    for (let i = 0; i < pu.count; i++) uv.setXY(i, pu.getX(i) * 2.2 + .5, pu.getY(i) * 1.6);
    const back = new THREE.Mesh(bg, M.rattan); back.position.set(0, seatY + .04, -.22); back.rotation.x = -.16; g.add(back);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(.44, .05, .05), M.rattanSolid); rim.position.set(0, seatY + .05, -.215); g.add(rim);
    // apoyabrazos
    for (const sx of [-1, 1]) {
      const arm = slab(.055, .42, .03, .022, .008, M.rattanSolid); arm.position.set(sx * .26, .66, -.03); g.add(arm);
      const sup = slab(.045, .05, .24, .015, .006, M.rattanSolid); sup.position.set(sx * .25, .44, .15); g.add(sup);
      const post = slab(.04, .05, .24, .015, .006, M.rattanSolid); post.position.set(sx * .245, .44, -.2); g.add(post);
    }
    return g;
  }

  function buildPackEvento() {
    const g = new THREE.Group(), d = .64, dx = .54;
    g.add(buildTableRattan());
    for (let i = -1; i <= 1; i++) {
      const a = buildChairRattan(); a.position.set(i * dx, 0, -d); g.add(a);
      const b = buildChairRattan(); b.position.set(i * dx, 0, d); b.rotation.y = Math.PI; g.add(b);
    }
    return g;
  }

  // ---- Pack Banquete: mesa plegable blanca + 8 sillas plegables negras, 4 por lado (basado en la foto) ----
  function buildPackBanquete() {
    const g = new THREE.Group(), d = .5, dx = .45;
    g.add(buildTable());
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * dx;
      const a = buildChair(M.plasticBlack, M.steelBlack); a.position.set(x, 0, -d); g.add(a);
      const b = buildChair(M.plasticBlack, M.steelBlack); b.position.set(x, 0, d); b.rotation.y = Math.PI; g.add(b);
    }
    return g;
  }

  return { buildTable, buildChair, buildPack, buildPackFamiliar, buildPackEvento, buildPackBanquete };
}
