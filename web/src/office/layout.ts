// The 3D Office's floor plan as data: rooms per team, desk pods, the meeting
// table, the coffee corner and the walking routes between them. Pure (no
// three.js): the scene builds from it and tests/office.test.ts checks it.
//
// Units are metres. x runs left → right, z back → front (towards the viewer
// at the default angle). A figure's facing is a yaw in radians: 0 looks +z.

export type RoomKind = 'team' | 'meeting' | 'reception' | 'lounge' | 'commons';
export interface Room {
  id: string;
  kind: RoomKind;
  /** The team whose seats sit here (team rooms only). */
  team?: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** The CSS token for its accent (sign, rug). */
  accent: string;
  /** The z of the wall on the corridor side, and the door's x. */
  doorZ: number;
  doorX: number;
}
export interface Spot {
  x: number;
  z: number;
  /** Facing (yaw, radians; 0 = +z). */
  face: number;
}
export interface DeskSpot extends Spot {
  room: string;
  /** The desk in front of the chair: centre and yaw. */
  desk: Spot;
}
export interface Point {
  x: number;
  z: number;
}

/** Outer bounds of the floor. */
export const BOUNDS = { x0: -20, z0: -11.5, x1: 20, z1: 10 } as const;
/** The corridor (commons) between the two rows of rooms. */
export const CORRIDOR = { z0: -2, z1: 2 } as const;
export const WALL_H = 2.4;
export const GLASS_H = 1.25;
export const DESK = { w: 1.4, d: 0.7, h: 0.74 } as const;
export const SEAT_H = 0.46;

const TEAM_ACCENT: Record<string, string> = {
  'ceo-office': '--chart-plum',
  engineering: '--chart-sky',
  product: '--chart-leaf',
  growth: '--chart-honey',
  customers: '--chart-sea',
  finance: '--chart-stone',
  trust: '--chart-coral',
  advisory: '--chart-rose',
};
/** A team's accent colour token in the 3D office. */
export const accentOf = (team: string) => TEAM_ACCENT[team] ?? '--brand';

const room = (id: string, kind: RoomKind, x0: number, x1: number, back: boolean, team?: string): Room => ({
  id,
  kind,
  team,
  x0,
  x1,
  z0: back ? BOUNDS.z0 : CORRIDOR.z1,
  z1: back ? CORRIDOR.z0 : BOUNDS.z1,
  accent: kind === 'meeting' ? '--brand' : kind === 'reception' ? '--calm' : accentOf(team ?? id),
  doorZ: back ? CORRIDOR.z0 : CORRIDOR.z1,
  doorX: (x0 + x1) / 2,
});

/** Every room, back row first (left → right), then the front row. */
export const ROOMS: Room[] = [
  room('engineering', 'team', -20, -13, true, 'engineering'),
  room('product', 'team', -13, -6.5, true, 'product'),
  room('growth', 'team', -6.5, 7, true, 'growth'),
  room('customers', 'team', 7, 13.5, true, 'customers'),
  room('finance', 'team', 13.5, 20, true, 'finance'),
  room('ceo-office', 'team', -20, -12, false, 'ceo-office'),
  room('meeting', 'meeting', -12, -4, false),
  room('reception', 'reception', -4, 5, false),
  room('trust', 'team', 5, 11, false, 'trust'),
  room('advisory', 'lounge', 11, 20, false, 'advisory'),
];
export const COMMONS: Room = {
  id: 'commons',
  kind: 'commons',
  x0: BOUNDS.x0,
  x1: BOUNDS.x1,
  z0: CORRIDOR.z0,
  z1: CORRIDOR.z1,
  accent: '--calm',
  doorZ: 0,
  doorX: -17,
};
/** A room of the 3D office by id (the commons included). */
export const roomById = (id: string) => (id === 'commons' ? COMMONS : ROOMS.find((r) => r.id === id));
/** The room a team sits in, or null. */
export const roomOfTeam = (team: string) => ROOMS.find((r) => r.team === team) ?? null;
/** The room at a floor point, or null. */
export const roomAt = (x: number, z: number): Room | null => [...ROOMS, COMMONS].find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) ?? null;
/** Rooms with walls of glass (the reception and the commons are open). */
export const walled = (r: Room) => r.kind !== 'reception' && r.kind !== 'commons';

// ------------------------------------------------------------ desks
const POD_X = 2.4; // column pitch
const POD_Z = 3.8; // row pitch (two desks face to face + their chairs)
const MARGIN = 0.8;
const AISLE = 1.5; // kept free along the corridor wall

/** Where pods fit in a team room: their centres, farthest from the door first. */
export function podsOf(r: Room): Point[] {
  const back = r.doorZ === r.z1; // the door is on the room's front wall
  const usableW = r.x1 - r.x0 - 2 * MARGIN;
  const zNear = back ? r.z1 - AISLE : r.z0 + AISLE;
  const zFar = back ? r.z0 + MARGIN : r.z1 - MARGIN;
  const usableD = Math.abs(zNear - zFar);
  const cols = Math.max(1, Math.floor((usableW + POD_X - DESK.w) / POD_X));
  const rows = Math.max(1, Math.floor((usableD + 0.4) / POD_Z));
  const cx = (r.x0 + r.x1) / 2;
  const out: Point[] = [];
  for (let row = 0; row < rows; row++) {
    const z = zFar + (back ? 1 : -1) * (POD_Z / 2 - 0.2 + row * POD_Z);
    // Centre-out, so a half-full row stays in the middle of the room.
    const order = [...Array(cols).keys()].sort((a, b) => Math.abs(a - (cols - 1) / 2) - Math.abs(b - (cols - 1) / 2) || a - b);
    for (const c of order) out.push({ x: cx + (c - (cols - 1) / 2) * POD_X, z });
  }
  return out;
}

/** Two desks per pod: one faces the front (+z), one the back; the person sits behind each. */
function podDesks(p: Point, roomId: string): DeskSpot[] {
  return [
    { room: roomId, x: p.x, z: p.z - 1.05, face: 0, desk: { x: p.x, z: p.z - 0.37, face: 0 } },
    { room: roomId, x: p.x, z: p.z + 1.05, face: Math.PI, desk: { x: p.x, z: p.z + 0.37, face: Math.PI } },
  ];
}

/** How many seats a team room holds (two per desk pod). */
export function capacity(r: Room) {
  return r.kind === 'team' ? podsOf(r).length * 2 : 0;
}

/**
 * Desks for every seat, by team, in the order given (hierarchy order: the
 * team's lead first). A team without a room of its own, or a full room,
 * borrows the free desk with most room to spare, so nobody is left standing
 * (tests/office.test.ts checks today's chart fits its own rooms).
 */
export function assignDesks(seats: { seat: string; team: string }[]): Map<string, DeskSpot> {
  const out = new Map<string, DeskSpot>();
  const free = new Map<string, DeskSpot[]>();
  for (const r of ROOMS)
    if (r.kind === 'team')
      free.set(
        r.id,
        podsOf(r).flatMap((p) => podDesks(p, r.id)),
      );
  for (const s of seats) {
    const r = roomOfTeam(s.team);
    const own = r ? free.get(r.id) : undefined;
    const pool = own?.length ? own : [...free.values()].sort((a, b) => b.length - a.length)[0];
    const d = pool?.shift();
    if (d) out.set(s.seat, d);
  }
  return out;
}

// ------------------------------------------------------------ the meeting table and the coffee corner
const MEET = roomById('meeting')!;
export const MEETING_TABLE = { x: (MEET.x0 + MEET.x1) / 2, z: (MEET.z0 + MEET.z1) / 2 + 0.4, w: 4.4, d: 1.5 } as const;

/** Chairs round the meeting table, facing it: five a side, then the two ends. */
export const MEETING_CHAIRS: Spot[] = (() => {
  const t = MEETING_TABLE;
  const out: Spot[] = [];
  for (let i = 0; i < 5; i++) {
    const x = t.x - t.w / 2 + 0.5 + i * ((t.w - 1) / 4);
    out.push({ x, z: t.z - t.d / 2 - 0.55, face: 0 });
    out.push({ x, z: t.z + t.d / 2 + 0.55, face: Math.PI });
  }
  out.push({ x: t.x - t.w / 2 - 0.6, z: t.z, face: Math.PI / 2 });
  out.push({ x: t.x + t.w / 2 + 0.6, z: t.z, face: -Math.PI / 2 });
  return out;
})();

export const COFFEE_BAR = { x: BOUNDS.x0 + 0.6, z: 0, w: 0.7, d: 3.0 } as const;
/** Standing spots at the coffee bar, facing it (−x). */
export const COFFEE_SPOTS: Spot[] = [
  { x: BOUNDS.x0 + 1.6, z: -0.9, face: -Math.PI / 2 },
  { x: BOUNDS.x0 + 1.6, z: 0.3, face: -Math.PI / 2 },
  { x: BOUNDS.x0 + 2.3, z: 1.25, face: -Math.PI * 0.8 },
];

// ------------------------------------------------------------ walking routes
/** The aisle inside a room, along its corridor wall. */
const aisleZ = (r: Room) => (r.doorZ === r.z1 ? r.z1 - 0.8 : r.z0 + 0.8);

/** From a spot out to the corridor's centre line, avoiding desks: along the lane beside the pod, the aisle, the door. */
export function routeOut(from: DeskSpot | Spot, roomId: string): Point[] {
  const r = roomById(roomId);
  if (!r || r.kind === 'commons')
    return [
      { x: from.x, z: from.z },
      { x: from.x, z: 0 },
    ];
  const pts: Point[] = [{ x: from.x, z: from.z }];
  if ('desk' in from) {
    // The lane between pod columns, on the door's side of this pod.
    const lane = from.x + (r.doorX >= from.x ? 1 : -1) * (POD_X / 2);
    pts.push({ x: lane, z: from.z }, { x: lane, z: aisleZ(r) });
  } else {
    // A meeting chair: step back from the table first, then round its end.
    const t = MEETING_TABLE;
    const out = { x: from.x - Math.sin(from.face) * 0.6, z: from.z - Math.cos(from.face) * 0.6 };
    pts.push(out);
    const endX = out.x < t.x ? t.x - t.w / 2 - 1.2 : t.x + t.w / 2 + 1.2;
    if (Math.abs(out.z - t.z) < t.d / 2 + 0.3 || out.z > t.z !== aisleZ(r) > t.z) pts.push({ x: endX, z: out.z }, { x: endX, z: aisleZ(r) });
    else pts.push({ x: out.x, z: aisleZ(r) });
  }
  pts.push({ x: r.doorX, z: aisleZ(r) }, { x: r.doorX, z: r.doorZ }, { x: r.doorX, z: 0 });
  return pts;
}

/** A whole walk: out of one room, along the corridor, into the other. */
export function route(from: DeskSpot | Spot, fromRoom: string, to: DeskSpot | Spot, toRoom: string): Point[] {
  const a = routeOut(from, fromRoom);
  const b = routeOut(to, toRoom).reverse();
  const path = [...a, ...b];
  // Drop repeated points (a straight line needs only its ends).
  return path.filter((p, i) => i === 0 || Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z) > 0.01);
}

/** The length of a walking path on the floor. */
export const pathLength = (pts: Point[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) : 0), 0);

/** Plants: corners of rooms and along the corridor (instanced). */
export const PLANTS: Point[] = [
  ...ROOMS.filter((r) => r.kind === 'team' || r.kind === 'lounge').flatMap((r) => {
    const back = r.doorZ === r.z1;
    return [
      { x: r.x0 + 0.45, z: back ? r.z0 + 0.45 : r.z1 - 0.45 },
      { x: r.x1 - 0.45, z: back ? r.z0 + 0.45 : r.z1 - 0.45 },
    ];
  }),
  { x: -3.5, z: BOUNDS.z1 - 0.6 },
  { x: 4.5, z: BOUNDS.z1 - 0.6 },
  { x: BOUNDS.x0 + 0.5, z: 1.5 },
  { x: BOUNDS.x0 + 0.5, z: -1.5 },
];
