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

function rotation(angles) {
  const [sx, sy, sz] = angles.map(Math.sin);
  const [cx, cy, cz] = angles.map(Math.cos);
  return ([x, y, z]) => {
    const pitchY = y * cx - z * sx;
    const pitchZ = y * sx + z * cx;
    const yawX = x * cy + pitchZ * sy;
    return [yawX * cz - pitchY * sz, yawX * sz + pitchY * cz, pitchZ * cy - x * sy];
  };
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

function verticalExtent(body, direction = 1) {
  const rotate = rotation(body.angles);
  return body.radius * Math.max(...body.mesh.vertices.map(vertex => direction * rotate(vertex)[1]));
}

const clawArrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export function createPhysicsScene(canvas, input, { requestRender, project, unproject, reducedMotion }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const light = [-.48, -.64, -.60];
  const bodies = [
    { mesh: sphere(), color: [94, 111, 184], start: [-.25, -.27, .11], angles: [.32, .25, -.20] },
    { mesh: pointedMesh(4), color: [205, 135, 62], start: [.24, -.30, .03], angles: [.29, .50, .16], flatBase: true },
    { mesh: pointedMesh(10), color: [74, 150, 118], start: [-.27, .29, -.07], angles: [.25, -.18, -.32], flatBase: true },
    { mesh: cube(), color: [182, 102, 125], start: [.26, .26, -.13], angles: [-.42, .56, .16], flatBase: true }
  ];
  for (const body of bodies) {
    body.position = [0, 0, 0];
    body.velocity = [0, 0, 0];
    body.spin = [0, 0, 0];
    body.target = input.appendChild(document.createElement('div'));
  }

  let width = 0;
  let height = 0;
  let focal = 0;
  let edge = 0;
  let depth = 0;
  let floor = 0;
  let gravity = 0;
  let speedLimit = 0;
  let curved = false;
  let visible = true;
  let dirty = true;
  let moving = false;
  let lastTime = 0;
  let drag = null;
  let faces = [];
  const clawKeys = new Set();
  const claw = { active: true, x: 0, y: 0, z: 0, size: 0, opening: 1, phase: 'idle', held: null };

  const scaleAt = z => focal / (focal + z);
  const clawJaws = () => claw.size * 1.65;
  const chainTop = () => -height * (.42 + .065 * claw.z / depth) / scaleAt(claw.z);
  const clawHome = () => chainTop() + height * .13;
  const isControlled = body => body === drag?.body || body === claw.held;

  function constrain(body, bounce) {
    const scale = scaleAt(body.position[2]);
    const wall = Math.max(0, (width / 2 - edge) / scale - body.radius);
    const ceiling = -Math.max(0, (height / 2 - edge) / scale - body.radius);
    const bottom = floor - verticalExtent(body);
    const lower = [-wall, ceiling, -depth];
    const upper = [wall, bottom, depth];
    for (let axis = 0; axis < 3; axis++) {
      const position = body.position[axis];
      const constrained = clamp(position, lower[axis], upper[axis]);
      body.position[axis] = constrained;
      const speed = body.velocity[axis];
      if (bounce && (position - constrained) * speed > 0) {
        const hitsFloor = axis === 1 && position > bottom;
        body.velocity[axis] *= hitsFloor ? (speed > gravity * .045 ? -.36 : 0) : -.78;
      }
    }
    body.grounded = body.position[1] === bottom;
  }

  function resize(nextWidth, nextHeight, nextCurved) {
    if (!nextWidth || !nextHeight) return;
    if (width === nextWidth && height === nextHeight && curved === nextCurved) return;
    endDrag(false);
    resetClaw();
    const hadSize = width > 0;
    const shortSide = Math.min(nextWidth, nextHeight);
    const nextFocal = shortSide * 1.65;
    const scales = hadSize ? [nextWidth / width, nextHeight / height, nextFocal / focal] : null;
    floor = nextHeight * .35;
    gravity = shortSide * 2.2;
    for (const body of bodies) {
      body.radius = Math.min(78, shortSide * .111);
      body.position = hadSize
        ? body.position.map((value, axis) => value * scales[axis])
        : body.start.map((value, axis) => value * [nextWidth, nextHeight, nextFocal][axis]);
      if (body.grounded || (!hadSize && reducedMotion.matches)) {
        if (!hadSize && body.flatBase) body.angles[0] = body.angles[2] = 0;
        body.position[1] = floor - verticalExtent(body);
      }
    }
    width = nextWidth;
    height = nextHeight;
    focal = nextFocal;
    curved = nextCurved;
    edge = Math.min(45, shortSide * .075);
    depth = shortSide * .30;
    speedLimit = shortSide * 2.8;
    bodies.forEach(body => constrain(body, false));
    claw.size = Math.min(39, shortSide * .064);
    claw.x = hadSize ? claw.x * scales[0] : bodies[0].position[0];
    claw.z = clamp(hadSize ? claw.z * scales[2] : bodies[0].position[2], -depth, depth);
    constrainClaw();
    claw.y = clawHome();
    const resolution = Math.min(1, 1280 / width, 900 / height);
    canvas.width = Math.max(1, Math.round(width * resolution));
    canvas.height = Math.max(1, Math.round(height * resolution));
    dirty = true;
  }

  function collide(first, second) {
    const offset = subtract(second.position, first.position);
    const distance = length(offset);
    const overlap = first.radius + second.radius - distance;
    if (overlap <= 0) return;
    const normal = distance ? offset.map(value => value / distance) : [1, 0, 0];
    const firstWeight = Number(!isControlled(first));
    const secondWeight = Number(!isControlled(second));
    const weight = firstWeight + secondWeight;
    if (!weight) return;
    const relativeSpeed = dot(subtract(second.velocity, first.velocity), normal);
    const impulse = Math.max(0, -1.83 * relativeSpeed / weight);
    for (let axis = 0; axis < 3; axis++) {
      const correction = overlap * normal[axis] / weight;
      first.position[axis] -= correction * firstWeight;
      second.position[axis] += correction * secondWeight;
      first.velocity[axis] -= impulse * normal[axis] * firstWeight;
      second.velocity[axis] += impulse * normal[axis] * secondWeight;
    }
  }

  function stepBodies(now, delta) {
    if (drag && now - drag.updated > 90) drag.body.velocity.fill(0);
    const steps = Math.max(1, Math.ceil(delta * 120));
    const dt = delta / steps;
    const damping = Math.exp(-1.35 * dt);
    const floorDamping = Math.exp(-6 * dt);
    for (let index = 0; index < steps; index++) {
      for (const body of bodies) {
        if (isControlled(body)) continue;
        body.velocity[1] += gravity * dt;
        for (let axis = 0; axis < 3; axis++) {
          body.position[axis] += body.velocity[axis] * dt;
          body.angles[axis] += body.spin[axis] * dt;
          body.velocity[axis] *= damping;
          body.spin[axis] *= damping;
        }
        constrain(body, true);
      }
      for (let first = 0; first < bodies.length; first++) {
        for (let second = first + 1; second < bodies.length; second++) collide(bodies[first], bodies[second]);
      }
      for (const body of bodies) {
        if (body === claw.held) continue;
        constrain(body, body !== drag?.body);
        if (body === drag?.body || !body.grounded || body.velocity[1] < 0) continue;
        body.velocity[0] *= floorDamping;
        body.velocity[2] *= floorDamping;
        for (let axis = 0; axis < 3; axis++) body.spin[axis] *= floorDamping;
        if (body.flatBase) {
          // Ease the base onto the floor while preserving its yaw.
          for (const axis of [0, 2]) {
            const angle = Math.atan2(Math.sin(body.angles[axis]), Math.cos(body.angles[axis]));
            body.angles[axis] = Math.abs(angle) < .008 ? 0 : angle * floorDamping;
          }
          body.position[1] = floor - verticalExtent(body);
        }
      }
    }
    moving = bodies.some(body => needsFloor(body) ||
      (!isControlled(body) && (length(body.velocity) > 2 || length(body.spin) > .025)));
    if (!moving) {
      for (const body of bodies) {
        if (!isControlled(body)) {
          body.velocity.fill(0);
          body.spin.fill(0);
        }
      }
    }
    dirty = true;
  }

  function needsFloor(body) {
    return !isControlled(body) && (!body.grounded ||
      (body.flatBase && (body.angles[0] !== 0 || body.angles[2] !== 0)));
  }

  function constrainClaw() {
    const wall = Math.max(0, (width / 2 - edge) / scaleAt(claw.z) - claw.size * 1.3);
    claw.x = clamp(claw.x, -wall, wall);
  }

  function releasePrize() {
    const body = claw.held;
    if (!body) return;
    claw.held = null;
    if (reducedMotion.matches) {
      if (body.flatBase) body.angles[0] = body.angles[2] = 0;
      body.position[1] = floor - verticalExtent(body);
    }
    constrain(body, false);
  }

  function resetClaw() {
    clawKeys.clear();
    releasePrize();
    claw.y = width ? clawHome() : 0;
    claw.opening = 1;
    claw.phase = 'idle';
    dirty = true;
  }

  function stepClaw(dt) {
    if (claw.phase === 'idle') {
      const dx = Number(clawKeys.has('ArrowRight')) - Number(clawKeys.has('ArrowLeft'));
      const dz = Number(clawKeys.has('ArrowUp')) - Number(clawKeys.has('ArrowDown'));
      const speed = Math.min(width, height) * .65 / (Math.hypot(dx, dz) || 1);
      claw.x += dx * speed * dt;
      claw.z = clamp(claw.z + dz * speed * dt, -depth, depth);
      constrainClaw();
      claw.y = clawHome();
    } else if (claw.phase === 'descending') {
      const bottom = floor - clawJaws();
      let nextY = Math.min(bottom, claw.y + height * 1.05 * dt);
      let prize = null;
      for (const body of bodies) {
        if (body === drag?.body) continue;
        const [x, y, z] = body.position;
        if (Math.hypot(claw.x - x, claw.z - z) > body.radius * .7 + claw.size * .42) continue;
        const gripY = y - verticalExtent(body, -1) + claw.size * .52 - clawJaws();
        if (gripY < claw.y - claw.size * .5 || gripY > nextY) continue;
        nextY = gripY;
        prize = body;
      }
      claw.y = Math.max(claw.y, nextY);
      if (prize || nextY === bottom) {
        claw.phase = 'closing';
        claw.held = prize;
        prize?.velocity.fill(0);
        prize?.spin.fill(0);
      }
    } else if (claw.phase === 'closing') {
      claw.opening = Math.max(0, claw.opening - dt * 6);
      if (!claw.opening) claw.phase = 'rising';
    } else if (claw.phase === 'rising') {
      const nextY = Math.max(clawHome(), claw.y - height * .8 * dt);
      if (claw.held) claw.held.position[1] += nextY - claw.y;
      claw.y = nextY;
      if (claw.y === clawHome()) claw.phase = 'opening';
    } else if (claw.phase === 'opening') {
      claw.opening = Math.min(1, claw.opening + dt * 4);
      if (claw.opening >= .55) releasePrize();
      if (claw.opening === 1) claw.phase = 'idle';
    }
    dirty = true;
  }

  function drawClaw() {
    const scale = scaleAt(claw.z);
    const unit = claw.size * scale;
    const x = width / 2 + claw.x * scale;
    const y = height / 2 + claw.y * scale;
    const chain = (claw.y - chainTop()) / claw.size;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(unit, unit);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let link = 0; .22 * link + .18 < chain; link++) {
      const center = -chain + .18 + .22 * link;
      const radius = link % 2 ? .046 : .105;
      ctx.moveTo(radius, center);
      ctx.ellipse(0, center, radius, .155, 0, 0, 2 * Math.PI);
    }
    ctx.strokeStyle = '#606c78';
    ctx.lineWidth = .067;
    ctx.stroke();
    ctx.fillStyle = '#606c78';
    ctx.fillRect(-.26, -chain - .07, .52, .14);
    ctx.fillRect(-.088, -.31, .176, .38);

    for (const side of [-1, 1]) {
      const spread = claw.opening;
      ctx.beginPath();
      ctx.moveTo(side * .28, .38);
      ctx.lineTo(side * (.68 + .44 * spread), .82);
      ctx.lineTo(side * (.60 + .50 * spread), 1.27);
      ctx.lineTo(side * (.28 + .56 * spread), 1.59);
      ctx.lineWidth = .20;
      ctx.strokeStyle = '#46515d';
      ctx.stroke();
      ctx.lineWidth = .095;
      ctx.strokeStyle = '#a6b1bc';
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(-.34, -.08);
    ctx.lineTo(.34, -.08);
    ctx.lineTo(.46, .35);
    ctx.lineTo(.28, .55);
    ctx.lineTo(-.28, .55);
    ctx.lineTo(-.46, .35);
    ctx.closePath();
    const steel = ctx.createLinearGradient(-.4, 0, .4, .5);
    steel.addColorStop(0, '#c5ced6');
    steel.addColorStop(.56, '#8c99a6');
    steel.addColorStop(1, '#667482');
    ctx.fillStyle = steel;
    ctx.fill();
    ctx.lineWidth = .05;
    ctx.strokeStyle = '#46515d';
    ctx.stroke();
    ctx.fillStyle = '#46515d';
    ctx.beginPath();
    ctx.arc(0, .25, .085, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  function render() {
    faces = [];
    for (const body of bodies) {
      const rotate = rotation(body.angles);
      const world = body.mesh.vertices.map(vertex =>
        rotate(vertex).map((value, axis) => value * body.radius + body.position[axis]));
      const points = world.map(([x, y, z]) => [width / 2 + x * scaleAt(z), height / 2 + y * scaleAt(z)]);
      const screen = curved ? points.map(([x, y]) => project(x, y)) : points;
      const left = Math.min(...screen.map(point => point[0]));
      const top = Math.min(...screen.map(point => point[1]));
      const right = Math.max(...screen.map(point => point[0]));
      const bottom = Math.max(...screen.map(point => point[1]));
      const outline = silhouette(screen).map(([x, y]) => `${x - left}px ${y - top}px`);
      Object.assign(body.target.style, {
        left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`,
        clipPath: `polygon(${outline.join(',')})`,
        visibility: body === claw.held ? 'hidden' : ''
      });
      for (const face of body.mesh.faces) {
        const [a, b, c] = face.map(index => world[index]);
        const normal = cross(subtract(b, a), subtract(c, a));
        if (dot(normal, [-a[0], -a[1], -focal - a[2]]) <= 0) continue;
        const shade = .70 + .49 * Math.max(0, dot(normal, light) / length(normal));
        const color = body.color.map(channel => Math.round(channel * shade + (1 - shade) * 18));
        faces.push({ body, color: `rgb(${color.join(',')})`, points: face.map(index => points[index]),
          screen: face.map(index => screen[index]), z: face.reduce((sum, index) => sum + world[index][2], 0) / face.length });
      }
    }
    faces.sort((a, b) => b.z - a.z);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const body of bodies) {
      const [x, y, z] = body.position;
      const scale = scaleAt(z);
      const size = body.radius * scale;
      const gap = Math.max(0, floor - y - verticalExtent(body));
      const alpha = .16 * Math.exp(-gap / body.radius);
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
    ctx.lineWidth = .85;
    ctx.lineJoin = 'round';
    for (const face of faces) {
      ctx.beginPath();
      face.points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle = face.color;
      ctx.fill();
      ctx.stroke();
    }
    if (claw.active) drawClaw();
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
    const { body } = drag;
    const [x, y] = curved ? unproject(...screen) : screen;
    const previous = body.position.slice();
    const dt = Math.max(.008, (event.timeStamp - drag.updated) / 1000);
    drag.screen = screen;
    drag.updated = event.timeStamp;
    body.position[0] = (x - width / 2) / scaleAt(body.position[2]) + drag.offset[0];
    body.position[1] = (y - height / 2) / scaleAt(body.position[2]) + drag.offset[1];
    constrain(body, false);
    if (!reducedMotion.matches) {
      const [dx, dy] = subtract(body.position, previous);
      const blend = Math.min(1, dt / .035);
      body.velocity[0] += (dx / dt - body.velocity[0]) * blend;
      body.velocity[1] += (dy / dt - body.velocity[1]) * blend;
      const speed = length(body.velocity);
      if (speed > speedLimit) body.velocity = body.velocity.map(value => value * speedLimit / speed);
      body.angles[0] -= dy / (body.radius * 2.5);
      body.angles[1] += dx / (body.radius * 2.5);
      constrain(body, false);
      body.spin[0] = -body.velocity[1] / (body.radius * 2.5);
      body.spin[1] = body.velocity[0] / (body.radius * 2.5);
      moving = true;
    }
    dirty = true;
    requestRender();
  }

  function endDrag(keepMomentum) {
    if (!drag) return;
    const { body, id } = drag;
    drag = null;
    if (!keepMomentum) {
      body.velocity.fill(0);
      body.spin.fill(0);
    }
    input.classList.remove('is-dragging');
    if (input.hasPointerCapture(id)) input.releasePointerCapture(id);
    if (visible && !reducedMotion.matches) {
      moving = true;
      requestRender();
    }
  }

  input.addEventListener('pointerdown', event => {
    if (!visible || drag || event.button !== 0) return;
    const screen = pointer(event);
    const face = faces.findLast(face => containsPoint(face.screen, screen));
    if (!face || face.body === claw.held) return;
    const { body } = face;
    const [x, y] = curved ? unproject(...screen) : screen;
    const scale = scaleAt(body.position[2]);
    body.velocity.fill(0);
    body.spin.fill(0);
    drag = { body, id: event.pointerId, screen, updated: event.timeStamp,
      offset: [body.position[0] - (x - width / 2) / scale, body.position[1] - (y - height / 2) / scale] };
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

  function stopBodies() {
    for (const body of bodies) {
      body.velocity.fill(0);
      body.spin.fill(0);
    }
    moving = false;
  }

  function stop() {
    endDrag(false);
    resetClaw();
    stopBodies();
    lastTime = 0;
  }

  const clawMoving = () => claw.active && (claw.phase !== 'idle' || clawArrows.some(key => clawKeys.has(key)));
  const bodiesMoving = () => !reducedMotion.matches && (moving || bodies.some(needsFloor));

  return {
    resize,
    stop,
    get moving() { return visible && (clawMoving() || bodiesMoving()); },
    setClawActive(value) {
      if (claw.active === value) return;
      claw.active = value;
      resetClaw();
    },
    clearClawKeys() { clawKeys.clear(); },
    handleClawKey(key, pressed, repeat = false) {
      if (key !== ' ' && !clawArrows.includes(key)) return false;
      if (!pressed) return clawKeys.delete(key);
      if (!visible || !claw.active || !width) return false;
      if (repeat || clawKeys.has(key)) return true;
      clawKeys.add(key);
      if (claw.phase === 'idle') {
        if (key === ' ') claw.phase = 'descending';
        else stepClaw(1 / 30);
      }
      requestRender();
      return true;
    },
    setVisible(value) {
      if (visible === value) return;
      visible = value;
      if (!visible) stop();
    },
    update(now) {
      if (!visible || !width) return false;
      if (moving && reducedMotion.matches) {
        endDrag(false);
        stopBodies();
      }
      if (clawMoving() || bodiesMoving()) {
        const delta = lastTime ? clamp((now - lastTime) / 1000, 0, .05) : 1 / 60;
        lastTime = now;
        if (clawMoving()) stepClaw(delta);
        if (bodiesMoving()) stepBodies(now, delta);
      }
      if (!clawMoving() && !bodiesMoving()) lastTime = 0;
      if (!dirty) return false;
      render();
      dirty = false;
      return true;
    }
  };
}
