import * as THREE from 'three';
import { feel } from '../bus';
import { tone } from '../audio';
import { CITY_FACT, giftable, greetSpot, personClick } from './common';
import { registerFolk } from './folk';
import {
  PERSON_CLEAR,
  Puppet,
  Seq,
  Sparkles,
  ball,
  box,
  cape,
  clickSpot,
  crown,
  cyl,
  mat,
  pointedHat,
  touchSpot,
  wings,
} from './kit';
import type { Interactable } from '../world';

/** I02 — Fada: wand touch opens flowers with sparkles. */
registerFolk({
  id: 'fada',
  ref: 'I02',
  group: 'fantasia',
  hw: 2.4,
  depth: 4,
  where: 'green',
  build(ctx) {
    const g = ctx.root;
    box(g, mat(0xf8f0ff), 2.2, 0.08, 2.2, 0, 0.04, -2);
    const flowers: { stem: THREE.Group; open: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const stem = new THREE.Group();
      stem.position.set(Math.cos(a) * 1.1, 0, -2 + Math.sin(a) * 1.1);
      g.add(stem);
      cyl(stem, mat(0x2f9e44), 0.03, 0.55, 0, 0.28, 0);
      const head = new THREE.Group();
      head.position.y = 0.55;
      head.scale.setScalar(0.15);
      stem.add(head);
      for (let p = 0; p < 5; p++) {
        const petal = ball(head, mat([0xff6fb5, 0xffd43b, 0x74c0fc, 0xda77f2, 0xffffff][p % 5]), 0.12, Math.cos((p / 5) * Math.PI * 2) * 0.12, 0, Math.sin((p / 5) * Math.PI * 2) * 0.12);
        petal.scale.y = 0.4;
      }
      flowers.push({ stem, open: 0 });
    }
    const fairy = new Puppet(ctx, { shirt: 0xffa8e8, pants: 0xb197fc, hair: 0xffe066, dress: true, longHair: true }, 0, -1.2);
    fairy.group.scale.setScalar(0.85);
    const w = wings(fairy.folk.body, 0xe7f5ff);
    const wand = cyl(fairy.folk.armR, mat(0xffd43b), 0.02, 0.55, 0, -0.9, 0);
    wand.rotation.x = 0.4;
    ball(fairy.folk.armR, mat(0xffffff), 0.08, 0, -1.15, 0);
    const sparks = new Sparkles(ctx.scene);
    let flutter = 0;
    const bloom = (): void => {
      fairy.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
      fairy.work('reach', 1.2);
      [1175, 1480, 1760, 2093].forEach((f, i) => tone(f, i * 0.07, 0.18, 'sine', 0.05));
      ctx.say(['Olha as flores a abrir!']);
      for (const f of flowers) f.open = 1;
      sparks.burst(ctx.at(0, -2, 0.8), 16);
      feel('play');
      if (ctx.ready('bloom')) ctx.pay(1, ctx.at(0, -1.2, 1));
    };
    return {
      things: [greetSpot(ctx, fairy, 0, -1.2, 'Sou a fada do jardim!'), personClick(ctx, fairy, 0, -1.2, bloom)],
      people: [giftable(fairy, 0, -1.2, ctx)],
      update(dt) {
        flutter += dt;
        fairy.update(dt);
        sparks.update(dt);
        w.forEach((wing, i) => {
          wing.rotation.y = (i ? 1 : -1) * (0.4 + Math.sin(flutter * 8) * 0.25);
        });
        for (const f of flowers) {
          f.open = Math.max(0, f.open - dt * 0.15);
          const s = 0.15 + f.open * 0.85;
          f.stem.children[1]?.scale.setScalar(s);
        }
        if (ctx.herDist(0, -1.2) > 8) fairy.lookAt(null);
      },
      dispose: () => sparks.clear(),
      debug: () => ({ flowers: flowers.length }),
    };
  },
});

/** I03 — Rei: she bows; he tells a city curiosity. */
registerFolk({
  id: 'rei',
  ref: 'I03',
  group: 'fantasia',
  hw: 2.6,
  depth: 4.2,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    box(g, mat(0xc92a2a), 2.8, 0.12, 1.6, 0, 0.06, -2.2);
    box(g, mat(0xffd43b), 1.4, 0.5, 1.0, 0, 0.35, -2.4); // throne seat
    box(g, mat(0xffd43b), 1.4, 1.2, 0.2, 0, 1.1, -2.85); // back
    ctx.block(-1.4, 1.4, -3.2, -1.6, 1.5);
    const king = new Puppet(ctx, { shirt: 0x364fc7, pants: 0x212529, hair: 0xf8f9fa }, 0, -2.0);
    crown(king.folk.head);
    cape(king.folk.body, 0xc92a2a, 1.15);
    const seq = new Seq();
    let bowing = false;
    const meet = (): void => {
      if (bowing || seq.busy) return;
      bowing = true;
      ctx.game.hold(true);
      const fact = CITY_FACT[ctx.city] ?? 'Cada cidade tem uma história bonita!';
      king.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
      king.wave(1.2);
      ctx.say([ctx.greeting(), fact]);
      // she bows
      ctx.player.airborne = true;
      ctx.player.root.rotation.order = 'YXZ';
      seq.after(0.05, () => {
        ctx.player.root.rotation.x = 0.45;
      });
      seq.after(1.2, () => {
        ctx.player.root.rotation.x = 0;
        ctx.player.airborne = false;
        king.bow(1.4);
      });
      seq.after(2.4, () => {
        ctx.game.hold(false);
        bowing = false;
        if (ctx.ready('fact')) ctx.pay(1, ctx.at(0, -2, 1.2));
      });
    };
    return {
      things: [touchSpot(ctx, king.group, 0, -1.5, 3.4, meet, undefined, PERSON_CLEAR)],
      people: [giftable(king, 0, -2.0, ctx)],
      update(dt) {
        king.update(dt);
        seq.update(dt);
      },
      dispose() {
        if (bowing) {
          ctx.player.root.rotation.x = 0;
          ctx.player.airborne = false;
          ctx.game.hold(false);
        }
      },
      debug: () => ({ city: ctx.city, bowing }),
    };
  },
});

/** I04 — Heróis originais: REMOVIDO (2026-11-15, pedido do Telmo).
 *  Visual confuso (capa/capacete) misturava-se com «roupa nova»; voo curto + keepClear
 *  impediam aproximar; silhueta ao longe era incompreensível. Não repor. */

/** I05 — Astronauta (planeta em pedestal): REMOVIDO (2026-11-16, pedido do Telmo).
 *  Esferas azul/laranja em pedestais brancos sobre base cinzenta — sem identidade clara,
 *  «ridículo». Não repor. (Vega, personagem jogável, mantém-se em characters.ts.) */

/** I06 — Feiticeiro: three cups, find the ball (G04 = 3 coins). */
registerFolk({
  id: 'feiticeiro',
  ref: 'I06',
  group: 'fantasia',
  hw: 2.6,
  depth: 4,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    box(g, mat(0x5c3d2e), 2.4, 0.9, 1.0, 0, 0.45, -2.0); // table
    ctx.block(-1.2, 1.2, -2.5, -1.5, 1.0);
    const wiz = new Puppet(ctx, { shirt: 0x5f3dc4, pants: 0x343a40, hair: 0xf8f9fa }, 0, -2.8);
    pointedHat(wiz.folk.head, 0x5f3dc4, 0.7, true);
    const cups = [-0.7, 0, 0.7].map((x, i) => {
      const c = cyl(g, mat(0xe8590c), 0.28, 0.42, x, 1.12, -1.85);
      return { mesh: c, x, i, up: 0 };
    });
    const ballM = ball(g, mat(0xffd43b), 0.12, 0, 0.95, -1.85);
    ballM.visible = false;
    let phase: 'idle' | 'shuffle' | 'pick' | 'reveal' = 'idle';
    let hide = 1;
    let shuffleT = 0;
    let shuffleStep = 0;
    let order = [0, 1, 2];
    const seq = new Seq();
    const sparks = new Sparkles(ctx.scene);
    const start = (): boolean => {
      if (phase !== 'idle' || !ctx.free()) return false;
      phase = 'shuffle';
      shuffleT = 0;
      shuffleStep = 0;
      hide = Math.floor(ctx.rng() * 3);
      order = [0, 1, 2];
      wiz.work('stir', 2);
      ctx.say(['Olha bem onde fica a bolinha!']);
      ballM.visible = true;
      ballM.position.set(cups[hide].x, 0.95, -1.85);
      return true;
    };
    const pick = (i: number): boolean => {
      if (phase !== 'pick') return false;
      phase = 'reveal';
      const real = order[hide];
      cups.forEach((c) => {
        c.up = 1;
      });
      ballM.visible = true;
      ballM.position.set(cups[real].x, 0.95, -1.85);
      const ok = i === real;
      if (ok) {
        wiz.hop(1.4);
        ctx.say(['Acertaste!']);
        sparks.burst(ctx.at(cups[i].x, -1.85, 1.2), 12);
        if (ctx.ready('cups')) ctx.pay(3, ctx.at(cups[i].x, -1.85, 1.2));
        feel('play');
      } else {
        wiz.shake(1.2);
        ctx.say(['Quase! Tenta outra vez mais tarde.']);
      }
      seq.after(2.2, () => {
        cups.forEach((c) => {
          c.up = 0;
        });
        ballM.visible = false;
        phase = 'idle';
      });
      return true;
    };
    return {
      things: [
        greetSpot(ctx, wiz, 0, -2.8, 'Queres ver um truque?'),
        clickSpot(ctx, g, 0, -1.6, 2.5, start, 5),
        ...cups.map((c) => clickSpot(ctx, c.mesh, c.x, -1.85, 1.2, () => pick(c.i), 6)),
      ],
      people: [giftable(wiz, 0, -2.8, ctx)],
      update(dt) {
        wiz.update(dt);
        seq.update(dt);
        sparks.update(dt);
        if (phase === 'shuffle') {
          shuffleT += dt;
          if (shuffleStep === 0 && shuffleT > 0.8) {
            ballM.visible = false;
            shuffleStep = 1;
            shuffleT = 0;
          } else if (shuffleStep >= 1 && shuffleStep <= 5) {
            if (shuffleT > 0.35) {
              shuffleT = 0;
              // swap two cups in the order
              const a = Math.floor(ctx.rng() * 3);
              let b = Math.floor(ctx.rng() * 3);
              if (b === a) b = (a + 1) % 3;
              const tmp = order[a];
              order[a] = order[b];
              order[b] = tmp;
              const xa = cups[a].x;
              cups[a].x = cups[b].x;
              cups[b].x = xa;
              cups[a].mesh.position.x = cups[a].x;
              cups[b].mesh.position.x = cups[b].x;
              shuffleStep++;
            }
          } else if (shuffleStep > 5) {
            phase = 'pick';
            ctx.say(['Onde está a bolinha?']);
          }
        }
        for (const c of cups) {
          c.mesh.position.y = 1.12 + c.up * 0.35;
        }
      },
      dispose: () => sparks.clear(),
      debug: () => ({ phase, hide, order: [...order] }),
    };
  },
});

/**
 * I07 — Aviador: paper plane. Walking up to the plane (or tapping the pilot) = he throws it: it climbs over the
 * pavement, glides down in a big spiral with a white trail and lands beside the stage. She runs to it (contact
 * picks it up: it rides in her hand) and brings it back to him = he catches it, cheers and gives a coin.
 * (Until 2026-11-19 a tap on a tiny plane did a 1.8 s hop and nothing else — "não acontece nada".)
 */
registerFolk({
  id: 'aviador',
  ref: 'I07',
  group: 'fantasia',
  hw: 2.5,
  depth: 4,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    box(g, mat(0x74c0fc), 1.6, 0.08, 1.2, 0, 0.04, -2);
    const pilot = new Puppet(ctx, { shirt: 0x2b8a3e, pants: 0x343a40, hair: 0x5c3d2e, cap: 0x2b8a3e }, 0, -1.8);
    const plane = paperPlane();
    const HAND = new THREE.Vector3(0.45, 1.25, -1.3); // stage-local, in front of his right hand
    const homePlane = (): void => {
      g.add(plane);
      plane.position.copy(HAND);
      plane.rotation.set(0, 0, 0); // nose (+Z) to the front
    };
    homePlane();
    const trail = new PlaneTrail(ctx.scene);

    // Where it lands: on the pavement beside the stage (left or right, whichever is free), else right in front.
    const isClear = (lx: number, lz: number): boolean => {
      const w = ctx.at(lx, lz);
      return !ctx.obstacles.some((o) => w.x > o.minX - 0.6 && w.x < o.maxX + 0.6 && w.z > o.minZ - 0.6 && w.z < o.maxZ + 0.6);
    };
    const R = 1.7; // spiral radius
    const sides: { s: number; c: THREE.Vector2 }[] = [];
    for (const s of [1, -1]) {
      const lx = [4.2, 3.6].find((x) => isClear(s * x, 0.6));
      if (lx !== undefined) sides.push({ s, c: new THREE.Vector2(s * lx, 0.4 + R) });
    }
    if (!sides.length) sides.push({ s: 1, c: new THREE.Vector2(0.6, 1.2 + R) }); // lands in front of the stage
    let side = sides[0];

    let mode: 'hand' | 'fly' | 'land' | 'carry' = 'hand';
    let t = 0;
    let clock = 0;
    let lastThrow = -99;
    let landedFor = 0;
    const landAt = new THREE.Vector3(); // world
    const pickPos = ctx.at(HAND.x, HAND.z); // the plane Interactable's position: moved to where it lies
    const FLY_UP = 1.0;
    const FLY_ALL = 4.8;
    const TURNS = 1.5; // starts on the road side of the centre, ends on the stage side (on the pavement)
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    /** Stage-local point of the flight at time `tt` (0…FLY_ALL). */
    const pathAt = (tt: number, out: THREE.Vector3): THREE.Vector3 => {
      const c = side.c;
      const topX = c.x;
      const topZ = c.y + R;
      if (tt < FLY_UP) {
        // quadratic bezier: his hand → up over the front → spiral entry
        const k = tt / FLY_UP;
        const a = 1 - k;
        const mx = (HAND.x + topX) / 2;
        out.set(
          a * a * HAND.x + 2 * a * k * mx + k * k * topX,
          a * a * HAND.y + 2 * a * k * 4.8 + k * k * 4.2,
          a * a * HAND.z + 2 * a * k * 1.5 + k * k * topZ,
        );
        return out;
      }
      const k = Math.min(1, (tt - FLY_UP) / (FLY_ALL - FLY_UP));
      const ang = Math.PI / 2 + side.s * k * TURNS * Math.PI * 2;
      const r = R * (1 - k * 0.15);
      out.set(c.x + Math.cos(ang) * r, 0.06 + 4.14 * (1 - k) * (1 - k * 0.35), c.y + Math.sin(ang) * r);
      return out;
    };

    const throwPlane = (): boolean => {
      if (mode !== 'hand' || !ctx.free() || clock - lastThrow < 1.5) return false;
      side = sides[Math.floor(ctx.rng() * sides.length)] ?? sides[0];
      mode = 'fly';
      t = 0;
      lastThrow = clock;
      pilot.work('reach', 0.7);
      ctx.scene.attach(plane);
      const end = pathAt(FLY_ALL, tmp);
      landAt.copy(ctx.at(end.x, end.z, 0.06));
      pickPos.set(landAt.x, 0, landAt.z);
      trail.reset();
      tone(660, 0, 0.12, 'triangle', 0.05);
      tone(990, 0.08, 0.22, 'sine', 0.04);
      ctx.say(['Lá vai ele!']);
      return true;
    };
    const pickUp = (): void => {
      if (mode !== 'land' || !ctx.free()) return;
      mode = 'carry';
      tone(784, 0, 0.1, 'triangle', 0.05);
      tone(1175, 0.08, 0.14, 'triangle', 0.05);
      ctx.say(['Apanhaste-o! Traz-mo!']);
      pilot.wave(1.2);
    };
    const backHome = (): void => {
      mode = 'hand';
      homePlane();
      pickPos.copy(ctx.at(HAND.x, HAND.z));
    };
    const giveBack = (): void => {
      backHome();
      lastThrow = clock; // a short breather before the next throw
      pilot.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
      pilot.cheer(1.6);
      feel('play');
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.16, 'triangle', 0.05));
      if (ctx.ready('plane', 90)) {
        ctx.pay(1, ctx.at(0, -1.2, 1.4));
        ctx.say(['Obrigado! Queres lançar outra vez?']);
      } else ctx.say(['Obrigado! Outra vez?']);
    };

    const planeThing: Interactable = {
      object: plane,
      position: pickPos,
      radius: 1.3,
      // walking up to it (or tapping it): in his hand = he throws it; on the ground = she picks it up
      interact: () => (mode === 'hand' ? throwPlane() : mode === 'land' ? (pickUp(), true) : false),
    };
    return {
      things: [
        greetSpot(ctx, pilot, 0, -1.8, 'Toca no meu avião de papel e ele voa!'),
        personClick(ctx, pilot, 0, -1.8, () => (mode === 'carry' ? (giveBack(), true) : throwPlane())),
        planeThing,
      ],
      people: [giftable(pilot, 0, -1.8, ctx)],
      update(dt) {
        pilot.update(dt);
        trail.update(dt);
        if (ctx.game.isPaused()) return;
        clock += dt;
        const p = ctx.game.player;
        if (mode === 'fly') {
          t += dt;
          const now = pathAt(Math.min(t, FLY_ALL), tmp);
          const w = ctx.at(now.x, now.z, now.y);
          plane.position.copy(w);
          const ahead = pathAt(Math.min(t + 0.08, FLY_ALL), tmp2);
          const wa = ctx.at(ahead.x, ahead.z, ahead.y);
          if (wa.distanceToSquared(w) > 1e-6) plane.lookAt(wa);
          if (t > FLY_UP) plane.rotateZ(side.s * 0.5 * (1 - Math.min(1, (t - FLY_UP) / (FLY_ALL - FLY_UP)))); // banks into the turn
          trail.push(w);
          pilot.lookAt(w);
          if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) tone(320 + Math.random() * 120, 0, 0.14, 'sine', 0.015); // soft swish
          if (t >= FLY_ALL) {
            mode = 'land';
            landedFor = 0;
            plane.position.copy(landAt);
            plane.rotation.set(0.06, plane.rotation.y, 0);
            pilot.cheer(1.4);
            tone(440, 0, 0.08, 'triangle', 0.04);
            ctx.say(['Uau, que voo! Vai buscá-lo!']);
          }
        } else if (mode === 'land') {
          landedFor += dt;
          if (Math.hypot(p.x - landAt.x, p.z - landAt.z) < 1.2) pickUp();
          else if (landedFor > 90) backHome(); // forgotten: it is his again
        } else if (mode === 'carry') {
          // rides in her right hand, nose forward
          const h = ctx.game.heading();
          plane.position.set(p.x + Math.cos(h) * 0.5, 1.15 + Math.sin(clock * 6) * 0.03, p.z - Math.sin(h) * 0.5);
          plane.rotation.set(0, h + Math.PI, 0);
          const d = ctx.herDist(0, -1.8);
          if (d < 2.8 && ctx.free()) giveBack();
          else if (d > 45 || ctx.game.isDriving()) backHome(); // went away with it: he has another one
        } else {
          plane.rotation.set(0, Math.sin(clock * 2) * 0.2, 0);
          plane.position.y = HAND.y + Math.sin(clock * 2.6) * 0.03;
        }
      },
      dispose: () => {
        plane.removeFromParent();
        trail.clear();
      },
      debug: () => {
        const w = plane.getWorldPosition(new THREE.Vector3());
        return { mode, land: [+landAt.x.toFixed(1), +landAt.z.toFixed(1)], plane: [+w.x.toFixed(1), +w.y.toFixed(1), +w.z.toFixed(1)] };
      },
    };
  },
});

/** A folded paper plane, ~0.9 m long so it is easy to see. Nose = +Z (Object3D.lookAt points it where it flies). */
function paperPlane(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff8fab, side: THREE.DoubleSide, roughness: 0.8 });
  const tri = (m: THREE.Material, pts: number[]): void => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    g.add(mesh);
  };
  const nose = [0, 0.02, 0.48];
  tri(white, [...nose, -0.38, 0.09, -0.4, 0, 0, -0.4]); // left wing
  tri(white, [...nose, 0, 0, -0.4, 0.38, 0.09, -0.4]); // right wing
  tri(pink, [...nose, 0, 0, -0.4, 0, -0.15, -0.32]); // keel
  return g;
}

/** White puffs left behind the flying plane, growing and fading out. */
class PlaneTrail {
  private dots: { m: THREE.Mesh; life: number }[] = [];
  private static geo = new THREE.SphereGeometry(0.07, 6, 4);
  private last = new THREE.Vector3(1e9, 0, 0);
  constructor(private readonly scene: THREE.Object3D) {}
  push(at: THREE.Vector3): void {
    if (at.distanceTo(this.last) < 0.2) return;
    this.last.copy(at);
    const m = new THREE.Mesh(PlaneTrail.geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    m.position.copy(at);
    this.scene.add(m);
    this.dots.push({ m, life: 1.8 });
  }
  update(dt: number): void {
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.life -= dt;
      (d.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(0.9, d.life * 0.55));
      d.m.scale.setScalar(1 + (1.8 - d.life) * 0.9);
      if (d.life <= 0) {
        d.m.removeFromParent();
        (d.m.material as THREE.Material).dispose();
        this.dots.splice(i, 1);
      }
    }
  }
  reset(): void {
    this.last.set(1e9, 0, 0);
  }
  clear(): void {
    for (const d of this.dots) d.m.removeFromParent();
    this.dots = [];
  }
}

/** I08 — Guardião das Estrelas: REMOVIDO (2026-11-15, pedido do Telmo).
 *  Geometria das «estrelas» + fala «Boa tarde… estrelas do céu» — aberração; não repor. */

/** I09 — Corredor: race to the next lamp (G25 = 5). */
registerFolk({
  id: 'corredor',
  ref: 'I09',
  group: 'fantasia',
  hw: 2.2,
  depth: 3.5,
  where: 'street',
  build(ctx) {
    const runner = new Puppet(ctx, { shirt: 0xff922b, pants: 0x212529, hair: 0x5c3d2e }, 0, -1.4);
    cyl(ctx.root, mat(0xffffff), 0.08, 1.2, -1.2, 0.6, -0.5); // start post
    cyl(ctx.root, mat(0xe03131), 0.08, 1.2, 1.2, 0.6, -0.5);
    let racing = false;
    let t = 0;
    let herStart = new THREE.Vector3();
    const goal = new THREE.Vector3();
    const start = (): boolean => {
      if (racing || !ctx.free()) return false;
      racing = true;
      t = 0;
      herStart.copy(ctx.game.player);
      // race ~18 m along the pavement in front of the stage
      const front = ctx.at(0, 8);
      goal.set(front.x, 0, front.z);
      runner.cheer(1.2);
      ctx.say(['À minha marca… já! Corre até ao posto vermelho!']);
      tone(880, 0, 0.1, 'square', 0.06);
      tone(1320, 0.15, 0.15, 'square', 0.06);
      return true;
    };
    return {
      things: [greetSpot(ctx, runner, 0, -1.4, 'Queres uma corrida?'), personClick(ctx, runner, 0, -1.4, start)],
      people: [giftable(runner, 0, -1.4, ctx)],
      update(dt) {
        runner.update(dt);
        if (!racing) return;
        t += dt;
        runner.work('reach', 0.3);
        // he jogs in place facing the goal
        runner.lookAt(goal);
        const d = Math.hypot(ctx.game.player.x - goal.x, ctx.game.player.z - goal.z);
        if (d < 2.2) {
          racing = false;
          runner.hop(1.5);
          feel('play');
          if (t < 12 && ctx.ready('race')) {
            ctx.pay(5, goal.clone().setY(1));
            ctx.say(['Ganhaste a corrida! Muito bem!']);
          } else ctx.say(['Boa corrida!']);
        } else if (t > 20) {
          racing = false;
          runner.wave(1.2);
          ctx.say(['Outra vez? Eu espero!']);
        }
      },
      debug: () => ({ racing, t: +t.toFixed(1), goal: [+goal.x.toFixed(1), +goal.z.toFixed(1)] }),
    };
  },
});

/** I10 — Futebolista: pass the ball back (G26 vibe). */
registerFolk({
  id: 'futebolista',
  ref: 'I10',
  group: 'fantasia',
  hw: 2.4,
  depth: 4,
  where: 'green',
  build(ctx) {
    const g = ctx.root;
    // small goal
    box(g, mat(0xffffff), 2.2, 0.1, 0.1, 0, 0.05, -3.2);
    box(g, mat(0xffffff), 0.1, 1.4, 0.1, -1.1, 0.7, -3.2);
    box(g, mat(0xffffff), 0.1, 1.4, 0.1, 1.1, 0.7, -3.2);
    box(g, mat(0xffffff), 2.2, 0.1, 0.1, 0, 1.4, -3.2);
    ctx.block(-1.2, 1.2, -3.4, -3.0, 1.5);
    const player = new Puppet(ctx, { shirt: 0x2f9e44, pants: 0xffffff, hair: 0x5c3d2e }, 0, -1.6);
    const ballM = ball(g, mat(0xf8f9fa), 0.22, 0, 0.22, -0.8);
    ball(ballM, mat(0x212529), 0.06, 0.12, 0.08, 0.1);
    let mode: 'wait' | 'toHer' | 'toHim' = 'wait';
    let t = 0;
    let from = new THREE.Vector3();
    let to = new THREE.Vector3();
    const pass = (): boolean => {
      if (mode !== 'wait' || !ctx.free()) return false;
      mode = 'toHer';
      t = 0;
      from.copy(ctx.at(0, -0.8, 0.22));
      to.set(ctx.game.player.x, 0.22, ctx.game.player.z);
      player.work('reach', 0.8);
      ctx.say(['Toma a bola! Chuta de volta!']);
      tone(400, 0, 0.08, 'triangle', 0.06);
      return true;
    };
    const kickBack = (): void => {
      if (mode !== 'toHer') return;
      const d = Math.hypot(ctx.game.player.x - ballM.getWorldPosition(new THREE.Vector3()).x, ctx.game.player.z - ballM.getWorldPosition(new THREE.Vector3()).z);
      if (d > 2.2) return;
      mode = 'toHim';
      t = 0;
      from.copy(ballM.getWorldPosition(new THREE.Vector3()));
      to.copy(ctx.at(0, -1.6, 0.22));
      tone(360, 0, 0.1, 'triangle', 0.06);
    };
    return {
      things: [
        greetSpot(ctx, player, 0, -1.6, 'Vamos passar a bola?'),
        clickSpot(ctx, ballM, 0, -0.8, 2.2, () => (mode === 'wait' ? pass() : (kickBack(), true)), 5),
        touchSpot(ctx, ballM, 0, -0.8, 2.0, kickBack),
      ],
      people: [giftable(player, 0, -1.6, ctx)],
      update(dt) {
        player.update(dt);
        if (mode === 'wait') {
          ballM.position.set(0, 0.22, -0.8);
          return;
        }
        t += dt;
        const k = Math.min(1, t / 0.7);
        const a = Math.sin(k * Math.PI) * 1.2;
        const p = from.clone().lerp(to, k);
        p.y = 0.22 + a;
        // convert world to local for ball under root
        const local = ctx.root.worldToLocal(p.clone());
        ballM.position.copy(local);
        ballM.rotation.x += dt * 8;
        if (k >= 1) {
          if (mode === 'toHim') {
            mode = 'wait';
            player.hop(1.2);
            feel('play');
            if (ctx.ready('ball')) ctx.pay(2, ctx.at(0, -1.6, 1));
            ctx.say(['Que belo passe!']);
          }
        }
      },
      debug: () => ({ mode }),
    };
  },
});
