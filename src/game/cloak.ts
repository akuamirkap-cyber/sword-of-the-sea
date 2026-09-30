import * as THREE from 'three';
import { rideHeight as duneHeight } from './noise';

// ---------------------------------------------------------------------------
// JUBAH ala JOURNEY — kain verlet (cloth) terpasang di sepanjang bahu, jatuh
// melimpah ke belakang rider, tertiup angin sembunyi dengan model fisika
// sama seperti slayer. Shader-nya melukis jubah traveller khas Journey:
//
//   • dasar merah tua → oker hangat ke arah kaki, dengan tenunan halus
//   • trim krem di tepi samping & pinggir bawah (hem)
//   • SULAMAN EMAS MENYALA: baris diamond, diamond kecil & chevron yang
//     berdenyut — makin penuh energi flow, makin gemilang (kaya scarf power)
//   • fresnel emas tipis di lipatan kain + dua sisi terangin lembut
//   • kabut manual agar jubah melebur ke atmosfer saat kamera menjauh
// ---------------------------------------------------------------------------

const COLS = 11; // kolom di sepanjang bahu
const ROWS = 15; // baris ke bawah (panjang jubah)

const VERT = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uGlow;    // kekuatan sulaman emas (0..2, ikut energi flow)
  uniform vec3 uFogCol;
  uniform float uFogAmt;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vDepth;

  float h21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 uv = vUv; // x: kiri->kanan, y: bahu->hem
    vec3 gold = vec3(1.0, 0.78, 0.32);

    // ---- dasar kain: merah tua di bahu -> oker hangat ke hem
    vec3 base = mix(vec3(0.60, 0.12, 0.08), vec3(0.82, 0.33, 0.13), smoothstep(0.22, 0.95, uv.y));
    base += (h21(floor(uv * vec2(170.0, 230.0))) - 0.5) * 0.05; // tenunan halus

    // ---- trim krem: tepi samping & hem bawah
    float edge = smoothstep(0.045, 0.02, min(uv.x, 1.0 - uv.x));
    float hem = smoothstep(0.905, 0.93, uv.y);
    base = mix(base, vec3(0.93, 0.86, 0.72), clamp(max(edge, hem), 0.0, 1.0));

    // ---- SULAMAN EMAS: diamond besar / diamond kecil / chevron
    float sym = 0.0;
    {
      float cell = uv.x * 9.0;
      float ci = floor(cell);
      float cu = fract(cell) - 0.5;
      float d1 = abs(cu) + abs(uv.y - 0.70) * 3.3;                 // baris diamond
      sym = max(sym, smoothstep(0.17, 0.10, d1) * step(mod(ci, 2.0), 0.5));
      float d2 = abs(cu) + abs(uv.y - 0.785) * 4.3;                // diamond kecil selang-seling
      sym = max(sym, smoothstep(0.12, 0.065, d2) * step(0.5, mod(ci, 2.0)));
      float ch = abs(cu + (uv.y - 0.845) * 2.3);                   // chevron di atas hem
      sym = max(sym, smoothstep(0.105, 0.055, ch));
    }
    float pulse = 0.72 + 0.28 * sin(uTime * 1.35 + uv.y * 9.0 + uv.x * 3.1);
    vec3 emb = gold * sym * uGlow * pulse * 1.9;

    // ---- garis emas pemisah hem
    float hemline = smoothstep(0.005, 0.0, abs(uv.y - 0.90));

    // ---- pencahayaan dua sisi + fresnel emas di lipatan
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    float diff = 0.52 + 0.48 * max(dot(N, normalize(vec3(0.35, 0.85, 0.4))), 0.0);
    float fres = pow(1.0 - abs(dot(N, normalize(vV))), 2.2);

    vec3 col = base * diff + gold * fres * 0.30 + emb + gold * hemline * uGlow * 0.85;

    // ---- kabut manual (melebur ke atmosfer saat jauh)
    float fog = 1.0 - exp(-vDepth * vDepth * uFogAmt * 0.00002);
    col = mix(col, uFogCol, clamp(fog, 0.0, 0.72));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Cloak {
  mesh: THREE.Mesh;
  private u = {
    uTime: { value: 0 },
    uGlow: { value: 1 },
    uFogCol: { value: new THREE.Color('#ffd9bd') },
    uFogAmt: { value: 0.3 },
  };
  private p: THREE.Vector3[][] = [];
  private prev: THREE.Vector3[][] = [];
  private pins: THREE.Vector3[] = [];
  private posA: THREE.BufferAttribute;
  private geo: THREE.BufferGeometry;
  private init = false;
  private length = 0.92;

  private neckPos = new THREE.Vector3();
  private neckQ = new THREE.Quaternion();
  private back = new THREE.Vector3();
  private right = new THREE.Vector3();
  private wind = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private d = new THREE.Vector3();

  constructor() {
    for (let c = 0; c < COLS; c++) {
      const col: THREE.Vector3[] = [];
      const colPrev: THREE.Vector3[] = [];
      for (let r = 0; r < ROWS; r++) {
        col.push(new THREE.Vector3());
        colPrev.push(new THREE.Vector3());
      }
      this.p.push(col);
      this.prev.push(colPrev);
      this.pins.push(new THREE.Vector3());
    }
    const verts = COLS * ROWS;
    const pos = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const idx: number[] = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const i = c * ROWS + r;
        uv[i * 2] = c / (COLS - 1);
        uv[i * 2 + 1] = r / (ROWS - 1);
      }
    }
    for (let c = 0; c < COLS - 1; c++) {
      for (let r = 0; r < ROWS - 1; r++) {
        const a = c * ROWS + r;
        const b = (c + 1) * ROWS + r;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.posA = new THREE.BufferAttribute(pos, 3);
    this.posA.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posA);
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** pasang baris teratas ke bahu (mengikuti leher rider, termasuk superman) */
  private placePins(neck: THREE.Object3D) {
    neck.getWorldPosition(this.neckPos);
    neck.getWorldQuaternion(this.neckQ);
    for (let c = 0; c < COLS; c++) {
      const x = (c / (COLS - 1) - 0.5) * 0.42; // rentang bahu
      this.pins[c].set(x, 0.02, -0.05).applyQuaternion(this.neckQ).add(this.neckPos);
    }
    this.back.set(0, 0, -1).applyQuaternion(this.neckQ);
    this.right.set(1, 0, 0).applyQuaternion(this.neckQ);
  }

  update(
    dt: number,
    neck: THREE.Object3D,
    vel: THREE.Vector3,
    time: number,
    o: { glow: number },
    fogCol: THREE.Color,
    fogAmt: number,
  ) {
    const segX = 0.42 / (COLS - 1);
    const segY = this.length / (ROWS - 1);
    this.placePins(neck);
    if (!this.init || this.p[0][0].distanceTo(this.pins[0]) > 20) {
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          this.p[c][r]
            .copy(this.pins[c])
            .addScaledVector(this.back, -0.02 * r)
            .add(this.tmp.set(0, -segY * r, 0));
          this.prev[c][r].copy(this.p[c][r]);
        }
      }
      this.init = true;
    }

    // angin sembunyi = kebalikan kecepatan + hembusan ambient pelan dari depan
    this.wind.copy(vel).multiplyScalar(-1);
    this.wind.addScaledVector(this.back, 2.2 + Math.sin(time * 0.5) * 0.9);
    const damp = Math.pow(0.93, dt * 60);
    const dt2 = dt * dt;

    for (let c = 0; c < COLS; c++) {
      for (let r = 1; r < ROWS; r++) {
        const p = this.p[c][r];
        const pr = this.prev[c][r];
        this.tmp.subVectors(p, pr).multiplyScalar(damp);
        pr.copy(p);
        // gravitasi + hembusan (hem menangkap lebih banyak angin)
        const f = r / (ROWS - 1);
        const k = 0.05 + 0.16 * f;
        p.add(this.tmp);
        p.addScaledVector(this.wind, k * dt2);
        p.y -= 9.8 * dt2;
        // flutter lembut menyilang
        const fl = Math.sin(time * 4.1 - c * 0.7 + r * 0.4) * 3.2 * f * dt2;
        p.addScaledVector(this.right, fl);
        p.y += Math.cos(time * 3.3 + c * 0.5 - r * 0.3) * 2.4 * f * dt2;
      }
    }

    // constraint (3 iterasi): vertikal dulu, lalu horizontal, pin baris bahu
    for (let iter = 0; iter < 3; iter++) {
      for (let c = 0; c < COLS; c++) this.p[c][0].copy(this.pins[c]);
      for (let c = 0; c < COLS; c++) {
        for (let r = 1; r < ROWS; r++) {
          this.d.subVectors(this.p[c][r], this.p[c][r - 1]);
          const len = this.d.length() || 1e-4;
          this.p[c][r].copy(this.p[c][r - 1]).addScaledVector(this.d, segY / len);
        }
      }
      for (let r = 1; r < ROWS; r++) {
        for (let c = 0; c < COLS - 1; c++) {
          this.d.subVectors(this.p[c + 1][r], this.p[c][r]);
          const len = this.d.length() || 1e-4;
          const corr = (len - segX) / len * 0.5;
          this.p[c][r].addScaledVector(this.d, corr);
          this.p[c + 1][r].addScaledVector(this.d, -corr);
        }
      }
    }

    // lantai pasir
    for (let c = 0; c < COLS; c++) {
      for (let r = 1; r < ROWS; r++) {
        const gy = duneHeight(this.p[c][r].x, this.p[c][r].z) + 0.15;
        if (this.p[c][r].y < gy) this.p[c][r].y = gy;
      }
    }

    // tulis ke GPU + normal halus
    const arr = this.posA.array as Float32Array;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const i = (c * ROWS + r) * 3;
        arr[i] = this.p[c][r].x;
        arr[i + 1] = this.p[c][r].y;
        arr[i + 2] = this.p[c][r].z;
      }
    }
    this.posA.needsUpdate = true;
    this.geo.computeVertexNormals();

    this.u.uTime.value = time;
    this.u.uGlow.value = o.glow;
    this.u.uFogCol.value.copy(fogCol);
    this.u.uFogAmt.value = fogAmt;
  }
}
