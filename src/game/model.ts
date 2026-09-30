import * as THREE from 'three';
import { makeCrystalMaterial, makeGoldMaterial, type CrystalUniforms } from './crystal';

// ---------------------------------------------------------------------------
// CRYSTAL RIDER
// A graceful human figure made of smooth sculpted "lofts" (elliptical cross
// sections interpolated with Catmull-Rom, closed with rounded caps).
//
// The SWORD lives on its own pivot (boardRoot) so it can kickflip, shove-it
// and wrap independently of the rider, and be pulled around in grabs.
//
// Everything is posed procedurally every frame:
//   • surfer stance, feet planted on the sword with 2-bone IK
//   • board flips: feet pop off the sword, tuck, and catch it again
//   • 9 skate grab poses with their own full-body shape (indy, method, ...)
//   • superman: the whole body swings out behind the sword
//   • crouch spring, balance arms, wings in the air, tuck during body flips
// Model forward is +Z. Toe side = +X.
// ---------------------------------------------------------------------------

export interface RiderAnim {
  time: number;
  speed: number;
  steer: number;
  air: boolean;
  flipVel: number;
  spinVel: number;
  boost: boolean;
  height: number;
  head: number;
  sword: number;
  /** 0 = humanoid kristal · 1 = SLUGPUP penuh (Rain World): badan siput
   *  bulat tanpa leher, kepala besar mata hitam, lengan kurus, kaki tebal,
   *  telinga bulat — morph di-blend mulus. */
  pup: number;
  // ---- skate tricks
  boardRoll: number;
  boardYaw: number;
  boardPitch: number;
  boardPivotZ: number;
  feetLift: number;
  pose: string | null;
  poseW: number;
}

export interface Rider {
  group: THREE.Group;
  tail: THREE.Object3D;
  neck: THREE.Object3D;
  tailBone: THREE.Object3D; // pangkal punggung — jangkar ekor slugpup
  blade: THREE.Mesh;
  crystal: THREE.MeshPhysicalMaterial;
  crystalU: CrystalUniforms;
  gold: THREE.MeshPhysicalMaterial;
  steel: THREE.MeshStandardMaterial;
  goldHilt: THREE.MeshStandardMaterial;
  animate: (dt: number, a: RiderAnim) => void;
  impulse: (strength: number) => void;
  setEnv: (tex: THREE.Texture) => void;
  setBoard: (type: number) => void; // 0 = papan surf Silver Surfer · 1 = pedang
  setScarfLook: (kind: number, hex: string) => void; // kerah slayer: -1 mati · 0 kain · 1 sulaman · 2 ethereal
}

// ============================================================ grab poses
type BoardPt = 'toe' | 'heel' | 'toeF' | 'heelB' | 'nose' | 'tail';
type Hand = { at: BoardPt } | { d: [number, number, number] } | { grip: true };

interface Pose {
  crouch: number; // knee bend 0..1
  bend: number; // extra spine bend (negative = arch back)
  twist: number;
  yaw: number | null; // body yaw override (null = keep surf stance)
  head: number; // extra head pitch (negative = look up)
  off: [number, number, number]; // sword offset (rider space, m)
  rot: [number, number, number]; // sword tilt (x = nose up/down, y = yaw, z = roll)
  front: Hand;
  back: Hand;
  superman?: boolean;
  /** [kaki depan, kaki belakang]: tarik lutut ke dada 0..1 — inti dari pose
   *  grab yang AKURAT (indy/melon/method = lutut naik, nose/tail = satu kaki
   *  lurus ke ujung papan). */
  legLift?: [number, number];
}

const POSES: Record<string, Pose> = {
  indy: {
    crouch: 0.95, bend: 0.3, twist: 0.12, yaw: null, head: 0.1,
    off: [0.02, 0.3, 0], rot: [0, 0, 0.12],
    front: { d: [-0.85, 0.45, 0.35] }, back: { at: 'toe' },
    legLift: [0.35, 0.6],
  },
  melon: {
    crouch: 0.9, bend: 0.28, twist: -0.12, yaw: null, head: 0.05,
    off: [-0.02, 0.28, 0], rot: [0, 0, -0.18],
    front: { at: 'heel' }, back: { d: [0.85, 0.45, -0.25] },
    legLift: [0.55, 0.3],
  },
  method: {
    crouch: 0.75, bend: -0.3, twist: -0.25, yaw: null, head: -0.25,
    off: [-0.28, 0.46, -0.02], rot: [0.28, 0.15, 0.95],
    front: { at: 'heel' }, back: { d: [0.55, 0.8, -0.25] },
    legLift: [0.65, 0.85],
  },
  stalefish: {
    crouch: 0.9, bend: 0.2, twist: 0.2, yaw: null, head: 0.1,
    off: [-0.1, 0.3, 0], rot: [0, 0, -0.35],
    front: { d: [-0.75, 0.6, 0.25] }, back: { at: 'heelB' },
    legLift: [0.3, 0.55],
  },
  nose: {
    crouch: 0.7, bend: 0.35, twist: 0.15, yaw: null, head: 0.1,
    off: [0, 0.22, 0.12], rot: [-0.6, 0, 0],
    front: { at: 'nose' }, back: { d: [0.85, 0.35, -0.35] },
    legLift: [0, 0.45],
  },
  tail: {
    crouch: 0.75, bend: 0.25, twist: -0.15, yaw: null, head: 0,
    off: [0, 0.26, -0.08], rot: [0.55, 0, 0],
    front: { d: [-0.8, 0.5, 0.4] }, back: { at: 'tail' },
    legLift: [0.45, 0],
  },
  japan: {
    crouch: 1, bend: 0.45, twist: 0.3, yaw: null, head: 0.15,
    off: [-0.12, 0.42, 0.12], rot: [-0.35, 0, 0.6],
    front: { at: 'toeF' }, back: { d: [0.8, 0.55, -0.35] },
    legLift: [0.6, 0.55],
  },
  christ: {
    crouch: 0.05, bend: -0.4, twist: 0, yaw: 0.55, head: -0.4,
    off: [0, 0.08, 0], rot: [0, 0, 0],
    front: { d: [-1, 0.2, 0.05] }, back: { d: [1, 0.2, 0.05] },
    legLift: [0, 0],
  },
  superman: {
    crouch: 0, bend: -0.1, twist: 0, yaw: 0, head: -0.95,
    off: [0, 0.32, 0.3], rot: [-0.12, 0, 0],
    front: { grip: true }, back: { grip: true }, superman: true,
  },
};

// ============================================================ loft builder
interface Ring {
  y: number;
  w: number;
  d: number;
  x?: number;
  z?: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function loft(keys: Ring[], radial = 28, sub = 6, capK0 = 1, capK1 = 1, capSeg = 6): THREE.BufferGeometry {
  const dense: Ring[] = [];
  const n = keys.length;
  const g = (i: number) => keys[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      const a = g(i - 1);
      const b = g(i);
      const c = g(i + 1);
      const d = g(i + 2);
      dense.push({
        y: catmull(a.y, b.y, c.y, d.y, t),
        w: Math.max(0.0005, catmull(a.w, b.w, c.w, d.w, t)),
        d: Math.max(0.0005, catmull(a.d, b.d, c.d, d.d, t)),
        x: catmull(a.x ?? 0, b.x ?? 0, c.x ?? 0, d.x ?? 0, t),
        z: catmull(a.z ?? 0, b.z ?? 0, c.z ?? 0, d.z ?? 0, t),
      });
    }
  }
  const last = keys[n - 1];
  dense.push({ ...last, x: last.x ?? 0, z: last.z ?? 0 });

  const rings: Ring[] = [];
  const f = dense[0];
  const r0 = Math.min(f.w, f.d);
  for (let i = capSeg; i >= 1; i--) {
    const phi = (i / capSeg) * (Math.PI / 2);
    if (i === capSeg) rings.push({ y: f.y - r0 * capK0, w: 0, d: 0, x: f.x, z: f.z });
    else rings.push({ y: f.y - r0 * capK0 * Math.sin(phi), w: f.w * Math.cos(phi), d: f.d * Math.cos(phi), x: f.x, z: f.z });
  }
  for (const r of dense) rings.push(r);
  const l = dense[dense.length - 1];
  const r1 = Math.min(l.w, l.d);
  for (let i = 1; i <= capSeg; i++) {
    const phi = (i / capSeg) * (Math.PI / 2);
    if (i === capSeg) rings.push({ y: l.y + r1 * capK1, w: 0, d: 0, x: l.x, z: l.z });
    else rings.push({ y: l.y + r1 * capK1 * Math.sin(phi), w: l.w * Math.cos(phi), d: l.d * Math.cos(phi), x: l.x, z: l.z });
  }

  const pos: number[] = [];
  const starts: number[] = [];
  const isPole: boolean[] = [];
  for (const R of rings) {
    starts.push(pos.length / 3);
    if (R.w <= 0.0006 && R.d <= 0.0006) {
      pos.push(R.x ?? 0, R.y, R.z ?? 0);
      isPole.push(true);
    } else {
      for (let k = 0; k < radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        pos.push((R.x ?? 0) + Math.cos(a) * R.w, R.y, (R.z ?? 0) + Math.sin(a) * R.d);
      }
      isPole.push(false);
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < radial; k++) {
      const k1 = (k + 1) % radial;
      const a = isPole[r] ? starts[r] : starts[r] + k;
      const b = isPole[r] ? starts[r] : starts[r] + k1;
      const c = isPole[r + 1] ? starts[r + 1] : starts[r + 1] + k;
      const d = isPole[r + 1] ? starts[r + 1] : starts[r + 1] + k1;
      if (!isPole[r]) idx.push(a, c, b);
      if (!isPole[r + 1]) idx.push(b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function limbGeo(L: number, rTop: number, rMid: number, rEnd: number, midAt = 0.3) {
  const g = loft(
    [
      { y: 0, w: rTop, d: rTop },
      { y: L * midAt, w: rMid, d: rMid },
      { y: L * 0.75, w: (rMid + rEnd) * 0.48, d: (rMid + rEnd) * 0.48 },
      { y: L, w: rEnd, d: rEnd },
    ],
    24,
    6,
    0.6,
    0.6,
    5,
  );
  g.rotateX(Math.PI);
  return g;
}

function headGeo(): THREE.BufferGeometry {
  // KEPALA MANUSIA (bukan bola): tengkorak lonjong — lebih tinggi & lebih
  // dalam dari lebar, rahang menyempit ke dagu, dagu maju, wajah agak rata.
  const g = new THREE.SphereGeometry(0.1, 56, 40);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    let z = p.getZ(i);
    // 0 di tengah kepala → 1 di dagu
    const t = Math.min(1, Math.max(0, (-y - 0.005) / 0.095));
    const jaw = 1 - 0.4 * t * t;              // rahang menyempit ke bawah
    x *= jaw;
    z = z * (1 - 0.16 * t * t) + 0.014 * t * t; // dagu maju sedikit
    // proporsi tengkorak: sempit di sisi, tinggi, dalam (z > x)
    x *= 0.8;
    z *= 0.94;
    if (z > 0.02) z *= 0.95; // bidang wajah agak rata
    p.setXYZ(i, x, y * 1.06, z);
  }
  g.computeVertexNormals();
  return g;
}

// ============================================================ helpers
const DOWN = new THREE.Vector3(0, -1, 0);
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

function placeSeg(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, L: number, girth = 1) {
  _d.subVectors(b, a);
  const len = _d.length() || 1e-4;
  _d.multiplyScalar(1 / len);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(DOWN, _d);
  m.scale.set(girth, len / L, girth);
}

function ik2(a: THREE.Vector3, target: THREE.Vector3, L1: number, L2: number, pole: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3) {
  _d.subVectors(target, a);
  let d = _d.length();
  if (d < 1e-5) _d.set(0, -1, 0);
  else _d.multiplyScalar(1 / d);
  d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-3), L1 + L2 - 1e-3);
  const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1);
  _p.normalize();
  mid.copy(a).addScaledVector(_d, cosA * L1).addScaledVector(_p, sinA * L1);
  end.copy(a).addScaledVector(_d, d);
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

// ============================================================ build
export function buildRider(): Rider {
  const group = new THREE.Group();
  const { mat: crystal, u: crystalU } = makeCrystalMaterial();
  const gold = makeGoldMaterial();

  const steel = new THREE.MeshStandardMaterial({
    color: 0xd8e4f5,
    metalness: 0.92,
    roughness: 0.28,
    emissive: new THREE.Color(0x285580),
    emissiveIntensity: 0.038, // pencahayaan pedang skate diperkecil 70% & sejuk
    envMapIntensity: 0.8,
  });
  const goldHilt = new THREE.MeshStandardMaterial({
    color: 0xefca85,
    metalness: 0.92,
    roughness: 0.32,
    emissive: new THREE.Color(0x7a4c14),
    emissiveIntensity: 0.025,
  });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x2a2450, roughness: 0.8 });

  // ---------------------------------------------------------------- sword on its own pivot
  const boardRoot = new THREE.Group();
  group.add(boardRoot);
  const sword = new THREE.Group();
  boardRoot.add(sword);
  const shape = new THREE.Shape();
  shape.moveTo(-0.2, 0);
  shape.lineTo(0.2, 0);
  shape.lineTo(0.135, 2.45);
  shape.lineTo(0, 3.05);
  shape.lineTo(-0.135, 2.45);
  shape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.085,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 3,
    steps: 1,
  });
  bladeGeo.rotateX(Math.PI / 2);
  bladeGeo.translate(0, 0.05, -0.62);
  bladeGeo.computeVertexNormals();
  const blade = new THREE.Mesh(bladeGeo, steel);
  sword.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.2), goldHilt);
  guard.position.set(0, 0.08, -0.6);
  sword.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.085, 0.8, 16), wrap);
  grip.rotation.x = Math.PI / 2;
  grip.position.set(0, 0.06, -1.02);
  sword.add(grip);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), goldHilt);
  pommel.position.set(0, 0.06, -1.46);
  sword.add(pommel);
  // trail / dust anchor at the hilt end (rides with the sword through every flip)
  const tail = new THREE.Object3D();
  tail.position.set(0, 0.03, -1.35);
  sword.add(tail);

  // ---- PAPAN SURF Silver Surfer: elipsoid krom panjang — hidung & ekor
  // membulat, dek pipih, memakai logam yang sama dengan pedang (krom).
  // Anak dari grup pedang → semua flip/pivot/scaling trik tetap bekerja.
  const surf = (() => {
    const g = new THREE.SphereGeometry(1, 40, 26);
    g.scale(0.31, 0.052, 1.72); // panjang 3,44 m, dek pipih ala papan surf
    g.translate(0, 0.045, 0.38);
    const m = new THREE.Mesh(g, steel);
    m.visible = false;
    sword.add(m);
    return m;
  })();

  /** papan seluncur: 0 = papan surf Silver Surfer · 1 = pedang skate */
  function setBoard(type: number) {
    const board = Math.round(type) % 2 === 0;
    surf.visible = board;
    blade.visible = !board;
    guard.visible = !board;
    grip.visible = !board;
    pommel.visible = !board;
  }

  // ---------------------------------------------------------------- body parts
  const body = new THREE.Group();
  group.add(body);
  const mk = (geo: THREE.BufferGeometry, m: THREE.Material = crystal) => {
    const mesh = new THREE.Mesh(geo, m);
    body.add(mesh);
    return mesh;
  };

  const pelvis = mk(
    loft(
      [
        { y: -0.1, w: 0.1, d: 0.075 },
        { y: -0.05, w: 0.14, d: 0.1 },
        { y: 0.02, w: 0.148, d: 0.102 },
        { y: 0.09, w: 0.122, d: 0.088 }, // nyambung ke pinggang torso
      ],
      32,
      6,
      0.6,
      0.6,
    ),
  );
  const torso = mk(
    loft(
      [
        { y: 0.0, w: 0.118, d: 0.085 },
        { y: 0.08, w: 0.116, d: 0.086, z: 0.004 },
        { y: 0.18, w: 0.14, d: 0.1, z: 0.012 },
        { y: 0.28, w: 0.162, d: 0.11, z: 0.018 },  // dada lebar
        { y: 0.36, w: 0.172, d: 0.102, z: 0.012 },
        { y: 0.43, w: 0.15, d: 0.088, z: 0.006 },  // bahu
        { y: 0.475, w: 0.1, d: 0.072, z: 0.0 },    // trapezius
        { y: 0.52, w: 0.06, d: 0.056 },            // pangkal leher (menyatu)
      ],
      36,
      6,
      0.5,
      0.4,
    ),
  );
  const neckMesh = mk(
    loft(
      [
        { y: 0, w: 0.06, d: 0.056 },   // pangkal lebar — melebur ke trapezius
        { y: 0.06, w: 0.043, d: 0.042 },
        { y: 0.12, w: 0.052, d: 0.05 }, // melebar lagi mendekati tengkorak
      ],
      24,
      5,
      0.4,
      0.4,
    ),
  );
  const head = mk(headGeo());

  // ---- KERAH SLAYER: band kain MELINGKAR di pangkal leher + lipatan silang
  // (syal yang benar-benar dililit, bukan pita menempel satu titik).
  // Anak neckMesh → mengikuti lekuk leher, swing superman & skala pup.
  const scarfCollar = (() => {
    const g = new THREE.Group();
    // band utama: silinder kain sedikit melebar ke bawah (kain menyusup)
    const bandGeo = new THREE.CylinderGeometry(0.063, 0.07, 0.078, 26, 1, true);
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0xc42f3a,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x1c0604),
      emissiveIntensity: 0.35,
    });
    const band = new THREE.Mesh(bandGeo, bandMat);
    // lipatan silang kedua: torus tipis dimiringkan → kesan dililit dua kali
    const wrapGeo = new THREE.TorusGeometry(0.0655, 0.0145, 12, 30);
    const wrap = new THREE.Mesh(wrapGeo, bandMat);
    wrap.rotation.set(Math.PI / 2, 0, 0.42);
    wrap.position.y = 0.004;
    // trim emas di bibir atas & bawah band (muncul saat mode sulaman journey)
    const trimGeo = new THREE.TorusGeometry(0.0675, 0.0038, 8, 34);
    const trimT = new THREE.Mesh(trimGeo, gold);
    const trimB = new THREE.Mesh(trimGeo, gold);
    trimT.rotation.x = Math.PI / 2;
    trimB.rotation.x = Math.PI / 2;
    trimT.position.y = 0.039;
    trimB.position.y = -0.039;
    trimT.visible = false;
    trimB.visible = false;
    g.add(band, wrap, trimT, trimB);
    g.position.y = 0.05;
    g.visible = false;
    neckMesh.add(g);
    return { group: g, bandMat, trimT, trimB };
  })();

  /** tampilan kerah mengikuti mode slayer: 0 kain warna · 1 sulaman journey · 2 ethereal */
  function setScarfLook(kind: number, hex: string) {
    const on = kind >= 0;
    scarfCollar.group.visible = on;
    if (!on) return;
    const c = new THREE.Color(hex);
    if (kind === 2) {
      // ethereal: kain cahaya — emissive kuat dari warna inti palette
      scarfCollar.bandMat.color.copy(c).multiplyScalar(0.35);
      scarfCollar.bandMat.emissive.copy(c);
      scarfCollar.bandMat.emissiveIntensity = 1.1;
      scarfCollar.trimT.visible = false;
      scarfCollar.trimB.visible = false;
    } else {
      // kain biasa / sulaman journey: warna kain, trim emas hanya di sulaman
      scarfCollar.bandMat.color.copy(kind === 1 ? new THREE.Color(0x9c2313) : c);
      scarfCollar.bandMat.emissive.set(kind === 1 ? 0x2a0a06 : 0x1c0604);
      scarfCollar.bandMat.emissiveIntensity = 0.35;
      scarfCollar.trimT.visible = kind === 1;
      scarfCollar.trimB.visible = kind === 1;
    }
  }
  const deltGeo = new THREE.SphereGeometry(0.056, 28, 20);
  deltGeo.scale(1.02, 0.86, 0.98); // otot bahu pipih, menyatu dada
  const deltL = mk(deltGeo);
  const deltR = mk(deltGeo);

  const UA = 0.28;
  const FA = 0.25;
  const uaGeo = limbGeo(UA, 0.046, 0.05, 0.034, 0.35);
  const faGeo = limbGeo(FA, 0.036, 0.04, 0.025, 0.28);
  const handG = loft(
    [
      { y: 0, w: 0.026, d: 0.016 },
      { y: 0.05, w: 0.036, d: 0.016 },
      { y: 0.1, w: 0.034, d: 0.013 },
      { y: 0.15, w: 0.02, d: 0.009 },
    ],
    20,
    5,
    0.6,
    1,
  );
  handG.rotateX(Math.PI);
  const upperL = mk(uaGeo);
  const upperR = mk(uaGeo);
  const foreL = mk(faGeo);
  const foreR = mk(faGeo);
  const handL = mk(handG);
  const handR = mk(handG);
  const jointGeo = new THREE.SphereGeometry(1, 20, 14);
  const elbowL = mk(jointGeo);
  const elbowR = mk(jointGeo);

  const TH = 0.45;
  const SH = 0.44;
  const thighGeo = limbGeo(TH, 0.074, 0.072, 0.048, 0.28);
  const shinGeo = limbGeo(SH, 0.05, 0.053, 0.03, 0.24);
  const thighL = mk(thighGeo);
  const thighR = mk(thighGeo);
  const shinL = mk(shinGeo);
  const shinR = mk(shinGeo);
  const kneeL = mk(jointGeo);
  const kneeR = mk(jointGeo);
  const footGeo = loft(
    [
      { y: -0.06, w: 0.03, d: 0.03 },
      { y: 0.0, w: 0.036, d: 0.036 },
      { y: 0.08, w: 0.042, d: 0.026, z: -0.012 },
      { y: 0.15, w: 0.04, d: 0.018, z: -0.02 },
    ],
    22,
    5,
    0.9,
    1,
  );
  footGeo.rotateX(Math.PI / 2);
  footGeo.translate(0, -0.055, 0);
  const footL = mk(footGeo);
  const footR = mk(footGeo);

  // scarf anchor rides with the body (incl. superman)
  const neck = new THREE.Object3D();
  body.add(neck);

  // ---- SLUGPUP (Rain World): mata hitam bulat + telinga bulat + jangkar
  // ekor panjang tebal di pangkal punggung. Semuanya di-blend lewat a.pup.
  const eyes = new THREE.Group();
  {
    const eyeGeo = new THREE.SphereGeometry(0.021, 14, 10);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x10131b,
      roughness: 0.22,
      metalness: 0.15,
      emissive: new THREE.Color(0x05070c),
    });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.04, 0.012, 0.088);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.04, 0.012, 0.088);
    eyes.add(eyeL, eyeR);
    eyes.visible = false;
    head.add(eyes); // anak kepala → ikut semua gerakan kepala
  }
  const ears = new THREE.Group();
  {
    const earGeo = new THREE.SphereGeometry(0.034, 16, 12);
    const earL = new THREE.Mesh(earGeo, crystal);
    earL.position.set(-0.07, 0.07, -0.012);
    earL.scale.set(0.85, 1, 0.6);
    const earR = new THREE.Mesh(earGeo, crystal);
    earR.position.set(0.07, 0.07, -0.012);
    earR.scale.set(0.85, 1, 0.6);
    ears.add(earL, earR);
    ears.visible = false;
    head.add(ears);
  }
  // moncong kecil khas ferret — tumbuh bersama morph pup
  const snout = (() => {
    const g = new THREE.SphereGeometry(0.03, 14, 10);
    g.scale(0.9, 0.62, 1.25);
    const m = new THREE.Mesh(g, crystal);
    m.position.set(0, -0.014, 0.093);
    m.visible = false;
    head.add(m);
    return m;
  })();
  const tailBone = new THREE.Object3D();
  tailBone.position.set(0, -0.05, -0.11);
  body.add(tailBone);

  group.scale.setScalar(1.18);

  // ============================================================ animation state
  const STANCE = 1.0;
  let crouch = 0.35;
  let crouchV = 0;
  let armBlend = 0;
  let tuck = 0;
  let twist = 0;
  let curPose: string | null = null;
  let poseW = 0;

  const qBody = new THREE.Quaternion();
  const qSpine = new THREE.Quaternion();
  const qChest = new THREE.Quaternion();
  const qHead = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const qFlip = new THREE.Quaternion();
  const qBoard = new THREE.Quaternion();
  const qBodyG = new THREE.Quaternion();
  const qBodyInv = new THREE.Quaternion();
  const qFootRest = new THREE.Quaternion();
  const qFootAtt = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const eT = new THREE.Euler(0, 0, 0, 'XYZ');
  const v = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const boardPos = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const pelvisP = new THREE.Vector3();
  const chestP = new THREE.Vector3();
  const neckBase = new THREE.Vector3();
  const neckTop = new THREE.Vector3();
  const headC = new THREE.Vector3();
  const gripStand = new THREE.Vector3();
  const gripGroup = new THREE.Vector3();
  const hipJ = [new THREE.Vector3(), new THREE.Vector3()];
  const shoJ = [new THREE.Vector3(), new THREE.Vector3()];
  const footLocal = [new THREE.Vector3(), new THREE.Vector3()];
  const mid = new THREE.Vector3();
  const end = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const alt = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const dir2 = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const tmpQ = new THREE.Quaternion();

  function lb(q: THREE.Quaternion, base: THREE.Vector3, x: number, y: number, z: number, out: THREE.Vector3) {
    return out.set(x, y, z).applyQuaternion(q).add(base);
  }

  function animate(dt: number, a: RiderAnim) {
    crystalU.uTime.value = a.time;
    const k = (r: number) => 1 - Math.exp(-dt * r);

    // ---------------- proportions
    // SLUGPUP MORPH (a.pup 0→1) — proporsi FERRET PUTIH (bukan panda!):
    // badan PANJANG ramping seperti tabung, kepala KECIL dengan moncong,
    // leher pendek, mata hitam kecil, kaki pendek ramping, telinga kecil
    // di sisi — siluet mustelid khas slugcat Rain World.
    const pup = clamp(a.pup, 0, 1);
    const s = clamp(a.sword, 0.35, 1.3);
    const h = clamp(a.height, 0.4, 1.15);
    const legK = h * (1 - 0.34 * pup); // kaki pendek khas mustelid
    const torsoK = (0.4 + 0.6 * h) * (1 + 0.52 * pup); // tulang belakang PANJANG
    const armK = (0.32 + 0.68 * h) * (1 - 0.16 * pup);
    const neckK = (0.45 + 0.55 * h) * (1 - 0.5 * pup); // leher pendek tapi ada
    const girth = 1 + (1 - h) * 0.45;
    const headK = clamp(a.head, 0.6, 2.4) * (1 - 0.44 * pup); // kepala KECIL
    const armGirth = girth * (1 - 0.4 * pup); // langan jarum
    const legGirth = girth * (1 - 0.12 * pup); // kaki ramping (bukan paha beruang)
    const footK = girth * (1 - 0.34 * pup); // telapak mungil
    const UAk = UA * armK;
    const FAk = FA * armK;
    const reach = (UAk + FAk) * 0.94;

    // wajah ferret: mata mengecil, telinga mengecil ke sisi, moncong tumbuh
    eyes.visible = pup > 0.02;
    eyes.scale.setScalar(1 - 0.34 * pup);
    ears.visible = pup > 0.02;
    ears.scale.set(1 - 0.4 * pup, 1 - 0.22 * pup, 1 - 0.4 * pup);
    snout.visible = pup > 0.02;
    snout.scale.setScalar(pup);

    // ---------------- grab pose crossfade (one style at a time)
    const want = a.pose && POSES[a.pose] ? a.pose : null;
    if (want !== curPose && poseW < 0.03) curPose = want;
    const poseTarget = curPose && curPose === want ? clamp(a.poseW, 0, 1) : 0;
    poseW += (poseTarget - poseW) * k(9);
    const P = curPose ? POSES[curPose] : null;
    const w = P ? poseW : 0;

    // ---------------- sword transform (grab tilt × board flip) around its pivot
    const pivY = 0.06 * s;
    const pivZ = 0.05;
    pivot.set(0, pivY, pivZ);
    eT.set((P ? P.rot[0] : 0) * w, (P ? P.rot[1] : 0) * w, (P ? P.rot[2] : 0) * w);
    qTilt.setFromEuler(eT);
    e.set(a.boardPitch, a.boardYaw, a.boardRoll);
    qFlip.setFromEuler(e);
    qBoard.copy(qTilt).multiply(qFlip);
    pv.set(0, 0, a.boardPivotZ);
    boardPos.copy(pivot);
    if (P) boardPos.add(v.set(P.off[0] * w, P.off[1] * w, P.off[2] * w));
    boardPos.add(pv).sub(v.copy(pv).applyQuaternion(qBoard));
    boardRoot.position.copy(boardPos);
    boardRoot.quaternion.copy(qBoard);
    sword.scale.setScalar(s);
    sword.position.set(0, -pivY, -0.5 + 0.6 * s - pivZ);

    const FOOT_Y = 0.085 * s + 0.095 * footK;
    footLocal[0].set(0.02, FOOT_Y - pivY, 0.05 + 0.41 * legK - pivZ);
    footLocal[1].set(-0.02, FOOT_Y - pivY, 0.05 - 0.41 * legK - pivZ);

    const toGroup = (local: THREE.Vector3, out: THREE.Vector3) => out.copy(local).applyQuaternion(qBoard).add(boardPos);
    const boardPt = (name: BoardPt, out: THREE.Vector3) => {
      const ey = 0.02 * s;
      switch (name) {
        case 'toe':
          return out.set(0.18 * s, ey, 0.0);
        case 'heel':
          return out.set(-0.18 * s, ey, 0.0);
        case 'toeF':
          return out.set(0.16 * s, ey, 0.28);
        case 'heelB':
          return out.set(-0.18 * s, ey, -0.3);
        case 'nose':
          return out.set(0, 0.03 * s, 1.55 * s - 0.35);
        default:
          return out.set(0, 0.03 * s, -0.55);
      }
    };

    // ---------------- crouch spring & blends
    const flipAmt = Math.min(1, Math.abs(a.flipVel) / 4.5);
    let crouchT = a.air ? 0.25 + flipAmt * 0.55 + a.feetLift * 0.35 : 0.3 + a.speed * 0.25 + (a.boost ? 0.12 : 0);
    if (P) crouchT += (P.crouch - crouchT) * w;
    crouchV += ((crouchT - crouch) * 90 - crouchV * 13) * dt;
    crouch += crouchV * dt;
    crouch = clamp(crouch, 0, 1.05);
    armBlend += ((a.air ? 1 : 0) - armBlend) * k(4);
    tuck += (flipAmt - tuck) * k(7);
    twist += (a.steer * 0.3 - twist) * k(5);
    const breathe = Math.sin(a.time * 1.6) * 0.012 * torsoK;

    // ---------------- core (body space)
    const stanceYaw = P && P.yaw !== null ? STANCE + (P.yaw - STANCE) * w : STANCE;
    const legLen = (TH + SH) * legK;
    const hipY = FOOT_Y + legLen * (0.94 - crouch * 0.3) + breathe + a.feetLift * 0.06;
    pelvisP.set(0, hipY, 0.05);
    e.set(0, stanceYaw, 0);
    qBody.setFromEuler(e);
    const bend = 0.12 + crouch * 0.42 + tuck * 0.35 + (P ? P.bend * w : 0);
    const tw = twist + (P ? P.twist * w : 0);
    e.set(bend, stanceYaw + tw * 0.4, -a.steer * 0.08);
    qSpine.setFromEuler(e);
    e.set(bend * 0.4, tw * 0.6, 0);
    tmpQ.setFromEuler(e);
    qChest.copy(qSpine).multiply(tmpQ);

    pelvis.position.copy(pelvisP);
    pelvis.quaternion.copy(qBody);
    // badan ferret: ramping dari depan, DALAM dari samping (tabung panjang)
    pelvis.scale.set(1 - 0.1 * pup, 0.5 + 0.5 * torsoK, 1 + 0.14 * pup);
    lb(qBody, pelvisP, 0, 0.07 * torsoK, 0, v);
    torso.position.copy(v);
    torso.quaternion.copy(qSpine);
    torso.scale.set(1 - 0.1 * pup, torsoK, 1 + 0.26 * pup);
    lb(qSpine, v, 0, 0.36 * torsoK, 0.012, chestP);
    lb(qSpine, v, 0, 0.47 * torsoK, 0, neckBase);


    // ---------------- neck & head
    neckMesh.position.copy(neckBase);
    e.set(-bend * 0.5 + 0.08, 0, 0);
    tmpQ.setFromEuler(e);
    neckMesh.quaternion.copy(qChest).multiply(tmpQ);
    neckMesh.scale.set(1, neckK, 1);
    lb(neckMesh.quaternion, neckBase, 0, 0.1 * neckK, 0, neckTop);
    e.set(
      -0.08 - bend * 0.25 + (a.air ? -0.15 : 0) + (P ? P.head * w : 0),
      Math.sin(a.time * 0.5) * 0.05 + a.steer * 0.2 + (stanceYaw - STANCE) * 0.6,
      -a.steer * 0.1,
    );
    qHead.setFromEuler(e);
    lb(qHead, neckTop, 0, 0.088 * headK, 0.006 * headK, headC);
    head.position.copy(headC);
    head.quaternion.copy(qHead);
    head.scale.setScalar(headK);
    neck.position.copy(neckBase);

    // ---------------- SUPERMAN: the whole body swings out behind the sword
    const sw = P && P.superman ? w : 0;
    if (sw > 0.001) {
      gripStand.copy(neckBase).add(v.set(0, reach * 0.92, 0.07));
      toGroup(v.set(0, 0.04 * s, 0.12), gripGroup);
      qBodyG.setFromAxisAngle(xAxis, sw * 1.45);
      v.copy(gripStand).lerp(gripGroup, sw);
      body.position.copy(v).sub(v2.copy(gripStand).applyQuaternion(qBodyG));
      body.quaternion.copy(qBodyG);
    } else {
      body.position.set(0, 0, 0);
      body.quaternion.identity();
    }
    qBodyInv.copy(body.quaternion).invert();
    const toBody = (p: THREE.Vector3) => p.sub(body.position).applyQuaternion(qBodyInv);

    // ---------------- legs: feet ride the sword, pop off for flips, hang in superman
    for (let si = 0; si < 2; si++) {
      const side = si === 0 ? -1 : 1; // -1 = front foot
      lb(qBody, pelvisP, side * 0.092, -0.03 * torsoK, 0, hipJ[si]);
      // attached to the (possibly flipping / grabbed) sword
      toBody(toGroup(footLocal[si], tgt));
      // pose grab akurat: lutut ditarik ke dada sesuai gaya grab
      const poseLift = P && P.legLift ? P.legLift[si] * w : 0;
      const lift = clamp(a.feetLift + poseLift, 0, 1);
      if (lift > 0.001) {
        // popped off: tucked up above where the sword rests
        toBody(alt.copy(footLocal[si]).add(pivot));
        alt.y += (0.26 + 0.3 * lift) * legK * (0.7 + 0.3 * lift);
        alt.z += side < 0 ? 0.04 : -0.06;
        alt.x += 0.05;
        tgt.lerp(alt, lift);
      }
      if (sw > 0.001) {
        alt.copy(hipJ[si]).add(v.set(side * 0.07, -legLen * 0.97, -0.03));
        tgt.lerp(alt, sw);
      }
      pole.set(Math.sin(stanceYaw), 0.15, Math.cos(stanceYaw)).addScaledVector(v.set(0, 0, side < 0 ? 1 : -1), 0.45);
      ik2(hipJ[si], tgt, TH * legK, SH * legK, pole, mid, end);
      const th = si === 0 ? thighL : thighR;
      const sh = si === 0 ? shinL : shinR;
      const kn = si === 0 ? kneeL : kneeR;
      const ft = si === 0 ? footL : footR;
      placeSeg(th, hipJ[si], mid, TH, legGirth);
      placeSeg(sh, mid, end, SH, legGirth);
      kn.position.copy(mid);
      kn.scale.setScalar(0.05 * legGirth);
      // feet follow the sword's orientation while attached
      qFootRest.setFromAxisAngle(yAxis, STANCE + (side < 0 ? -0.25 : 0.25));
      qFootAtt.copy(qBodyInv).multiply(qBoard).multiply(qFootRest);
      ft.quaternion.copy(qFootAtt).slerp(qFootRest, Math.max(lift, sw));
      if (lift > 0.001) ft.quaternion.multiply(tmpQ.setFromAxisAngle(xAxis, lift * 0.5));
      // gaya di udara: jari kaki menunjuk (plantar flex) — pose skater yang rapi
      ft.quaternion.multiply(tmpQ.setFromAxisAngle(xAxis, armBlend * 0.34));
      ft.position.copy(end);
      ft.scale.setScalar(footK);
    }

    // ---------------- arms: balance → wings → tuck → grab pose
    for (let si = 0; si < 2; si++) {
      const side = si === 0 ? -1 : 1; // -1 = front arm
      lb(qChest, chestP, side * 0.175, 0.06 * torsoK, -0.005, shoJ[si]);
      const delt = si === 0 ? deltL : deltR;
      delt.position.copy(shoJ[si]);
      delt.quaternion.copy(qChest);
      delt.scale.setScalar(armGirth);

      const carve = a.steer * side;
      if (side < 0) dir.set(-0.62, -0.42 + carve * 0.18, 0.62);
      else dir.set(0.66, -0.5 - carve * 0.15, -0.48);
      dir.x += Math.sin(a.time * 1.3 + si) * 0.05;
      dir.y += Math.sin(a.time * 1.1 + si * 2) * 0.05;
      // wings in the air; during a board flip the arms rise for balance
      dir2.set(side * 0.95, 0.28 + Math.sin(a.time * 2 + si) * 0.06 + a.feetLift * 0.35, side < 0 ? 0.18 : -0.1);
      dir.lerp(dir2, armBlend * (1 - tuck));
      dir2.set(side * 0.25, -0.8, 0.55);
      dir.lerp(dir2, tuck);
      dir.normalize().applyQuaternion(qChest);
      tgt.copy(shoJ[si]).addScaledVector(dir, reach);

      let grabbing = false;
      if (P && w > 0.001) {
        const hand = side < 0 ? P.front : P.back;
        if ('at' in hand) {
          toBody(toGroup(boardPt(hand.at, v2), alt));
          grabbing = true;
        } else if ('d' in hand) {
          dir2.set(hand.d[0], hand.d[1], hand.d[2]).normalize().applyQuaternion(qChest);
          alt.copy(shoJ[si]).addScaledVector(dir2, reach);
        } else {
          alt.copy(gripStand).add(v2.set(side * 0.13, 0, 0));
          grabbing = true;
        }
        // antisipasi + overshoot kecil: jangkauan sedikit melewati target saat
        // mencengkeram lalu settle — terasa "menggapai", bukan teleport
        const reachK = clamp(w + Math.sin(Math.min(1, w) * Math.PI) * 0.1, 0, 1.05);
        tgt.lerp(alt, reachK);
      }

      // siku mengarah keluar-bawah relatif terhadap arah jangkauan (bukan vektor
      // mati) → tidak ada siku "patah" saat tangan turun ke papan
      pole.set(side * 0.85, -0.45, -0.35).applyQuaternion(qChest);
      dir2.subVectors(tgt, shoJ[si]).normalize();
      pole.addScaledVector(dir2, -pole.dot(dir2));
      if (pole.lengthSq() < 1e-6) pole.set(side, -0.5, 0);
      pole.normalize();
      ik2(shoJ[si], tgt, UAk, FAk, pole, mid, end);
      const ua = si === 0 ? upperL : upperR;
      const fa = si === 0 ? foreL : foreR;
      const eb = si === 0 ? elbowL : elbowR;
      const hd = si === 0 ? handL : handR;
      placeSeg(ua, shoJ[si], mid, UA, armGirth);
      placeSeg(fa, mid, end, FA, armGirth);
      eb.position.copy(mid);
      eb.scale.setScalar(0.035 * armGirth);
      _q.copy(fa.quaternion);
      hd.position.copy(end);
      // pergelangan mengikuti lengan bawah; saat mencengkeram papan, telapak
      // menghadap target (fleksi pergelangan) — grip terlihat meyakinkan
      hd.quaternion.copy(_q).multiply(tmpQ.setFromAxisAngle(xAxis, grabbing ? 0.55 : 0.25));
      if (grabbing) hd.quaternion.multiply(tmpQ.setFromAxisAngle(yAxis, -side * 0.28));
      hd.scale.setScalar(armGirth);
    }
  }

  function impulse(strength: number) {
    crouchV += 3.2 * strength;
  }

  function setEnv(tex: THREE.Texture) {
    const first = !crystal.envMap;
    crystal.envMap = tex;
    gold.envMap = tex;
    steel.envMap = tex;
    if (first) {
      crystal.needsUpdate = true;
      gold.needsUpdate = true;
      steel.needsUpdate = true;
    }
  }

  animate(0.016, {
    time: 0,
    speed: 0.3,
    steer: 0,
    air: false,
    flipVel: 0,
    spinVel: 0,
    boost: false,
    height: 1,
    head: 1,
    sword: 0.68,
    pup: 0,
    boardRoll: 0,
    boardYaw: 0,
    boardPitch: 0,
    boardPivotZ: 0,
    feetLift: 0,
    pose: null,
    poseW: 0,
  });

  return { group, tail, neck, tailBone, blade, crystal, crystalU, gold, steel, goldHilt, animate, impulse, setEnv, setBoard, setScarfLook };
}
