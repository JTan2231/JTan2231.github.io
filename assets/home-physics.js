import {
  Body, ContactMaterial, ConvexPolyhedron, Material, Plane, Quaternion, Sphere, Vec3, World
} from './vendor/cannon-es.js';
import { createClaw } from './home-claw.js?v=4';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a, b) => a.map((value, axis) => value - b[axis]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const length = vector => Math.hypot(...vector);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function ring(sides, radius, y) {
  return Array.from({ length: sides }, (_, index) => {
    const angle = (index + .5) * 2 * Math.PI / sides;
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
  });
}

function makeMesh(vertices, faces) {
  const radius = Math.max(...vertices.map(length));
  return {
    vertices: vertices.map(vertex => vertex.map(value => value / radius)),
    // Give every face an outward normal for lighting and back-face culling.
    faces: faces.map(face => {
      const [a, b, c] = face.map(index => vertices[index]);
      return dot(cross(subtract(b, a), subtract(c, a)), a) < 0 ? face.reverse() : face;
    })
  };
}

function sphere() {
  const sides = 10;
  const bands = 6;
  const vertices = [[0, -1, 0]];
  for (let band = 1; band < bands; band++) {
    const angle = Math.PI * band / bands;
    vertices.push(...ring(sides, Math.sin(angle), -Math.cos(angle)));
  }
  const bottom = vertices.push([0, 1, 0]) - 1;
  const faces = [];
  for (let index = 0; index < sides; index++) {
    const next = (index + 1) % sides;
    faces.push([0, 1 + index, 1 + next]);
    for (let band = 0; band < bands - 2; band++) {
      const start = 1 + band * sides;
      faces.push([start + index, start + next, start + index + sides],
        [start + next, start + next + sides, start + index + sides]);
    }
    faces.push([bottom, bottom - sides + index, bottom - sides + next]);
  }
  return makeMesh(vertices, faces);
}

function pointedMesh(sides) {
  const vertices = [...ring(sides, .93, .64), [0, -1.08, 0]];
  const base = Array.from({ length: sides }, (_, index) => index);
  return makeMesh(vertices, [...base.map(index => [index, (index + 1) % sides, sides]), base]);
}

function cube() {
  const vertices = [...ring(4, Math.SQRT2, -1), ...ring(4, Math.SQRT2, 1)];
  return makeMesh(vertices, [
    [0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4],
    [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]
  ]);
}

function turn([left, top], [right, bottom], [x, y]) {
  return (right - left) * (y - top) - (bottom - top) * (x - left);
}

function silhouette(points) {
  const sorted = points.slice().sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
  function half(ordered) {
    const hull = [];
    for (const point of ordered) {
      while (hull.length > 1 && turn(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  }
  return [...half(sorted), ...half(sorted.reverse())];
}

function containsPoint(polygon, point) {
  const edges = polygon.map((vertex, index) => turn(vertex, polygon[(index + 1) % polygon.length], point));
  return edges.every(edge => edge >= 0) || edges.every(edge => edge <= 0);
}

const stepTime = 1 / 120;
const up = new Vec3(0, -1, 0);
const clawArrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export function createPhysicsScene(canvas, input, { requestRender, project, unproject, reducedMotion }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const light = [-.48, -.64, -.60];
  const prizes = [
    { mesh: sphere(), color: [94, 111, 184], start: [-.25, -.27, .11], angles: [.32, .25, -.20], round: true },
    { mesh: pointedMesh(4), color: [205, 135, 62], start: [.24, -.30, .03], angles: [.29, .50, .16] },
    { mesh: pointedMesh(10), color: [74, 150, 118], start: [-.27, .29, -.07], angles: [.25, -.18, -.32] },
    { mesh: cube(), color: [182, 102, 125], start: [.26, .26, -.13], angles: [-.42, .56, .16] }
  ];
  for (const prize of prizes) prize.target = input.appendChild(document.createElement('div'));

  const prizeMaterial = new Material();
  const clawMaterial = new Material();
  const cabinetMaterial = new Material();
  const local = new Vec3();
  const transformed = new Vec3();
  const clawKeys = new Set();
  const pendingArrows = new Set();
  let width = 0;
  let height = 0;
  let unit = 0;
  let focal = 0;
  let edge = 0;
  let depth = 0;
  let floor = 0;
  let world;
  let claw;
  let trolley;
  let clawActive = true;
  let curved = false;
  let visible = true;
  let dirty = true;
  let settling = false;
  let lastTime = 0;
  let accumulated = 0;
  let drag = null;
  let prizeFaces = [];

  const scaleAt = z => focal / (focal + unit * z);
  const wallAt = z => (width / 2 - edge) / (unit * scaleAt(z));
  const bottomAt = prize => floor - verticalExtent(prize);

  function verticalExtent(prize) {
    if (prize.round) return prize.radius;
    let extent = 0;
    for (const vertex of prize.vertices) {
      prize.rigid.quaternion.vmult(vertex, transformed);
      extent = Math.max(extent, transformed.y);
    }
    return extent;
  }

  function constrainDrag(prize) {
    const { position } = prize.rigid;
    const wall = Math.max(0, wallAt(position.z) - prize.radius);
    position.x = clamp(position.x, -wall, wall);
    position.y = clamp(position.y, -height / (2 * unit) + prize.radius, bottomAt(prize));
    prize.rigid.aabbNeedsUpdate = true;
  }

  function mountClaw() {
    if (!world || !visible || !clawActive) return;
    const trolleyDepth = depth - 1.4;
    const limits = z => Math.max(0, wallAt(z) - 2.3);
    const z = clamp(trolley.z, -trolleyDepth, trolleyDepth);
    const x = clamp(trolley.x, -limits(z), limits(z));
    claw = createClaw(world, {
      floor, material: clawMaterial, position: new Vec3(x, 0, z),
      homeLength: height * .13 / unit,
      anchorY: z => -height * (.42 + .065 * z / depth) / (unit * scaleAt(z)),
      limits, depth: trolleyDepth,
      speed: Math.min(width, height) * .65 / unit
    });
  }

  function clearClawKeys() {
    clawKeys.clear();
    pendingArrows.clear();
  }

  function unmountClaw() {
    clearClawKeys();
    if (claw) {
      trolley = claw.position.clone();
      claw.dispose();
      claw = null;
    }
    dirty = true;
  }

  function addCabinetPlane(position, normal, collisionFilterMask = -1) {
    const quaternion = new Quaternion().setFromVectors(Vec3.UNIT_Z, normal.unit());
    world.addBody(new Body({
      shape: new Plane(), position, quaternion, material: cabinetMaterial, collisionFilterMask
    }));
  }

  function resize(nextWidth, nextHeight, nextCurved) {
    if (!nextWidth || !nextHeight) return;
    if (width === nextWidth && height === nextHeight) {
      if (curved !== nextCurved) dirty = true;
      curved = nextCurved;
      return;
    }
    endDrag(false);
    unmountClaw();
    const oldFloor = floor;
    const shortSide = Math.min(nextWidth, nextHeight);
    const nextUnit = shortSide * .064;
    const nextFocal = shortSide * 1.65;
    const scales = width ? [nextWidth / width, nextHeight / height, nextFocal / focal]
      .map(scale => scale * unit / nextUnit) : null;
    const settled = prizes.map(prize => prize.rigid &&
      oldFloor - prize.rigid.position.y - verticalExtent(prize) < .04);
    width = nextWidth;
    height = nextHeight;
    unit = nextUnit;
    focal = nextFocal;
    curved = nextCurved;
    floor = height * .35 / unit;
    edge = Math.min(45, shortSide * .075);
    depth = shortSide * .34 / unit;
    lastTime = accumulated = 0;
    settling = false;

    world = new World({ gravity: new Vec3(0, shortSide * 2.2 / unit, 0), allowSleep: true });
    world.solver.iterations = 30;
    world.addContactMaterial(new ContactMaterial(prizeMaterial, cabinetMaterial, { friction: .42, restitution: .27 }));
    world.addContactMaterial(new ContactMaterial(prizeMaterial, prizeMaterial, { friction: .35, restitution: .45 }));
    world.addContactMaterial(new ContactMaterial(clawMaterial, prizeMaterial, { friction: .45, restitution: .04 }));
    world.addContactMaterial(new ContactMaterial(clawMaterial, cabinetMaterial, { friction: .35, restitution: .04 }));

    const halfWidth = wallAt(0);
    const slope = (width / 2 - edge) / focal;
    addCabinetPlane(new Vec3(0, floor, 0), up);
    addCabinetPlane(new Vec3(0, -height / (2 * unit), 0), Vec3.UNIT_Y, 1);
    addCabinetPlane(new Vec3(-halfWidth, 0, 0), new Vec3(1, 0, slope));
    addCabinetPlane(new Vec3(halfWidth, 0, 0), new Vec3(-1, 0, slope));
    addCabinetPlane(new Vec3(0, 0, -depth), new Vec3(0, 0, 1));
    addCabinetPlane(new Vec3(0, 0, depth), new Vec3(0, 0, -1));

    for (const [index, prize] of prizes.entries()) {
      const previous = prize.rigid;
      prize.radius = Math.min(78, shortSide * .111) / unit;
      prize.vertices = prize.mesh.vertices.map(vertex => new Vec3(...vertex).scale(prize.radius));
      const shape = prize.round ? new Sphere(prize.radius) :
        new ConvexPolyhedron({ vertices: prize.vertices, faces: prize.mesh.faces });
      const position = scales
        ? new Vec3(previous.position.x * scales[0], previous.position.y * scales[1], previous.position.z * scales[2])
        : new Vec3(...prize.start.map((value, axis) => value * [width, height, focal][axis] / unit));
      position.z = clamp(position.z, -depth + prize.radius, depth - prize.radius);
      const still = !scales && reducedMotion.matches;
      const quaternion = previous?.quaternion ?? new Quaternion().setFromEuler(
        still ? 0 : prize.angles[0], prize.angles[1], still ? 0 : prize.angles[2], 'ZYX');
      prize.rigid = new Body({
        mass: 1, shape, position, quaternion, material: prizeMaterial,
        velocity: previous?.velocity, angularVelocity: previous?.angularVelocity,
        linearDamping: .45, angularDamping: .70, sleepSpeedLimit: .24, sleepTimeLimit: .5
      });
      constrainDrag(prize);
      if (settled[index] || still) prize.rigid.position.y = bottomAt(prize);
      if (still || (settled[index] && previous.sleepState === Body.SLEEPING)) prize.rigid.sleep();
      world.addBody(prize.rigid);
    }

    trolley = scales && trolley
      ? new Vec3(trolley.x * scales[0], 0, trolley.z * scales[2])
      : prizes[0].rigid.position.clone();
    mountClaw();

    const resolution = Math.min(1, 1280 / width, 900 / height);
    canvas.width = Math.max(1, Math.round(width * resolution));
    canvas.height = Math.max(1, Math.round(height * resolution));
    dirty = true;
  }

  function direction(key) {
    return Number(clawKeys.has(key) || pendingArrows.has(key));
  }

  function step(now) {
    const delta = lastTime ? clamp((now - lastTime) / 1000, 0, .05) : 1 / 60;
    lastTime = now;
    accumulated += delta;
    const dx = direction('ArrowRight') - direction('ArrowLeft');
    const dz = direction('ArrowUp') - direction('ArrowDown');
    if (accumulated < stepTime) return;
    while (accumulated >= stepTime) {
      claw?.update(stepTime, dx, dz);
      world.step(stepTime);
      accumulated -= stepTime;
    }
    pendingArrows.clear();
    if (!claw?.moving && !prizesMoving()) settling = false;
    dirty = true;
  }

  const prizesMoving = () => prizes.some(prize =>
    prize !== drag?.prize && prize.rigid.sleepState !== Body.SLEEPING);
  const sceneMoving = () => Boolean(world && (claw?.moving || pendingArrows.size ||
    clawArrows.some(key => clawKeys.has(key)) ||
    ((!reducedMotion.matches || settling) && (drag || prizesMoving()))));

  function projectPoint([x, y, z]) {
    const scale = unit * scaleAt(z);
    return [width / 2 + x * scale, height / 2 + y * scale];
  }

  function drawShadow(prize) {
    const { x, y, z } = prize.rigid.position;
    const scale = unit * scaleAt(z);
    const size = prize.radius * scale;
    const gap = Math.max(0, bottomAt(prize) - y);
    const alpha = .16 * Math.exp(-gap / prize.radius);
    ctx.save();
    ctx.translate(width / 2 + x * scale, height / 2 + floor * scale);
    ctx.scale(size, size * .24);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    shadow.addColorStop(0, `rgba(0,0,0,${alpha})`);
    shadow.addColorStop(1, 'transparent');
    ctx.fillStyle = shadow;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function meshFaces({ mesh, rigid, color }, prize = null) {
    const size = prize?.radius ?? 1;
    const worldPoints = mesh.vertices.map(([x, y, z]) => {
      local.set(x * size, y * size, z * size);
      rigid.pointToWorldFrame(local, transformed);
      return [transformed.x, transformed.y, transformed.z];
    });
    const points = worldPoints.map(projectPoint);
    if (prize) {
      const screen = curved ? points.map(([x, y]) => project(x, y)) : points;
      const left = Math.min(...screen.map(point => point[0]));
      const top = Math.min(...screen.map(point => point[1]));
      const right = Math.max(...screen.map(point => point[0]));
      const bottom = Math.max(...screen.map(point => point[1]));
      const outline = silhouette(screen).map(([x, y]) => `${x - left}px ${y - top}px`);
      Object.assign(prize.target.style, {
        left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`,
        clipPath: `polygon(${outline.join(',')})`
      });
    }
    const visibleFaces = [];
    for (const face of mesh.faces) {
      const [a, b, c] = face.map(index => worldPoints[index]);
      const normal = cross(subtract(b, a), subtract(c, a));
      if (dot(normal, [-a[0], -a[1], -focal / unit - a[2]]) <= 0) continue;
      const shade = .70 + .49 * Math.max(0, dot(normal, light) / length(normal));
      const channels = color.map(channel => Math.round(channel * shade + (1 - shade) * 18));
      visibleFaces.push({
        prize, color: `rgb(${channels.join(',')})`, points: face.map(index => points[index]),
        z: face.reduce((sum, index) => sum + worldPoints[index][2], 0) / face.length
      });
    }
    return visibleFaces;
  }

  function render() {
    const faces = prizes.flatMap(prize => meshFaces(prize, prize));
    for (const part of claw?.visuals ?? []) faces.push(...meshFaces(part));
    faces.sort((a, b) => b.z - a.z);
    prizeFaces = faces.filter(face => face.prize);
    for (const face of prizeFaces) face.screen = curved ? face.points.map(([x, y]) => project(x, y)) : face.points;

    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    prizes.forEach(drawShadow);
    ctx.lineJoin = 'round';
    for (const face of faces) {
      ctx.beginPath();
      face.points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.lineWidth = face.prize ? .85 : .5;
      ctx.fillStyle = ctx.strokeStyle = face.color;
      ctx.fill();
      ctx.stroke();
    }
    // Let objects pass behind the portfolio text while keeping the text legible.
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(Math.min(width * .61, 410), 200);
    const fade = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    fade.addColorStop(.58, 'rgba(0,0,0,.67)');
    fade.addColorStop(1, 'transparent');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = fade;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function pointer(event) {
    const rect = input.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  function move(event) {
    if (event.pointerId !== drag?.id) return;
    const screen = pointer(event);
    if (screen[0] === drag.screen[0] && screen[1] === drag.screen[1]) return;
    const { prize, offset, velocity, spin } = drag;
    const { position, quaternion } = prize.rigid;
    const [x, y] = curved ? unproject(...screen) : screen;
    const previous = position.clone();
    const dt = Math.max(.008, (event.timeStamp - drag.updated) / 1000);
    const scale = unit * scaleAt(position.z);
    drag.screen = screen;
    drag.updated = event.timeStamp;
    position.x = (x - width / 2) / scale + offset[0];
    position.y = (y - height / 2) / scale + offset[1];
    constrainDrag(prize);
    if (!reducedMotion.matches) {
      const dx = position.x - previous.x;
      const dy = position.y - previous.y;
      const blend = Math.min(1, dt / .035);
      velocity.x += (dx / dt - velocity.x) * blend;
      velocity.y += (dy / dt - velocity.y) * blend;
      const speed = velocity.length();
      const limit = Math.min(width, height) * 2.8 / unit;
      if (speed > limit) velocity.scale(limit / speed, velocity);
      const turn = new Quaternion().setFromEuler(-dy / (prize.radius * 2.5), dx / (prize.radius * 2.5), 0);
      turn.mult(quaternion, quaternion);
      constrainDrag(prize);
      spin.set(-velocity.y / (prize.radius * 2.5), velocity.x / (prize.radius * 2.5), 0);
    }
    dirty = true;
    requestRender();
  }

  function endDrag(keepMomentum) {
    if (!drag) return;
    const { prize, id, velocity, spin } = drag;
    drag = null;
    const rigid = prize.rigid;
    rigid.type = Body.DYNAMIC;
    if (keepMomentum) {
      rigid.velocity.copy(velocity);
      rigid.angularVelocity.copy(spin);
    }
    rigid.wakeUp();
    input.classList.remove('is-dragging');
    if (input.hasPointerCapture(id)) input.releasePointerCapture(id);
    requestRender();
  }

  input.addEventListener('pointerdown', event => {
    if (!visible || drag || event.button !== 0) return;
    const screen = pointer(event);
    const face = prizeFaces.findLast(face => containsPoint(face.screen, screen));
    if (!face) return;
    const { prize } = face;
    const { rigid } = prize;
    const [x, y] = curved ? unproject(...screen) : screen;
    const scale = unit * scaleAt(rigid.position.z);
    rigid.type = Body.KINEMATIC;
    rigid.velocity.setZero();
    rigid.angularVelocity.setZero();
    rigid.wakeUp();
    drag = { prize, id: event.pointerId, screen, updated: event.timeStamp, velocity: new Vec3(), spin: new Vec3(),
      offset: [rigid.position.x - (x - width / 2) / scale, rigid.position.y - (y - height / 2) / scale] };
    input.setPointerCapture(event.pointerId);
    input.classList.add('is-dragging');
    event.preventDefault();
  });
  input.addEventListener('pointermove', move);
  input.addEventListener('pointerup', event => {
    if (event.pointerId !== drag?.id) return;
    move(event);
    endDrag(!reducedMotion.matches && event.timeStamp - drag.updated <= 90);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    input.addEventListener(type, event => {
      if (event.pointerId === drag?.id) endDrag(false);
    });
  }

  function stop() {
    endDrag(false);
    unmountClaw();
    mountClaw();
    for (const prize of prizes) {
      prize.rigid?.velocity.setZero();
      prize.rigid?.angularVelocity.setZero();
    }
    lastTime = accumulated = 0;
    settling = false;
  }

  return {
    resize, stop, clearClawKeys,
    get moving() { return visible && sceneMoving(); },
    setClawActive(value) {
      if (clawActive === value) return;
      clawActive = value;
      unmountClaw();
      mountClaw();
    },
    handleClawKey(key, pressed, repeat = false) {
      if (key !== ' ' && !clawArrows.includes(key)) return false;
      if (!pressed) return clawKeys.delete(key);
      if (!claw) return false;
      if (repeat || clawKeys.has(key)) return true;
      clawKeys.add(key);
      settling = true;
      if (key === ' ') claw.toggleGrab();
      else pendingArrows.add(key);
      requestRender();
      return true;
    },
    setVisible(value) {
      if (visible === value) return;
      visible = value;
      if (visible) mountClaw();
      else stop();
    },
    update(now) {
      if (!visible || !world) return false;
      if (sceneMoving()) step(now);
      if (!sceneMoving()) lastTime = accumulated = 0;
      if (!dirty) return false;
      render();
      dirty = false;
      return true;
    }
  };
}
