// The Office's people: twelve Kenney "Mini Characters" (CC0 1.0, see
// web/src/office/assets/NOTICE.md) in one file, their five clips kept once.
// Each body's two skinned meshes (body + head) are merged into one at load,
// so a figure is a single draw call. Seated figures hold the "sit" pose and
// type with two bone rotations in code; only walkers run the clip mixer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export const BODY_COUNT = 12;
/** Model units → metres: the minis are ~0.67 tall; at this scale a figure stands ~1.3 m and sits with its head above a monitor. */
export const FIGURE_SCALE = 1.9;
export type Clip = 'idle' | 'walk' | 'sit' | 'emote-yes' | 'interact-right';
const BONES = ['root', 'leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head'] as const;
type BoneName = (typeof BONES)[number];

export interface FigureKit {
  templates: THREE.Object3D[];
  clips: Map<string, THREE.AnimationClip>;
  material: THREE.MeshLambertMaterial;
  dimMaterial: THREE.MeshLambertMaterial;
  /** Height of the hip joint above the feet, in metres (to seat a figure on a chair). */
  hip: number;
  /** Standing height, metres. */
  height: number;
}

/** Float copy of an attribute (quantized ints → floats), so two meshes' attributes can be joined. */
function floatAttr(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, int = false): THREE.BufferAttribute {
  const n = a.count * a.itemSize;
  const arr = int ? new Uint16Array(n) : new Float32Array(n);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k);
  return new THREE.BufferAttribute(arr, a.itemSize);
}

function plainGeometry(g: THREE.BufferGeometry, m?: THREE.Matrix4): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
    const a = g.getAttribute(name);
    if (a) out.setAttribute(name, floatAttr(a, name === 'skinIndex'));
  }
  if (g.index) out.setIndex(floatAttr(g.index, true));
  if (m) out.getAttribute('position').applyMatrix4(m);
  return out;
}

/**
 * Body and head are skinned to the same seven joints with different
 * (quantization) inverse bind matrices: T = inv(bodyIBM) · headIBM is the
 * same for every joint, so moving the head's vertices by T lets both use the
 * body's skin. One mesh, one draw call.
 */
function mergeBody(scene: THREE.Object3D, material: THREE.Material): void {
  const skinned: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && skinned.push(o as THREE.SkinnedMesh));
  const body = skinned.find((s) => s.name.startsWith('body')) ?? skinned[0];
  const geos = skinned.map((s) => {
    if (s === body) return plainGeometry(s.geometry);
    const t = body.skeleton.boneInverses[0].clone().invert().multiply(s.skeleton.boneInverses[0]);
    return plainGeometry(s.geometry, t);
  });
  const merged = mergeGeometries(geos);
  if (!merged) throw new Error('figure merge failed');
  const mesh = new THREE.SkinnedMesh(merged, material);
  mesh.name = 'figure';
  mesh.frustumCulled = false;
  body.parent!.add(mesh);
  mesh.bind(body.skeleton, body.bindMatrix);
  for (const s of skinned) s.parent?.remove(s);
}

/**
 * Loads the 3D office's figure models. Quantized rather than meshopt-compressed: no WebAssembly decoder is needed
 * (the security policy allows none), and gzipped they are the same size.
 */
export async function loadFigures(url: string, renderer: THREE.WebGLRenderer): Promise<FigureKit> {
  // Quantized, not meshopt-compressed: no WebAssembly decoder (the app's security policy allows none),
  // and gzip makes the two the same size on the wire (94 vs 96 KB).
  const loader = new GLTFLoader();
  // Textures through an <img> (img-src allows blob:), not fetch() into an ImageBitmap (connect-src does not).
  loader.register((parser) => {
    (parser as unknown as { textureLoader: THREE.Loader }).textureLoader = new THREE.TextureLoader(parser.options.manager);
    return { name: 'curahold_img_textures' };
  });
  const gltf = await loader.loadAsync(url);
  let map: THREE.Texture | null = null;
  gltf.scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.map && !map) map = m.map;
  });
  const tex = map as THREE.Texture | null;
  if (tex) tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const material = new THREE.MeshLambertMaterial({ map: tex });
  const dimMaterial = new THREE.MeshLambertMaterial({ map: tex, color: new THREE.Color(0.5, 0.5, 0.56), transparent: true, opacity: 0.72 });
  const templates = gltf.scenes.map((scene) => {
    // The loader keeps node names unique across the file (torso, torso_1 …); the clips use the first set.
    scene.traverse((o) => {
      o.name = o.name.replace(/_\d+$/, '');
    });
    mergeBody(scene, material);
    return scene;
  });
  const clips = new Map(gltf.animations.map((a) => [a.name, a]));
  // Measure on the first body: hip height and standing height (bind pose).
  const probe = SkeletonUtils.clone(templates[0]);
  probe.updateMatrixWorld(true);
  const hipBone = probe.getObjectByName('leg-left')!;
  const hip = new THREE.Vector3().setFromMatrixPosition(hipBone.matrixWorld).y * FIGURE_SCALE;
  const box = new THREE.Box3();
  const mesh = probe.getObjectByName('figure') as THREE.SkinnedMesh;
  mesh.computeBoundingBox();
  box.copy(mesh.boundingBox!);
  const height = (box.max.y - Math.min(0, box.min.y)) * FIGURE_SCALE;
  return { templates, clips, material, dimMaterial, hip, height: height > 0.5 && height < 3 ? height : 1.3 };
}

export type Pose = 'sit' | 'type' | 'sleep' | 'stand' | 'walk' | 'talk';

/** One person in the Office. */
export class Figure {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  private bones = {} as Record<BoneName, THREE.Bone>;
  private base = new Map<THREE.Bone, THREE.Quaternion>();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  pose: Pose = 'sit';
  /** A per-person phase so nobody types in step. */
  private phase: number;
  private rate: number;

  constructor(
    private kit: FigureKit,
    body: number,
    seed: number,
  ) {
    const model = SkeletonUtils.clone(kit.templates[((body % BODY_COUNT) + BODY_COUNT) % BODY_COUNT]);
    model.scale.setScalar(FIGURE_SCALE);
    this.root.add(model);
    this.mesh = model.getObjectByName('figure') as THREE.SkinnedMesh;
    for (const b of BONES) this.bones[b] = model.getObjectByName(b) as THREE.Bone;
    this.mixer = new THREE.AnimationMixer(model);
    for (const [name, clip] of kit.clips) this.actions.set(name, this.mixer.clipAction(clip));
    this.phase = (seed % 97) * 0.37;
    this.rate = 5.2 + (seed % 7) * 0.25;
  }

  setDim(dim: boolean) {
    this.mesh.material = dim ? this.kit.dimMaterial : this.kit.material;
  }

  /** Hold a clip's first frame (seated, standing) or loop it (walking). */
  private play(clip: Clip, loop: boolean) {
    const a = this.actions.get(clip);
    if (!a) return;
    if (this.current && this.current !== a) this.current.stop();
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.play();
    this.current = a;
    this.mixer.update(loop ? 0 : 1e-3);
    this.base.clear();
    for (const b of Object.values(this.bones)) this.base.set(b, b.quaternion.clone());
  }

  setPose(p: Pose) {
    if (p === this.pose && this.current) return;
    this.pose = p;
    if (p === 'walk') this.play('walk', true);
    else if (p === 'stand') this.play('idle', true);
    else this.play('sit', false);
    if (p === 'sleep') this.bend('head', 0.55, 0, 0);
    if (p === 'type') this.tick(0);
  }

  private bend(b: BoneName, x: number, y: number, z: number) {
    const bone = this.bones[b];
    const base = this.base.get(bone);
    if (!bone || !base) return;
    bone.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)));
  }

  /** Is this figure moving on its own (needs frames)? */
  get animated() {
    return this.pose === 'type' || this.pose === 'walk' || this.pose === 'stand' || this.pose === 'talk';
  }

  /** Advance: t = seconds since start, dt = seconds since the last tick. */
  tick(t: number, dt = 0) {
    if (this.pose === 'walk' || this.pose === 'stand') {
      this.mixer.update(dt);
      return;
    }
    if (this.pose === 'talk') {
      const s = Math.sin((t + this.phase) * 2.1);
      this.bend('head', 0.06 * s, 0.18 * Math.sin((t + this.phase) * 0.7), 0);
      return;
    }
    if (this.pose !== 'type') return;
    // Typing: both forearms out over the keyboard, alternating a few degrees,
    // slightly irregular; now and then the head glances down and back.
    const w = (t + this.phase) * this.rate;
    const l = Math.sin(w) * 0.07 + Math.sin(w * 2.3) * 0.03;
    const r = Math.sin(w + 1.9) * 0.07 + Math.sin(w * 1.7 + 0.4) * 0.03;
    this.bend('arm-left', -1.05 + l, 0, -0.38);
    this.bend('arm-right', -1.05 + r, 0, 0.38);
    const glance = Math.max(0, Math.sin((t + this.phase) * 0.45)) ** 6;
    this.bend('head', 0.1 + glance * 0.22, 0, 0);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
