import {
  Body, Cylinder, HingeConstraint, PointToPointConstraint, Quaternion, Sphere, Vec3
} from './vendor/cannon-es.js';

const linkSpacing = .39;
const linkEnd = new Vec3(0, linkSpacing / 2, 0);
const linkStart = linkEnd.negate();
const hubMount = new Vec3(0, -.37, 0);
const openAngle = -.62;
const jawOutline = [
  new Vec3(), new Vec3(.87, .35, 0), new Vec3(.96, 1.34, 0),
  new Vec3(.47, 2.43, 0), new Vec3(-.19, 3.01, 0)
];
const jawWidths = [.16, .17, .15, .12, .083];
const jawCenter = new Vec3(.55, 1.40, 0);
const limit = (value, min, max) => Math.max(min, Math.min(value, max));

function makeLink() {
  const sides = 10;
  const tubeSides = 5;
  const vertices = [];
  const faces = [];
  const offsets = [];
  for (let i = 0; i < sides; i++) {
    const angle = i * 2 * Math.PI / sides;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const center = new Vec3(.122 * x, .227 * y, 0);
    const outward = new Vec3(x / .122, y / .227, 0).unit();
    offsets.push(center);
    for (let j = 0; j < tubeSides; j++) {
      const turn = j * 2 * Math.PI / tubeSides;
      const next = (j + 1) % tubeSides;
      const tip = center.addScaledVector(.049 * Math.cos(turn), outward);
      tip.z = .049 * Math.sin(turn);
      vertices.push(tip.toArray());
      const a = i * tubeSides;
      const b = ((i + 1) % sides) * tubeSides;
      faces.push([a + j, b + j, b + next, a + next]);
    }
  }
  return { mesh: { vertices, faces }, offsets };
}

function makeCylinder(mesh, rigid, start, end, startWidth, endWidth, sides, collision = true) {
  const axis = end.vsub(start);
  const shape = new Cylinder(endWidth, startWidth, axis.length(), sides);
  const orientation = new Quaternion().setFromVectors(Vec3.UNIT_Y, axis.unit());
  const center = start.addScaledVector(.5, axis);
  if (collision) rigid.addShape(shape, center, orientation);
  const offset = mesh.vertices.length;
  mesh.vertices.push(...shape.vertices.map(vertex => orientation.vmult(vertex).vadd(center).toArray()));
  mesh.faces.push(...shape.faces.map(face => face.map(index => index + offset)));
}

const link = makeLink();

export function createClaw(world, { floor, homeLength, position, anchorY, limits, depth, speed, material }) {
  const visuals = new Set();
  const bodies = new Set();
  const constraints = new Set();
  const links = [];
  const fingers = [];
  let length = Math.max(homeLength, linkSpacing);
  let reelSpeed = 0;
  let phase = 'idle';
  let releaseRequested = false;
  let wait = 0;
  let movingFor = 0;
  let reelJoint;

  const canSteer = () => phase === 'idle' || phase === 'holding';

  function addBody(options) {
    const body = new Body({
      material, allowSleep: false, collisionFilterGroup: 2, collisionFilterMask: ~2,
      linearDamping: .74, angularDamping: .92, ...options
    });
    world.addBody(body);
    bodies.add(body);
    return body;
  }

  function addJoint(joint) {
    joint.collideConnected = false;
    world.addConstraint(joint);
    constraints.add(joint);
    return joint;
  }

  function removeJoint(joint) {
    world.removeConstraint(joint);
    constraints.delete(joint);
  }

  function addVisual(rigid, color, mesh = { vertices: [], faces: [] }) {
    const visual = { mesh, rigid, color };
    visuals.add(visual);
    return visual;
  }

  const trolley = addBody({
    type: Body.KINEMATIC, position: new Vec3(position.x, anchorY(position.z), position.z)
  });
  const trolleyMesh = addVisual(trolley, [106, 125, 143]).mesh;
  makeCylinder(trolleyMesh, trolley, new Vec3(0, -.26, 0), new Vec3(0, -.02, 0), .40, .32, 10, false);
  makeCylinder(trolleyMesh, trolley, new Vec3(0, -.04, 0), new Vec3(0, linkSpacing, 0), .17, .12, 8, false);

  function addLink(center, orientation) {
    const rigid = addBody({ mass: .40, position: center, quaternion: orientation });
    for (const offset of link.offsets) rigid.addShape(new Sphere(.063), offset);
    return { rigid, visual: addVisual(rigid, [122, 139, 155], link.mesh), below: null };
  }

  function connectLinks(upper, lower) {
    upper.below = addJoint(new PointToPointConstraint(upper.rigid, linkEnd, lower.rigid, linkStart));
  }

  const home = length;
  const count = Math.max(1, Math.floor(length / linkSpacing));
  for (let i = 0; i < count; i++) {
    const center = trolley.position.vadd(new Vec3(0, length - (count - i - .5) * linkSpacing, 0));
    const orientation = new Quaternion().setFromAxisAngle(Vec3.UNIT_Y, i % 2 * Math.PI / 2);
    const next = addLink(center, orientation);
    if (i > 0) connectLinks(links[i - 1], next);
    links.push(next);
  }

  function connectReel() {
    if (reelJoint) removeJoint(reelJoint);
    const guide = new Vec3(0, length - links.length * linkSpacing, 0);
    reelJoint = addJoint(new PointToPointConstraint(trolley, guide, links[0].rigid, linkStart));
  }

  connectReel();

  const hub = addBody({
    mass: 1.6, position: trolley.position.vadd(new Vec3(0, length - hubMount.y, 0))
  });
  const hubMesh = addVisual(hub, [139, 157, 176]).mesh;
  makeCylinder(hubMesh, hub, new Vec3(0, -.38, 0), new Vec3(0, -.16, 0), .15, .24, 10);
  makeCylinder(hubMesh, hub, new Vec3(0, -.17, 0), new Vec3(0, .04, 0), .36, .55, 12);
  makeCylinder(hubMesh, hub, new Vec3(0, .04, 0), new Vec3(0, .28, 0), .55, .425, 12);
  addJoint(new PointToPointConstraint(links.at(-1).rigid, linkEnd, hub, hubMount));

  for (let i = 0; i < 3; i++) {
    const yaw = new Quaternion().setFromAxisAngle(Vec3.UNIT_Y, -Math.PI / 4 + i * 2 * Math.PI / 3);
    const orientation = yaw.mult(new Quaternion().setFromAxisAngle(Vec3.UNIT_Z, openAngle));
    const pivot = yaw.vmult(new Vec3(.45, .18, 0));
    const rigid = addBody({
      mass: .52, position: hub.position.vadd(pivot).vadd(orientation.vmult(jawCenter)), quaternion: orientation
    });
    const mesh = addVisual(rigid, [154, 171, 185]).mesh;
    for (let j = 1; j < jawOutline.length; j++) {
      const first = jawOutline[j - 1].vsub(jawCenter);
      const next = jawOutline[j].vsub(jawCenter);
      makeCylinder(mesh, rigid, first, next, jawWidths[j - 1], jawWidths[j], 7);
      rigid.addShape(new Sphere(jawWidths[j]), next);
    }
    const axle = yaw.vmult(Vec3.UNIT_Z);
    const radial = yaw.vmult(Vec3.UNIT_X);
    const hinge = addJoint(new HingeConstraint(hub, rigid, {
      pivotA: pivot, pivotB: jawCenter.negate(), axisA: axle, axisB: Vec3.UNIT_Z
    }));
    hinge.enableMotor();
    fingers.push({ rigid, hinge, axle, radial });
  }

  function wind(nextLength) {
    length = nextLength;
    const count = Math.max(1, Math.floor(length / linkSpacing));
    if (count > links.length) {
      const first = links[0];
      const joint = first.rigid.pointToWorldFrame(linkStart);
      const axis = first.rigid.vectorToWorldFrame(Vec3.UNIT_Y);
      const orientation = new Quaternion().setFromAxisAngle(axis, Math.PI / 2).mult(first.rigid.quaternion);
      const center = joint.addScaledVector(-linkSpacing / 2, axis);
      const next = addLink(center, orientation);
      next.rigid.velocity.copy(first.rigid.velocity);
      next.rigid.angularVelocity.copy(first.rigid.angularVelocity);
      connectLinks(next, first);
      links.unshift(next);
      connectReel();
    } else if (count < links.length) {
      const first = links.shift();
      removeJoint(first.below);
      connectReel();
      world.removeBody(first.rigid);
      bodies.delete(first.rigid);
      visuals.delete(first.visual);
    }
    // The partial link travels inside the reel guide before entering the chain.
    reelJoint.pivotA.y = length - links.length * linkSpacing;
  }

  function moveTrolley(dt, dx, dz) {
    const distance = speed * dt / Math.max(1, Math.hypot(dx, dz));
    const z = limit(trolley.position.z + dz * distance, -depth, depth);
    const edge = limits(z);
    const x = limit(trolley.position.x + dx * distance, -edge, edge);
    trolley.velocity.set((x - trolley.position.x) / dt, (anchorY(z) - trolley.position.y) / dt,
      (z - trolley.position.z) / dt);
    if (trolley.velocity.lengthSquared() > .001) movingFor = .35;
  }

  function reelToward(target, dt, maxSpeed) {
    const distance = target - length;
    const acceleration = 25;
    const speed = Math.min(maxSpeed, Math.sqrt(2 * acceleration * Math.abs(distance)));
    reelSpeed = Math.min(reelSpeed + acceleration * dt, speed);
    if (reelSpeed * dt >= Math.abs(distance)) {
      wind(target);
      reelSpeed = 0;
    } else {
      wind(length + Math.sign(distance) * reelSpeed * dt);
    }
  }

  function wakeSleepingPrizes() {
    // A suspended prize can fall asleep while held and needs to wake to fall.
    for (const body of world.bodies) {
      if (body.sleepState === Body.SLEEPING) body.wakeUp();
    }
  }

  function open() {
    phase = 'opening';
    wait = .5;
    wakeSleepingPrizes();
  }

  function update(dt, dx, dz) {
    if (!dt) return;
    movingFor = Math.max(0, movingFor - dt);
    const steer = canSteer();
    moveTrolley(dt, steer ? dx : 0, steer ? dz : 0);
    let target = openAngle;
    if (phase === 'descending') {
      const bottom = Math.max(home, floor - 3.78 + hubMount.y - trolley.position.y);
      reelToward(bottom, dt, 10);
      if (length >= bottom) {
        phase = 'closing';
        wait = .58;
      }
    } else if (phase === 'closing') {
      target = 0;
      wait -= dt;
      if (wait <= 0) phase = 'rising';
    } else if (phase === 'rising') {
      target = 0;
      reelToward(home, dt, 8);
      if (length <= home) {
        if (releaseRequested) open();
        else phase = 'holding';
      }
    } else if (phase === 'holding') {
      target = 0;
    } else if (phase === 'opening') {
      wait -= dt;
      if (wait <= 0) {
        phase = 'idle';
        movingFor = .35;
      }
    }
    for (const finger of fingers) {
      const radial = hub.vectorToWorldFrame(finger.radial);
      const axle = hub.vectorToWorldFrame(finger.axle);
      const direction = finger.rigid.vectorToWorldFrame(Vec3.UNIT_X);
      const angle = Math.atan2(axle.dot(radial.cross(direction)), radial.dot(direction));
      finger.hinge.setMotorSpeed(limit((angle - target) * 14, -6, 6));
      // Cannon's solver caps impulse per substep, so scale the torque by time.
      finger.hinge.setMotorMaxForce((target === 0 ? 58 : 42) * dt);
    }
  }

  return {
    visuals,
    update,
    toggleGrab() {
      if (phase === 'idle') {
        phase = 'descending';
        releaseRequested = false;
      } else if (phase === 'holding') {
        open();
      } else if (phase !== 'opening') {
        releaseRequested = true;
      }
    },
    get moving() {
      return !canSteer() || movingFor > 0 || hub.velocity.lengthSquared() > .004 ||
        hub.angularVelocity.lengthSquared() > .01;
    },
    get position() { return trolley.position; },
    dispose() {
      if (phase === 'holding') wakeSleepingPrizes();
      for (const joint of constraints) world.removeConstraint(joint);
      for (const body of bodies) world.removeBody(body);
      constraints.clear();
      bodies.clear();
      visuals.clear();
    }
  };
}
