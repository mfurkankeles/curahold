// The 3D Office: a desk-top scale model of the company in Curahold's light.
// Orthographic camera at a fixed pitch, 90° turns, glides on a damped spring.
// Built for the budget in out/research-design.md §2.2:
//  - frames only when something changed (camera, data, walkers, typing at a
//    30 fps cap); nothing at all while the tab is hidden;
//  - static geometry merged into a handful of meshes with vertex colours and
//    one Lambert material; desks, chairs, screens, plants instanced;
//  - shadows baked once (the shadow map is rendered on build, never per frame);
//    figures stand on instanced blob shadows;
//  - labels are HTML over the canvas (crisp, translatable, free to redraw),
//    moved only when the camera or a walker moves;
//  - pixel ratio follows the measured frame time; a quality ladder below it.
// Colours are the app's design tokens, read from CSS (day = light theme, night = dark).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Figure, loadFigures, type FigureKit, type Pose } from './figures';
import {
  BOUNDS,
  COFFEE_BAR,
  COFFEE_SPOTS,
  CORRIDOR,
  DESK,
  GLASS_H,
  MEETING_CHAIRS,
  MEETING_TABLE,
  PLANTS,
  ROOMS,
  SEAT_H,
  WALL_H,
  assignDesks,
  roomAt,
  roomById,
  route,
  walled,
  type DeskSpot,
  type Point,
  type Room,
  type Spot,
} from './layout';

export type Activity = 'working' | 'meeting' | 'waiting-approval' | 'queued' | 'idle' | 'paused' | 'dormant';
export interface SceneSeat {
  seat: string;
  team: string;
  activity: Activity;
  /** Which of the twelve bodies (stable per seat). */
  body: number;
}
export interface Anchor {
  key: string;
  kind: 'room' | 'seat';
  el: HTMLElement;
}
export interface SceneStats {
  fps: number;
  p95: number;
  calls: number;
  triangles: number;
  ratio: number;
  mode: 'still' | 'ambient' | 'active';
  quality: number;
}
export interface SceneOptions {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  figuresUrl: string;
  reducedMotion: boolean;
  phone: boolean;
  onPick: (seat: string | null) => void;
  onRoom: (room: string) => void;
  onHover?: (seat: string | null) => void;
  onStats?: (s: SceneStats) => void;
}

const PITCH = (33 * Math.PI) / 180;
const DIST = 80;
const MIN_VIEW = 3.6;
const TWO_PI = Math.PI * 2;

// ------------------------------------------------------------ colours from tokens
function tokens() {
  const css = getComputedStyle(document.documentElement);
  const cache = new Map<string, THREE.Color>();
  return (name: string, fallback = '--ink-3') => {
    let c = cache.get(name);
    if (!c) {
      const v = css.getPropertyValue(name).trim() || css.getPropertyValue(fallback).trim();
      c = new THREE.Color();
      try {
        c.setStyle(v || 'gray');
      } catch {
        c.set(0x888888);
      }
      cache.set(name, c);
    }
    return c.clone();
  };
}
type Tok = ReturnType<typeof tokens>;
const washOf = (accent: string) => accent.replace('--chart-', '--color-') + '-wash';

// ------------------------------------------------------------ geometry helpers
class Builder {
  parts: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, color: THREE.Color, x = 0, y = 0, z = 0, ry = 0) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    g = g.rotateY(ry).translate(x, y, z);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }
  box(w: number, h: number, d: number, color: THREE.Color, x: number, y: number, z: number, ry = 0, r = 0.03) {
    const geo = r > 0 && Math.min(w, h, d) > 2 * r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    return this.add(geo, color, x, y + h / 2, z, ry);
  }
  merge() {
    const g = mergeGeometries(this.parts);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
}

// ------------------------------------------------------------ the camera on a spring
class Glide {
  v = 0;
  constructor(
    public x: number,
    public goal: number,
  ) {}
  /** Critically damped (smooth-damp), ~0.6 s to settle at this smooth time. */
  step(dt: number, smooth = 0.16) {
    const o = 2 / smooth;
    const k = o * dt;
    const e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const ch = this.x - this.goal;
    const t = (this.v + o * ch) * dt;
    this.v = (this.v - o * t) * e;
    this.x = this.goal + (ch + t) * e;
    if (Math.abs(this.x - this.goal) < 1e-4 && Math.abs(this.v) < 1e-3) {
      this.x = this.goal;
      this.v = 0;
      return false;
    }
    return true;
  }
  cut() {
    this.x = this.goal;
    this.v = 0;
  }
}

type Placed = Anchor & { w: number; h: number; room?: Room };
interface Walker {
  path: Point[];
  i: number;
  /** What happens on arrival. */
  then: () => void;
}
interface Person {
  seat: SceneSeat;
  fig: Figure;
  desk: DeskSpot;
  /** Where it is now: 'desk' | 'meeting:<i>' | 'coffee:<i>' | 'walking'. */
  at: string;
  walk: Walker | null;
  /** When an idle person may next go for a coffee (seconds since start). */
  nextBreak: number;
  homeBy?: number;
}

export class OfficeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  private hemi = new THREE.HemisphereLight();
  private key = new THREE.DirectionalLight();
  private world = new THREE.Group();
  private walls: { mesh: THREE.Mesh; normal: THREE.Vector2 }[] = [];
  private screens: THREE.InstancedMesh | null = null;
  private chairs: THREE.InstancedMesh | null = null;
  private blobs: THREE.InstancedMesh | null = null;
  private glass: THREE.Mesh | null = null;
  private ring = new THREE.Mesh();
  private hoverRing = new THREE.Mesh();
  private kit: FigureKit | null = null;
  private people = new Map<string, Person>();
  private deskOf = new Map<string, DeskSpot>();
  private screenIndex = new Map<string, number>();
  private meetingSeats: string[] = [];
  private anchors: Placed[] = [];
  private tok: Tok = tokens();
  private night = false;
  // camera state
  private tx = new Glide(0, 0);
  private tz = new Glide(0, 0);
  private view = new Glide(30, 30);
  private yaw = new Glide(Math.PI / 4, Math.PI / 4);
  private insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private size = { w: 1, h: 1 };
  // loop state
  private raf = 0;
  private dirty = true;
  private camDirty = true;
  private lastRender = 0;
  private lastTick = 0;
  private t0 = performance.now();
  private disposed = false;
  private interacting = 0;
  private frames: number[] = [];
  private rendered: number[] = [];
  private ratio: number;
  private maxRatio: number;
  private minRatio: number;
  private slowSince = 0;
  private fastSince = 0;
  private quality = 0;
  private selected: string | null = null;
  private hovered: string | null = null;
  private lit = new Set<string>();
  private zoomTag = '';
  private ro: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private tmp = new THREE.Vector3();
  private portraits = new Map<string, string>();

  constructor(private o: SceneOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: !o.phone, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.maxRatio = Math.min(window.devicePixelRatio || 1, o.phone ? 1.5 : 2);
    this.minRatio = o.phone ? 0.75 : 1;
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.info.autoReset = true;
    this.scene.add(this.hemi, this.key, this.key.target, this.world);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 22;
    sc.bottom = -22;
    sc.near = 1;
    sc.far = 120;
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 3;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(o.canvas.parentElement ?? o.canvas);
    o.canvas.addEventListener('webglcontextlost', this.lost);
    o.canvas.addEventListener('webglcontextrestored', this.restored);
    document.addEventListener('visibilitychange', this.visible);
    this.bindInput();
    this.resize();
  }

  /** Load the people and build the room. Throws if WebGL or the file fails (the page shows the plan instead). */
  async init(): Promise<void> {
    this.kit = await loadFigures(this.o.figuresUrl, this.renderer);
    this.build();
    this.fitAll(true);
  }

  // ================================================================ building
  private build() {
    this.tok = tokens();
    this.night = document.documentElement.dataset.theme === 'dark';
    const t = this.tok;
    for (const c of [...this.world.children]) {
      this.world.remove(c);
      c.traverse((x) => {
        const m = x as THREE.Mesh;
        if (m.geometry && !(x as THREE.SkinnedMesh).isSkinnedMesh) m.geometry.dispose();
      });
    }
    this.walls = [];
    this.renderer.setClearColor(this.night ? t('--well-deep') : t('--sunk'));
    this.hemi.color = this.night ? t('--well-3') : t('--brand-soft');
    this.hemi.groundColor = this.night ? t('--well') : t('--calm');
    this.hemi.intensity = this.night ? 3.2 : 2.3;
    this.key.color = this.night ? t('--well-ink') : new THREE.Color(1, 0.95, 0.88);
    this.key.intensity = this.night ? 1.5 : 2.1;
    this.key.position.set(-16, 30, 20);

    const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = (g: THREE.BufferGeometry, mat: THREE.Material = lambert, shadow = true) => {
      const m = new THREE.Mesh(g, mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      this.world.add(m);
      return m;
    };

    // ---- the floor plate, floors and rugs, low walls, furniture that never moves
    const s = new Builder();
    const W = BOUNDS.x1 - BOUNDS.x0;
    const D = BOUNDS.z1 - BOUNDS.z0;
    s.box(W + 0.6, 0.5, D + 0.6, this.night ? t('--well-2') : t('--line-strong'), 0, -0.5, 0, 0, 0.18);
    s.add(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), this.night ? t('--well-3') : t('--paper'), 0, 0.001, 0);
    s.add(new THREE.PlaneGeometry(W, CORRIDOR.z1 - CORRIDOR.z0).rotateX(-Math.PI / 2), this.night ? t('--well-2') : t('--sunk'), 0, 0.004, 0);
    for (const r of ROOMS) {
      const rug = r.kind === 'reception' ? t('--surface-2') : t(washOf(r.accent), '--brand-wash').lerp(t(r.accent), this.night ? 0.22 : 0.1);
      const inset = r.kind === 'team' || r.kind === 'meeting' || r.kind === 'lounge' ? 0.5 : 0.2;
      s.add(new THREE.PlaneGeometry(r.x1 - r.x0 - 2 * inset, r.z1 - r.z0 - 2 * inset).rotateX(-Math.PI / 2), rug, (r.x0 + r.x1) / 2, 0.006, (r.z0 + r.z1) / 2);
    }
    // Low skirting all round (the near sides stay low so the camera looks in).
    const skirt = t('--surface');
    s.box(W, 0.3, 0.16, skirt, 0, 0, BOUNDS.z0 + 0.08, 0, 0.02).box(W, 0.3, 0.16, skirt, 0, 0, BOUNDS.z1 - 0.08, 0, 0.02);
    s.box(0.16, 0.3, D, skirt, BOUNDS.x0 + 0.08, 0, 0, 0, 0.02).box(0.16, 0.3, D, skirt, BOUNDS.x1 - 0.08, 0, 0, 0, 0.02);

    // Glass partitions: a solid base, the glass, a top rail; door gaps on the corridor side.
    const glass = new Builder();
    const rail = this.night ? t('--line-strong') : t('--line');
    const seg = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.05) return;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const ry = Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0 : Math.PI / 2;
      s.box(len, 0.1, 0.1, rail, cx, 0, cz, ry, 0.02).box(len, 0.05, 0.08, rail, cx, GLASS_H, cz, ry, 0.02);
      glass.add(new THREE.BoxGeometry(len, GLASS_H - 0.1, 0.03), t('--brand-soft'), cx, 0.1 + (GLASS_H - 0.1) / 2, cz, ry);
      s.box(0.07, GLASS_H, 0.09, rail, x0, 0, z0, 0, 0).box(0.07, GLASS_H, 0.09, rail, x1, 0, z1, 0, 0);
    };
    const done = new Set<string>();
    const wall = (x0: number, z0: number, x1: number, z1: number, door?: number) => {
      const k = [x0, z0, x1, z1].map((v) => v.toFixed(2)).join(',');
      if (done.has(k)) return;
      done.add(k);
      if (door === undefined) return seg(x0, z0, x1, z1);
      seg(x0, z0, door - 0.85, z1);
      seg(door + 0.85, z0, x1, z1);
    };
    for (const r of ROOMS) {
      if (!walled(r)) continue;
      wall(r.x0, r.doorZ, r.x1, r.doorZ, r.doorX);
      if (r.x0 > BOUNDS.x0) wall(r.x0, r.z0, r.x0, r.z1);
      if (r.x1 < BOUNDS.x1) wall(r.x1, r.z0, r.x1, r.z1);
    }

    // Reception: the logo wall, a desk, a sofa by the door.
    const rec = roomById('reception')!;
    const rx = (rec.x0 + rec.x1) / 2;
    s.box(6.4, 2.5, 0.32, t('--well'), rx, 0, rec.z0 + 1.4, 0, 0.05);
    s.box(3.2, 1.02, 0.8, t('--surface'), rx, 0, rec.z0 + 4.4, 0, 0.06).box(3.3, 0.05, 0.9, t('--brand'), rx, 1.02, rec.z0 + 4.4, 0, 0.02);
    const sofa = (x: number, z: number, ry: number, w = 2.2) => {
      const c = t('--well-2');
      s.box(w, 0.42, 0.9, c, x, 0, z, ry, 0.08);
      const bx = Math.sin(ry) * -0.38;
      const bz = Math.cos(ry) * -0.38;
      s.box(w, 0.5, 0.18, c, x + bx, 0.38, z + bz, ry, 0.07);
      s.box(w - 0.2, 0.1, 0.62, t('--calm'), x - bx * 0.1, 0.42, z - bz * 0.1, ry, 0.04);
    };
    sofa(rec.x0 + 2.2, rec.z1 - 2.6, Math.PI / 2, 2.4);
    s.box(1.0, 0.36, 1.0, t('--surface'), rec.x0 + 3.6, 0, rec.z1 - 2.6, 0, 0.12);

    // Advisory lounge: sofas round a low table, a shelf on the wall.
    const adv = roomById('advisory')!;
    const ax = (adv.x0 + adv.x1) / 2;
    const az = (adv.z0 + adv.z1) / 2 + 0.6;
    sofa(ax, az - 1.6, 0, 3);
    sofa(ax, az + 1.6, Math.PI, 3);
    sofa(ax - 2.4, az, Math.PI / 2, 2);
    s.box(2.2, 0.4, 1.1, t('--surface'), ax, 0, az, 0, 0.08);
    s.box(4.2, 1.8, 0.4, t('--surface'), ax, 0, adv.z1 - 0.5, 0, 0.04).box(4.0, 0.04, 0.36, t('--line-strong'), ax, 0.9, adv.z1 - 0.5, 0, 0);

    // Meeting room: a long table; its chairs are instanced with the rest.
    const mt = MEETING_TABLE;
    s.box(mt.w, 0.06, mt.d, t('--surface'), mt.x, 0.72, mt.z, 0, 0.03);
    s.box(0.18, 0.72, mt.d * 0.6, t('--well-2'), mt.x - mt.w / 3, 0, mt.z, 0, 0.03).box(
      0.18,
      0.72,
      mt.d * 0.6,
      t('--well-2'),
      mt.x + mt.w / 3,
      0,
      mt.z,
      0,
      0.03,
    );
    const meet = roomById('meeting')!;
    s.box(0.08, 1.3, 2.4, t('--well'), meet.x0 + 0.3, 0.6, mt.z, 0, 0.02).box(0.3, 0.6, 0.3, t('--line-strong'), meet.x0 + 0.3, 0, mt.z, 0, 0.04);

    // Coffee corner: a counter and a machine.
    const cb = COFFEE_BAR;
    s.box(cb.w, 0.98, cb.d, t('--well-2'), cb.x, 0, cb.z, 0, 0.05).box(cb.w + 0.08, 0.05, cb.d + 0.08, t('--surface'), cb.x, 0.98, cb.z, 0, 0.02);
    s.box(0.36, 0.44, 0.34, t('--ink-3'), cb.x, 1.03, cb.z - 0.9, 0, 0.04);
    s.box(0.2, 0.12, 0.2, t('--surface'), cb.x, 1.03, cb.z + 0.6, 0, 0.03);
    mesh(s.merge());
    const gm = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: this.night ? 0.16 : 0.2, depthWrite: false });
    this.glass = mesh(glass.merge(), gm, false);
    this.glass.receiveShadow = false;
    this.glass.renderOrder = 2;

    // Tall walls on the far sides only (which sides are far depends on the turn).
    const tall = t('--surface');
    const sides: [number, number, number, number, number, number][] = [
      [0, BOUNDS.z0 + 0.1, W, 0.2, 0, -1],
      [0, BOUNDS.z1 - 0.1, W, 0.2, 0, 1],
      [BOUNDS.x0 + 0.1, 0, 0.2, D, -1, 0],
      [BOUNDS.x1 - 0.1, 0, 0.2, D, 1, 0],
    ];
    for (const [x, z, w, d, nx, nz] of sides) {
      const b = new Builder().box(w, WALL_H, d, tall, x, 0, z, 0, 0.06);
      b.box(nx ? 0.04 : w, 0.12, nz ? 0.04 : d, t('--line-strong'), x - nx * 0.11, 0, z - nz * 0.11, 0, 0);
      this.walls.push({ mesh: mesh(b.merge()), normal: new THREE.Vector2(nx, nz) });
    }

    // The logo on its wall: drawn once into a texture (the mark + the word).
    const logo = this.logoTexture();
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshBasicMaterial({ map: logo, transparent: true }));
    lm.position.set(rx, 1.5, rec.z0 + 1.4 + 0.17);
    this.world.add(lm);

    // ---- desks (with monitor and keyboard), chairs, screens, plants: instanced
    const desks = [...this.deskOf.values()];
    const dg = new Builder()
      .box(DESK.w, 0.045, DESK.d, t('--surface'), 0, DESK.h - 0.045, 0, 0, 0.02)
      .box(0.04, DESK.h - 0.045, DESK.d - 0.08, t('--line-strong'), -DESK.w / 2 + 0.06, 0, 0, 0, 0)
      .box(0.04, DESK.h - 0.045, DESK.d - 0.08, t('--line-strong'), DESK.w / 2 - 0.06, 0, 0, 0, 0)
      .box(0.44, 0.02, 0.14, t('--ink-3'), 0, DESK.h, -0.13, 0, 0)
      .box(0.05, 0.14, 0.05, t('--well-2'), 0, DESK.h, 0.22, 0, 0)
      .box(0.2, 0.012, 0.14, t('--well-2'), 0, DESK.h, 0.22, 0, 0)
      .box(0.62, 0.36, 0.035, t('--well'), 0, DESK.h + 0.12, 0.24, 0, 0.012)
      .merge();
    const deskMesh = new THREE.InstancedMesh(dg, lambert, Math.max(1, desks.length));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const at = (x: number, y: number, z: number, ry: number) => m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ry), one);
    desks.forEach((d, i) => deskMesh.setMatrixAt(i, at(d.desk.x, 0, d.desk.z, d.desk.face)));
    deskMesh.count = desks.length;
    deskMesh.castShadow = deskMesh.receiveShadow = true;
    this.world.add(deskMesh);

    const sg = new THREE.PlaneGeometry(0.56, 0.3).rotateY(Math.PI);
    this.screens = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial(), Math.max(1, desks.length));
    this.screenIndex.clear();
    [...this.deskOf.entries()].forEach(([seat, d], i) => {
      this.screenIndex.set(seat, i);
      const lz = 0.24 - 0.02;
      this.screens!.setMatrixAt(i, at(d.desk.x + Math.sin(d.desk.face) * lz, DESK.h + 0.3, d.desk.z + Math.cos(d.desk.face) * lz, d.desk.face));
      this.screens!.setColorAt(i, t('--well-3'));
    });
    this.screens.count = desks.length;
    this.world.add(this.screens);

    const white = new THREE.Color(1, 1, 1);
    const grey = new THREE.Color(0.42, 0.42, 0.46);
    const cg = new Builder()
      .box(0.5, 0.08, 0.48, white, 0, SEAT_H - 0.08, 0, 0, 0.035)
      .box(0.48, 0.52, 0.07, white, 0, SEAT_H + 0.06, -0.24, 0, 0.03)
      .add(new THREE.CylinderGeometry(0.035, 0.035, SEAT_H - 0.12, 6), grey, 0, (SEAT_H - 0.12) / 2 + 0.05, 0)
      .add(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 10), grey, 0, 0.05, 0)
      .merge();
    const chairSpots: { s: Spot; c: THREE.Color }[] = [
      ...desks.map((d) => ({ s: d as Spot, c: this.night ? t('--well-3') : t('--well-2') })),
      ...MEETING_CHAIRS.map((s) => ({ s, c: t('--brand') })),
    ];
    this.chairs = new THREE.InstancedMesh(cg, lambert, chairSpots.length);
    chairSpots.forEach(({ s, c }, i) => {
      this.chairs!.setMatrixAt(i, at(s.x - Math.sin(s.face) * 0.08, 0, s.z - Math.cos(s.face) * 0.08, s.face));
      this.chairs!.setColorAt(i, c);
    });
    this.chairs.castShadow = this.chairs.receiveShadow = true;
    this.world.add(this.chairs);

    const pg = new Builder()
      .add(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 10), t('--surface'), 0, 0.21, 0)
      .add(new THREE.IcosahedronGeometry(0.34, 1), t('--done'), 0, 0.74, 0)
      .add(new THREE.IcosahedronGeometry(0.22, 1), t('--chart-leaf'), 0.1, 0.98, 0.05)
      .merge();
    const plants = new THREE.InstancedMesh(pg, lambert, PLANTS.length);
    PLANTS.forEach((p, i) => plants.setMatrixAt(i, at(p.x, 0, p.z, i)));
    plants.castShadow = true;
    this.world.add(plants);

    // ---- blob shadows and the two rings (selected, hovered)
    const blob = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: this.blobTexture(),
        transparent: true,
        depthWrite: false,
        color: this.night ? 0x000000 : 0x1a1640,
        opacity: this.night ? 0.6 : 0.32,
      }),
      Math.max(1, this.people.size),
    );
    blob.frustumCulled = false;
    blob.renderOrder = 1;
    this.blobs = blob;
    this.world.add(blob);
    const ringGeo = new THREE.RingGeometry(0.42, 0.52, 40).rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: t('--brand'), transparent: true, opacity: 0.95, depthWrite: false }));
    this.hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: t('--calm'), transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.visible = this.hoverRing.visible = false;
    this.world.add(this.ring, this.hoverRing);

    for (const p of this.people.values()) this.world.add(p.fig.root);
    this.paintScreens();
    this.placeBlobs();
    this.updateWalls();
    this.renderer.shadowMap.needsUpdate = true;
    this.requestRender(true);
  }

  private logoTexture() {
    const t = this.tok;
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 256;
    const g = c.getContext('2d')!;
    const css = getComputedStyle(document.documentElement);
    const font = css.getPropertyValue('--font-display').trim() || 'sans-serif';
    const ink = '#' + t('--well-ink').getHexString(THREE.SRGBColorSpace);
    const dot = '#' + t('--chart-sea').getHexString(THREE.SRGBColorSpace);
    // The mark: an open C holding a dot (site/brand.ts), drawn at 32 → 176 px.
    g.save();
    g.translate(40, 40);
    g.scale(5.5, 5.5);
    g.strokeStyle = ink;
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(16, 16, 7.5, -0.92, 0.92, true);
    g.stroke();
    g.fillStyle = dot;
    g.beginPath();
    g.arc(16.5, 16, 2.6, 0, TWO_PI);
    g.fill();
    g.restore();
    g.fillStyle = ink;
    g.font = `700 132px ${font}`;
    g.textBaseline = 'middle';
    g.fillText('Curahold', 250, 136);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  private blobTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /** Theme changed (day ↔ night): rebuild with the new tokens, re-bake shadows. */
  retheme() {
    if (this.kit) this.build();
  }

  // ================================================================ people
  setSeats(seats: SceneSeat[], meeting: string[]) {
    if (!this.kit) return;
    const t = performance.now() / 1000 - this.t0 / 1000;
    const before = [...this.deskOf.keys()].join();
    this.deskOf = assignDesks(seats);
    this.meetingSeats = meeting.filter((s) => this.deskOf.has(s)).slice(0, MEETING_CHAIRS.length);
    const keep = new Set(seats.map((s) => s.seat));
    for (const [k, p] of this.people) if (!keep.has(k)) (p.fig.dispose(), this.people.delete(k));
    for (const s of seats) {
      const desk = this.deskOf.get(s.seat);
      if (!desk) continue;
      let p = this.people.get(s.seat);
      if (!p) {
        const fig = new Figure(this.kit, s.body, hash(s.seat));
        p = { seat: s, fig, desk, at: 'desk', walk: null, nextBreak: t + 8 + (hash(s.seat) % 40) };
        this.people.set(s.seat, p);
        this.world.add(fig.root);
        // Someone new to the page is simply where they are (nobody walks in on every load).
        p.at = this.wanted(p);
        this.placeAt(p, this.spotOf(p.at, p).spot);
      }
      p.seat = s;
      p.desk = desk;
    }
    if (before !== [...this.deskOf.keys()].join()) this.build();
    for (const p of this.people.values()) this.settle(p, true);
    this.paintScreens();
    this.requestRender(true);
  }

  private wanted(p: Person): string {
    const i = this.meetingSeats.indexOf(p.seat.seat);
    if (i >= 0) return `meeting:${i}`;
    if (p.at.startsWith('coffee') && (p.seat.activity === 'idle' || p.seat.activity === 'queued')) return p.at;
    return 'desk';
  }
  private spotOf(at: string, p: Person): { spot: Spot | DeskSpot; room: string } {
    if (at.startsWith('meeting:')) return { spot: MEETING_CHAIRS[Number(at.slice(8))], room: 'meeting' };
    if (at.startsWith('coffee:')) return { spot: COFFEE_SPOTS[Number(at.slice(7))], room: 'commons' };
    return { spot: p.desk, room: p.desk.room };
  }

  /** Put a person where their data says (walking there, unless motion is reduced or `cut`). */
  private settle(p: Person, fromData = false) {
    if (p.walk) return;
    const want = this.wanted(p);
    if (want !== p.at) {
      const to = this.spotOf(want, p);
      const from = this.spotOf(p.at, p);
      if (this.o.reducedMotion || fromData === false || this.quality >= 3) {
        p.at = want;
        this.placeAt(p, to.spot);
      } else {
        this.walkTo(p, route(from.spot, from.room, to.spot, to.room), () => {
          p.at = want;
          this.placeAt(p, to.spot);
          this.applyPose(p);
        });
        return;
      }
    }
    this.applyPose(p);
  }

  private applyPose(p: Person) {
    const a = p.seat.activity;
    const sitting = p.at === 'desk' || p.at.startsWith('meeting');
    let pose: Pose = 'sit';
    if (p.walk) pose = 'walk';
    else if (!sitting) pose = this.o.reducedMotion ? 'sit' : 'stand';
    else if (a === 'dormant' || a === 'paused') pose = 'sleep';
    else if (p.at.startsWith('meeting')) pose = p.seat.seat === 'note-taker' && !this.o.reducedMotion ? 'type' : this.o.reducedMotion ? 'sit' : 'talk';
    else if (a === 'working' && !this.o.reducedMotion) pose = 'type';
    if (pose === 'stand' && this.o.reducedMotion) pose = 'sit';
    p.fig.setPose(pose);
    p.fig.setDim(a === 'dormant');
    if (pose === 'stand' || pose === 'walk') p.fig.root.position.y = 0;
    else p.fig.root.position.y = SEAT_H + 0.03 - (this.kit?.hip ?? 0.28);
  }

  private placeAt(p: Person, s: Spot) {
    p.fig.root.position.set(s.x, 0, s.z);
    p.fig.root.rotation.y = s.face;
  }

  private walkTo(p: Person, path: Point[], then: () => void) {
    p.at = 'walking';
    p.walk = { path, i: 1, then };
    p.fig.setPose('walk');
    p.fig.root.position.y = 0;
  }

  private paintScreens() {
    if (!this.screens) return;
    const t = this.tok;
    const col: Record<Activity, THREE.Color> = {
      working: t('--brand'),
      meeting: t('--calm'),
      'waiting-approval': t('--today'),
      queued: t('--calm'),
      idle: this.night ? t('--well-3') : t('--line-strong'),
      paused: t('--well-2'),
      dormant: t('--well'),
    };
    for (const [seat, i] of this.screenIndex) {
      const p = this.people.get(seat);
      this.screens.setColorAt(i, p ? col[p.seat.activity] : t('--well'));
    }
    if (this.screens.instanceColor) this.screens.instanceColor.needsUpdate = true;
  }

  private placeBlobs() {
    if (!this.blobs) return;
    const m = new THREE.Matrix4();
    let i = 0;
    for (const p of this.people.values()) {
      const pos = p.fig.root.position;
      const sitting = pos.y > 0.01;
      m.makeTranslation(pos.x, 0.012, pos.z);
      if (sitting) m.scale(new THREE.Vector3(1.15, 1, 1.15));
      this.blobs.setMatrixAt(i++, m);
    }
    this.blobs.count = i;
    this.blobs.instanceMatrix.needsUpdate = true;
    for (const [r, seat] of [
      [this.ring, this.selected],
      [this.hoverRing, this.hovered !== this.selected ? this.hovered : null],
    ] as const) {
      const p = seat ? this.people.get(seat) : null;
      r.visible = !!p;
      if (p) r.position.set(p.fig.root.position.x, 0.02, p.fig.root.position.z);
    }
  }

  /** Ambient life: walkers advance; idle people sometimes fetch a coffee. */
  private tickPeople(t: number, dt: number) {
    let moved = false;
    const walking = [...this.people.values()].filter((p) => p.walk).length;
    let starts = walking;
    for (const p of this.people.values()) {
      if (p.walk) {
        moved = true;
        let step = 1.45 * dt;
        const pos = p.fig.root.position;
        while (step > 0 && p.walk) {
          const goal = p.walk.path[p.walk.i];
          const dx = goal.x - pos.x;
          const dz = goal.z - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist <= step) {
            pos.x = goal.x;
            pos.z = goal.z;
            step -= dist;
            p.walk.i++;
            if (p.walk.i >= p.walk.path.length) {
              const w = p.walk;
              p.walk = null;
              w.then();
            }
          } else {
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            const face = Math.atan2(dx, dz);
            let d = face - p.fig.root.rotation.y;
            d = ((((d + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
            p.fig.root.rotation.y += d * Math.min(1, dt * 10);
            step = 0;
          }
        }
      } else if (!this.o.reducedMotion && this.quality < 2) {
        const a = p.seat.activity;
        if (p.at === 'desk' && (a === 'idle' || a === 'queued') && t > p.nextBreak && starts < 2) {
          const free = COFFEE_SPOTS.findIndex(
            (_, i) => ![...this.people.values()].some((o) => o.at === `coffee:${i}` || o.walk?.path.at(-1)?.x === COFFEE_SPOTS[i].x),
          );
          p.nextBreak = t + 40 + (hash(p.seat.seat + t.toFixed(0)) % 60);
          if (free >= 0) {
            starts++;
            const to = COFFEE_SPOTS[free];
            this.walkTo(p, route(p.desk, p.desk.room, to, 'commons'), () => {
              p.at = `coffee:${free}`;
              this.placeAt(p, to);
              p.homeBy = t + 9 + (hash(p.seat.seat) % 7);
              this.applyPose(p);
            });
          }
        } else if (p.at.startsWith('coffee') && t > (p.homeBy ?? 0) && starts < 3) {
          starts++;
          const from = this.spotOf(p.at, p).spot;
          this.walkTo(p, route(from, 'commons', p.desk, p.desk.room), () => {
            p.at = 'desk';
            this.placeAt(p, p.desk);
            this.applyPose(p);
          });
        }
      }
      if (p.fig.animated) p.fig.tick(t, dt);
    }
    if (moved || this.selected || this.hovered) this.placeBlobs();
    return moved;
  }

  // ================================================================ camera
  private basis() {
    const yaw = this.yaw.x;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    return { right, fwd };
  }
  private usable() {
    return { w: Math.max(1, this.size.w - this.insets.left - this.insets.right), h: Math.max(1, this.size.h - this.insets.top - this.insets.bottom) };
  }
  private applyCamera() {
    const yaw = this.yaw.x;
    const { w, h } = this.usable();
    const viewH = this.view.x;
    const wpp = viewH / h;
    const halfH = (this.size.h * wpp) / 2;
    const halfW = (this.size.w * wpp) / 2;
    // Insets: the focus sits in the middle of the free area, not the canvas.
    const offX = ((this.insets.right - this.insets.left) / 2) * wpp;
    const offY = ((this.insets.bottom - this.insets.top) / 2) * wpp;
    void w;
    const c = this.camera;
    c.left = -halfW + offX;
    c.right = halfW + offX;
    c.top = halfH + offY;
    c.bottom = -halfH + offY;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(yaw) * Math.cos(PITCH));
    const target = new THREE.Vector3(this.tx.x, 0.6, this.tz.x);
    c.position.copy(target).addScaledVector(dir, DIST);
    c.lookAt(target);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    const tag = viewH > 21 ? 'office' : viewH > 8.5 ? 'room' : 'seat';
    if (tag !== this.zoomTag) {
      this.zoomTag = tag;
      this.o.overlay.dataset.zoom = tag;
    }
  }

  /** The view height and centre that fit a box of the floor (with its walls) in the free area. */
  private fitBox(x0: number, z0: number, x1: number, z1: number, yaw = this.yaw.goal, margin = 1.1) {
    const { w, h } = this.usable();
    const aspect = w / h;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(yaw) * Math.cos(PITCH));
    const up = new THREE.Vector3().crossVectors(dir, right).normalize().negate();
    let rMin = Infinity,
      rMax = -Infinity,
      uMin = Infinity,
      uMax = -Infinity;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (const x of [x0, x1])
      for (const z of [z0, z1])
        for (const y of [0, WALL_H]) {
          const v = new THREE.Vector3(x - cx, y - 0.6, z - cz);
          const r = v.dot(right);
          const u = v.dot(up);
          rMin = Math.min(rMin, r);
          rMax = Math.max(rMax, r);
          uMin = Math.min(uMin, u);
          uMax = Math.max(uMax, u);
        }
    const viewH = Math.max(uMax - uMin, (rMax - rMin) / aspect) * margin;
    // Shift the centre so the box's projection is centred (screen-up on the floor is fwd / sin(pitch)).
    const rc = (rMin + rMax) / 2;
    const uc = (uMin + uMax) / 2;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const centre = new THREE.Vector3(cx, 0, cz).addScaledVector(right, rc).addScaledVector(fwd, uc / Math.sin(PITCH));
    return { viewH, x: centre.x, z: centre.z };
  }

  private goTo(x: number, z: number, viewH: number, cut = false) {
    this.tx.goal = x;
    this.tz.goal = z;
    this.view.goal = Math.max(MIN_VIEW, Math.min(this.maxView(), viewH));
    if (cut || this.o.reducedMotion) [this.tx, this.tz, this.view, this.yaw].forEach((g) => g.cut());
    this.camDirty = true;
    this.requestRender();
  }
  private maxView() {
    return this.fitBox(BOUNDS.x0, BOUNDS.z0, BOUNDS.x1, BOUNDS.z1, this.yaw.goal, 1.35).viewH;
  }

  fitAll(cut = false) {
    // A phone shows the middle of the floor (the room chips reach the rest); a desktop the whole of it.
    const f = this.o.phone
      ? this.fitBox(-10, BOUNDS.z0 + 4, 10, BOUNDS.z1 - 4, this.yaw.goal, 1)
      : this.fitBox(BOUNDS.x0, BOUNDS.z0, BOUNDS.x1, BOUNDS.z1, this.yaw.goal, 1.04);
    this.goTo(f.x, f.z, f.viewH, cut);
  }
  focusRoom(id: string) {
    const r = roomById(id);
    if (!r) return;
    const f = this.fitBox(r.x0, r.z0, r.x1, r.z1, this.yaw.goal, 1.12);
    this.goTo(f.x, f.z, f.viewH);
  }
  focusSeat(seat: string) {
    const p = this.people.get(seat);
    if (!p) return;
    const pos = p.walk ? p.walk.path.at(-1)! : p.fig.root.position;
    this.goTo(pos.x, pos.z, this.o.phone ? 7 : 8.2);
  }
  zoom(factor: number) {
    this.goTo(this.tx.goal, this.tz.goal, this.view.goal * factor);
  }
  rotate(steps: number) {
    // Keep looking at the same spot while the office turns under it.
    this.yaw.goal += (steps * Math.PI) / 2;
    if (this.o.reducedMotion) this.yaw.cut();
    this.camDirty = true;
    this.requestRender();
  }
  pan(dx: number, dz: number) {
    this.tx.goal = clamp(this.tx.goal + dx, BOUNDS.x0, BOUNDS.x1);
    this.tz.goal = clamp(this.tz.goal + dz, BOUNDS.z0, BOUNDS.z1);
    if (this.o.reducedMotion) (this.tx.cut(), this.tz.cut());
    this.requestRender();
  }
  /** Arrow keys: pan by a fifth of the view, in screen directions. */
  panScreen(sx: number, sy: number) {
    const { right, fwd } = this.basis();
    const d = this.view.goal / 5;
    this.pan(right.x * sx * d + (fwd.x * -sy * d) / Math.sin(PITCH), right.z * sx * d + (fwd.z * -sy * d) / Math.sin(PITCH));
  }
  setInsets(i: Partial<typeof this.insets>) {
    Object.assign(this.insets, i);
    this.camDirty = true;
    this.requestRender();
  }

  select(seat: string | null) {
    this.selected = seat;
    this.placeBlobs();
    this.refreshFlags();
    this.requestRender();
  }
  /** Search hits and the like: their tags show at every zoom. */
  highlight(seats: string[]) {
    this.lit = new Set(seats);
    this.refreshFlags();
    this.camDirty = true;
    this.requestRender();
  }

  private updateWalls() {
    const yaw = this.yaw.x;
    const cam = new THREE.Vector2(Math.sin(yaw), Math.cos(yaw));
    for (const w of this.walls) w.mesh.visible = w.normal.dot(cam) < -0.2;
  }

  // ================================================================ labels
  /** The page gives its label elements once per data change; positions are ours. */
  setAnchors(list: Anchor[]) {
    this.anchors = list.map((a) => ({ ...a, w: a.el.offsetWidth || 80, h: a.el.offsetHeight || 22, room: a.kind === 'room' ? roomById(a.key) : undefined }));
    this.refreshFlags();
    this.camDirty = true;
    this.requestRender();
  }
  private refreshFlags() {
    for (const a of this.anchors) {
      if (a.kind !== 'seat') continue;
      a.el.toggleAttribute('data-selected', a.key === this.selected);
      a.el.toggleAttribute('data-lit', this.lit.has(a.key) || a.key === this.hovered);
    }
  }
  private placeLabels(all: boolean) {
    const { w: W, h: H } = this.size;
    const v = this.tmp;
    const yaw = this.yaw.x;
    const cam = new THREE.Vector2(Math.sin(yaw), Math.cos(yaw));
    const taken: [number, number, number, number][] = [];
    const seatRows: { a: Placed; x: number; y: number }[] = [];
    for (const a of this.anchors) {
      if (a.kind === 'room' && !all) continue;
      if (a.kind === 'room' && a.room) {
        // The sign floats over the far part of the room, so it never covers the people.
        const r = a.room;
        const cx = (r.x0 + r.x1) / 2;
        const cz = (r.z0 + r.z1) / 2;
        const back = Math.abs(cam.y) >= Math.abs(cam.x);
        const sx = back ? 0 : -Math.sign(cam.x) * (r.x1 - r.x0) * 0.5;
        const sz = back ? -Math.sign(cam.y) * (r.z1 - r.z0) * 0.5 : 0;
        v.set(cx + sx, GLASS_H + 0.9, cz + sz);
      } else {
        const p = this.people.get(a.key);
        if (!p) {
          a.el.dataset.off = '';
          continue;
        }
        const pos = p.fig.root.position;
        const sitting = pos.y > 0.01;
        v.set(pos.x, (sitting ? pos.y : 0) + (this.kit?.height ?? 1.3) * (sitting ? 0.82 : 1) + 0.1, pos.z);
      }
      v.project(this.camera);
      const x = ((v.x + 1) / 2) * W;
      const y = ((1 - v.y) / 2) * H;
      const off = x < -60 || x > W + 60 || y < -40 || y > H + 40;
      a.el.toggleAttribute('data-off', off);
      a.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      if (a.kind === 'room') taken.push([x - a.w / 2, y - a.h, x + a.w / 2, y]);
      else seatRows.push({ a, x, y });
    }
    // Name tags that would overlap yield to the nearer one (lower on screen = nearer).
    seatRows.sort((p, q) => q.y - p.y);
    const placed: [number, number, number, number][] = [];
    for (const { a, x, y } of seatRows) {
      const box: [number, number, number, number] = [x - a.w / 2, y - a.h, x + a.w / 2, y];
      const must = a.key === this.selected || this.lit.has(a.key) || a.key === this.hovered;
      const hit = placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      a.el.toggleAttribute('data-crowded', hit && !must);
      if (!hit || must) placed.push(box);
    }
  }

  // ================================================================ portraits for the 2D card
  /** A neutral generated portrait: the seat's own figure, head and shoulders, rendered once. */
  portrait(seat: string, body: number, team: string, size = 160): string | null {
    const cached = this.portraits.get(seat);
    if (cached) return cached;
    if (!this.kit) return null;
    const fig = new Figure(this.kit, body, hash(seat));
    fig.setPose('stand');
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(this.tok('--brand-soft'), this.tok('--calm'), 2.4));
    const l = new THREE.DirectionalLight(0xffffff, 1.8);
    l.position.set(-1, 2, 3);
    scene.add(l, fig.root);
    fig.root.rotation.y = 0.35;
    const h = this.kit.height;
    const cam = new THREE.OrthographicCamera(-0.46, 0.46, 0.46, -0.46, 0.1, 20);
    cam.position.set(0, h * 0.74, 5);
    cam.lookAt(0, h * 0.7, 0);
    const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
    const prev = this.renderer.getClearColor(new THREE.Color());
    const prevA = this.renderer.getClearAlpha();
    this.renderer.setClearColor(this.tok(washOf(ROOMS.find((r) => r.team === team)?.accent ?? '--brand'), '--brand-wash'), 1);
    this.renderer.setRenderTarget(rt);
    this.renderer.render(scene, cam);
    const px = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(prev, prevA);
    rt.dispose();
    fig.dispose();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    g.putImageData(img, 0, 0);
    const url = c.toDataURL('image/png');
    this.portraits.set(seat, url);
    this.requestRender(true);
    return url;
  }

  // ================================================================ the loop
  requestRender(full = false) {
    if (full) this.camDirty = true;
    this.dirty = true;
    if (!this.raf && !this.disposed && !document.hidden) this.raf = requestAnimationFrame(this.loop);
  }

  private ambientFps() {
    return this.quality >= 2 ? 15 : 30;
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (this.disposed || document.hidden) return;
    const dtCam = Math.min(0.1, (now - (this.lastTick || now)) / 1000);
    this.lastTick = now;
    let camMoving = false;
    for (const g of [this.tx, this.tz, this.view]) camMoving = g.step(dtCam) || camMoving;
    camMoving = this.yaw.step(dtCam, 0.2) || camMoving;
    const anyAnimated = !this.o.reducedMotion && this.quality < 3 && [...this.people.values()].some((p) => p.walk || p.fig.animated);
    const active = camMoving || this.interacting > 0;
    const due = now - this.lastRender >= 1000 / this.ambientFps() - 2;
    if (this.dirty || active || (anyAnimated && due)) {
      const t = (now - this.t0) / 1000;
      const dt = Math.min(0.1, (now - (this.lastRender || now)) / 1000);
      const walked = anyAnimated ? this.tickPeople(t, dt) : false;
      if (camMoving || this.camDirty) {
        this.applyCamera();
        this.updateWalls();
      }
      this.placeLabels(camMoving || this.camDirty || walked);
      this.renderer.render(this.scene, this.camera);
      this.measure(now, active);
      this.camDirty = false;
      this.dirty = false;
      this.lastRender = now;
    }
    if (active || anyAnimated) this.raf = requestAnimationFrame(this.loop);
    else this.report(now, 'still');
  };

  private measure(now: number, active: boolean) {
    const prev = this.rendered.at(-1);
    this.rendered.push(now);
    while (this.rendered.length && now - this.rendered[0] > 1000) this.rendered.shift();
    if (prev !== undefined && now - prev < 250) {
      this.frames.push(now - prev);
      if (this.frames.length > 120) this.frames.shift();
    }
    // Adaptive pixel ratio, only from frames drawn back to back (a capped frame says nothing).
    if (active && this.frames.length >= 30) {
      const recent = this.frames.slice(-30);
      const avg = recent.reduce((s, x) => s + x, 0) / recent.length;
      if (avg > 20) {
        this.fastSince = 0;
        if (!this.slowSince) this.slowSince = now;
        if (now - this.slowSince > 500) {
          this.slowSince = 0;
          this.frames = [];
          if (this.ratio > this.minRatio) this.setRatio(this.ratio - 0.25);
          else this.setQuality(this.quality + 1);
        }
      } else if (avg < 12) {
        this.slowSince = 0;
        if (!this.fastSince) this.fastSince = now;
        if (now - this.fastSince > 2000 && this.ratio < this.maxRatio) {
          this.fastSince = 0;
          this.setRatio(this.ratio + 0.25);
        }
      }
    }
    this.report(now, active ? 'active' : 'ambient');
  }
  private lastReport = 0;
  private report(now: number, mode: SceneStats['mode']) {
    if (!this.o.onStats || now - this.lastReport < 500) return;
    this.lastReport = now;
    const sorted = [...this.frames].sort((a, b) => a - b);
    this.o.onStats({
      fps: mode === 'still' ? 0 : this.rendered.length,
      p95: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      ratio: this.ratio,
      mode,
      quality: this.quality,
    });
  }
  private setRatio(r: number) {
    this.ratio = clamp(r, this.minRatio, this.maxRatio);
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.requestRender(true);
  }
  /** The ladder: 1 no glass, 2 ambient at 15 fps and no coffee walks, 3 still figures. */
  private setQuality(q: number) {
    if (q > 3) return;
    this.quality = q;
    if (this.glass) this.glass.visible = q < 1;
    if (q >= 3) for (const p of this.people.values()) if (!p.walk) this.applyPose(p);
  }

  private resize() {
    const el = this.o.canvas.parentElement ?? this.o.canvas;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    if (w === this.size.w && h === this.size.h) return;
    const first = this.size.w === 1;
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    if (first && this.kit) this.fitAll(true);
    this.camDirty = true;
    this.requestRender(true);
  }

  // ================================================================ input
  private bindInput() {
    const c = this.o.canvas;
    const pts = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let pinch = 0;
    let moved = false;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      moved = false;
      this.interacting++;
      if (pts.size === 2) pinch = spread(pts);
      this.requestRender();
    });
    const end = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      pts.delete(e.pointerId);
      this.interacting = Math.max(0, this.interacting - 1);
      if (!moved && pts.size === 0 && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 6) this.click(e);
      if (pts.size < 2) pinch = 0;
      this.requestRender();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return this.hover(e);
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) moved = true;
      if (pts.size === 2) {
        const s = spread(pts);
        if (pinch && s) this.goTo(this.tx.goal, this.tz.goal, this.view.goal * (pinch / s), true);
        pinch = s;
        return;
      }
      if (!moved) return;
      const wpp = this.view.x / this.usable().h;
      const { right, fwd } = this.basis();
      const ux = -dx * wpp;
      const uy = (dy * wpp) / Math.sin(PITCH);
      this.tx.goal = this.tx.x = clamp(this.tx.x + right.x * ux + fwd.x * uy, BOUNDS.x0, BOUNDS.x1);
      this.tz.goal = this.tz.x = clamp(this.tz.x + right.z * ux + fwd.z * uy, BOUNDS.z0, BOUNDS.z1);
      this.camDirty = true;
      this.requestRender();
    });
    c.addEventListener('pointerleave', () => this.setHover(null));
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const f = Math.exp(clamp(e.deltaY, -120, 120) * 0.0022);
        // Zoom towards the point under the pointer.
        const g = this.ground(e);
        const next = clamp(this.view.goal * f, MIN_VIEW, this.maxView());
        const k = 1 - next / this.view.goal;
        if (g) {
          this.tx.goal = clamp(this.tx.goal + (g.x - this.tx.goal) * k, BOUNDS.x0, BOUNDS.x1);
          this.tz.goal = clamp(this.tz.goal + (g.z - this.tz.goal) * k, BOUNDS.z0, BOUNDS.z1);
        }
        this.goTo(this.tx.goal, this.tz.goal, next);
      },
      { passive: false },
    );
  }
  private ray(e: { clientX: number; clientY: number }) {
    const r = this.o.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray;
  }
  private ground(e: { clientX: number; clientY: number }) {
    const ray = this.ray(e);
    const p = new THREE.Vector3();
    return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? p : null;
  }
  private pick(e: { clientX: number; clientY: number }): string | null {
    const ray = this.ray(e);
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    let best: string | null = null;
    let bestD = Infinity;
    const h = this.kit?.height ?? 1.3;
    for (const [seat, p] of this.people) {
      const pos = p.fig.root.position;
      box.min.set(pos.x - 0.38, pos.y, pos.z - 0.38);
      box.max.set(pos.x + 0.38, pos.y + h * (pos.y > 0.01 ? 0.85 : 1), pos.z + 0.38);
      if (ray.intersectBox(box, hit)) {
        const d = hit.distanceTo(ray.origin);
        if (d < bestD) ((bestD = d), (best = seat));
      }
    }
    return best;
  }
  private click(e: PointerEvent) {
    const seat = this.pick(e);
    if (seat) return this.o.onPick(seat);
    const g = this.ground(e);
    const r = g ? roomAt(g.x, g.z) : null;
    if (r && r.id !== 'commons') this.o.onRoom(r.id);
    else this.o.onPick(null);
  }
  private hoverAt = 0;
  private hover(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    const now = performance.now();
    if (now - this.hoverAt < 40) return;
    this.hoverAt = now;
    this.setHover(this.pick(e));
  }
  private setHover(seat: string | null) {
    if (seat === this.hovered) return;
    this.hovered = seat;
    this.o.canvas.style.cursor = seat ? 'pointer' : '';
    this.o.onHover?.(seat);
    this.placeBlobs();
    this.refreshFlags();
    this.camDirty = true;
    this.requestRender();
  }

  // ================================================================ lifecycle
  private visible = () => {
    if (!document.hidden) {
      this.lastTick = 0;
      this.requestRender(true);
    }
  };
  private lost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  };
  private restored = () => {
    this.build();
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener('visibilitychange', this.visible);
    this.o.canvas.removeEventListener('webglcontextlost', this.lost);
    this.o.canvas.removeEventListener('webglcontextrestored', this.restored);
    for (const p of this.people.values()) p.fig.dispose();
    this.renderer.dispose();
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const spread = (pts: Map<number, { x: number; y: number }>) => {
  const [a, b] = [...pts.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
