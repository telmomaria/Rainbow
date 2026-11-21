import * as THREE from 'three';
import { tone } from '../audio';
import { giftable, personClick } from './common';
import { registerFolk } from './folk';
import { PERSON_CLEAR, Puppet, Sparkles, ball, beard, box, cyl, helmet, mat, touchSpot } from './kit';

/**
 * Pescador (Reiquiavique only, Telmo 2026-11-21): a fisherman in a yellow raincoat on a little wooden pier over a
 * pond, out on one side of the city. He fishes by himself (cast → the float bobs → it dips → he reels in a fish,
 * shows it and drops it in his bucket). When she walks up he greets her and pulls one out for her to see.
 * Tapping him = her turn: the float dips, she taps again and the fish is hers (+1 coin the first time).
 */

// pond (stage-local): an oval of water at the back of the stage
const POND = { x: -0.2, z: -4.9, rx: 3.0, rz: 2.4 };
// pier: from the bank out over the water; he stands near its end
const PIER = { x: 1.0, w: 1.2, z0: -1.6, z1: -4.4, top: 0.3 };
const MAN = { x: 1.0, z: -3.75 };
const FLOAT_AT = new THREE.Vector3(-0.35, 0.06, -6.0); // where the float sits on the water
const BUCKET = { x: 1.3, z: -2.05 };
const STAND = { x: 1.0, z: -0.6 }; // where she stands (in front of the pier, on the grass)
const FACE_WATER = 0.45; // local heading: looking out over the pond
const ROD_REST = -1.05;
const ROD_UP = -0.6; // rod held up and out: the fish dangles in front of him

type State = 'wait' | 'bite' | 'reel' | 'show' | 'drop' | 'cast';

function fishMesh(): THREE.Group {
  const f = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x9fb8cc, metalness: 0.35, roughness: 0.35 }));
  body.scale.set(0.09, 0.26, 0.06); // long along Y: it hangs head down from the line
  f.add(body);
  const back = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), mat(0x3b6e8f));
  back.scale.set(0.05, 0.2, 0.065);
  back.position.set(0, 0.01, -0.012);
  f.add(back);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.14, 4), mat(0x5c8fb0));
  tail.position.y = 0.3;
  tail.scale.z = 0.25;
  f.add(tail);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), mat(0x111111));
    eye.position.set(s * 0.06, -0.17, 0.02);
    f.add(eye);
  }
  return f;
}

registerFolk({
  id: 'pescador',
  ref: 'P01',
  group: 'profissao',
  onlyIn: ['Reiquiavique'],
  extra: true,
  edge: true,
  hw: 3.6,
  depth: 7.6,
  where: 'green',
  build(ctx) {
    const g = ctx.root;
    // --- the pond: a darker muddy rim, the water, stones round the edge and a few reeds
    const rim = new THREE.Mesh(new THREE.CircleGeometry(1, 32), mat(0x6b5a45));
    rim.rotation.x = -Math.PI / 2;
    rim.scale.set(POND.rx + 0.35, POND.rz + 0.35, 1);
    rim.position.set(POND.x, 0.025, POND.z);
    rim.receiveShadow = true;
    g.add(rim);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x2f75a6, roughness: 0.15, metalness: 0.2 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 32), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.scale.set(POND.rx, POND.rz, 1);
    water.position.set(POND.x, 0.04, POND.z);
    water.receiveShadow = true;
    g.add(water);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      const x = POND.x + Math.cos(a) * (POND.rx + 0.3);
      const z = POND.z + Math.sin(a) * (POND.rz + 0.3);
      if (Math.abs(x - PIER.x) < 0.8 && z > POND.z) continue; // leave the pier's way free
      const st = ball(g, mat(i % 2 ? 0x868e96 : 0xadb5bd), 0.16 + ctx.rng() * 0.1, x, 0.06, z);
      st.scale.y *= 0.55;
    }
    for (const [x, z] of [[-2.9, -4.2], [-2.7, -3.7], [-3.0, -5.3]] as const) {
      for (let k = 0; k < 4; k++) {
        const reed = cyl(g, mat(0x5c940d), 0.025, 0.9 + k * 0.12, x + (k % 2) * 0.12 - 0.06, 0.45 + k * 0.06, z + (k - 1.5) * 0.08);
        reed.rotation.z = (k - 1.5) * 0.12;
      }
    }
    ctx.block(POND.x - POND.rx, POND.x + POND.rx, POND.z - POND.rz, POND.z + POND.rz * 0.75, 0.3); // she can't walk into the water

    // --- the pier: planks on posts
    const wood = mat(0x9c6b43);
    const plankN = 9;
    for (let i = 0; i < plankN; i++) {
      const z = PIER.z0 - 0.15 - (i * (PIER.z0 - PIER.z1 - 0.3)) / (plankN - 1);
      box(g, i % 2 ? wood : mat(0x8a5a35), PIER.w, 0.07, 0.29, PIER.x, PIER.top - 0.035, z);
    }
    for (const sx of [-1, 1]) {
      for (const z of [PIER.z0 - 0.1, (PIER.z0 + PIER.z1) / 2, PIER.z1 + 0.1]) cyl(g, mat(0x5c3d2e), 0.07, 0.55, PIER.x + sx * (PIER.w / 2 - 0.07), 0.2, z);
    }
    ctx.block(PIER.x - PIER.w / 2, PIER.x + PIER.w / 2, PIER.z1, PIER.z0, 0.4);

    // --- the bucket (fish tails poke out as he catches more)
    const bucket = new THREE.Group();
    bucket.position.set(BUCKET.x, PIER.top, BUCKET.z);
    g.add(bucket);
    cyl(bucket, mat(0x1c7ed6), 0.2, 0.34, 0, 0.17, 0);
    cyl(bucket, mat(0x0b4f8a), 0.18, 0.02, 0, 0.345, 0);
    const tails: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 4), mat(0x5c8fb0));
      t.position.set(-0.07 + i * 0.07, 0.4, (i - 1) * 0.05);
      t.rotation.z = (i - 1) * 0.4;
      t.scale.z = 0.3;
      t.visible = false;
      bucket.add(t);
      tails.push(t);
    }
    let inBucket = 0;

    // --- the fisherman: yellow raincoat, rain hat, grey beard; he stands on the pier (a holder lifts him)
    const holder = new THREE.Group();
    holder.position.y = PIER.top;
    g.add(holder);
    const man = new Puppet(ctx, { shirt: 0xfcc419, pants: 0x1c3d5a, skin: 0xf1c7a5, hair: 0x868e96 }, MAN.x, MAN.z, FACE_WATER);
    holder.add(man.group);
    helmet(man.folk.head, 0xfab005, true);
    beard(man.folk.head, 0xced4da, 0.28);
    // rod: pivot near his right hand, pointing up and out over the water
    const rod = new THREE.Group();
    rod.position.set(0.36, 1.25, -0.3);
    rod.rotation.x = ROD_REST;
    man.group.add(rod);
    const ROD_LEN = 2.6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.035, ROD_LEN, 6), mat(0x343a40));
    pole.position.y = ROD_LEN / 2 - 0.35;
    rod.add(pole);
    cyl(rod, mat(0xadb5bd), 0.06, 0.08, 0.05, 0.05, 0); // the reel
    const tip = new THREE.Object3D();
    tip.position.y = ROD_LEN - 0.35;
    rod.add(tip);

    // float (red top, white bottom) and the fishing line from the rod tip to it
    const float = new THREE.Group();
    ball(float, mat(0xe03131), 0.075, 0, 0.04, 0);
    ball(float, mat(0xffffff), 0.065, 0, -0.03, 0);
    float.position.copy(FLOAT_AT);
    g.add(float);
    const fish = fishMesh();
    fish.scale.setScalar(1.6);
    fish.visible = false;
    float.add(fish);
    fish.position.y = -0.36;
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf8f9fa }));
    line.frustumCulled = false;
    g.add(line);

    // ripples on the water (a small pool of rings)
    const ripples = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      g.add(m);
      return { m, t: 9 };
    });
    let nextRipple = 0;
    const ripple = (x: number, z: number): void => {
      const r = ripples[nextRipple++ % ripples.length];
      r.m.position.set(x, 0.06, z);
      r.t = 0;
      r.m.visible = true;
    };
    const sparks = new Sparkles(ctx.scene);
    const splash = (big: boolean): void => {
      ripple(float.position.x, float.position.z);
      sparks.burst(ctx.at(float.position.x, float.position.z, 0.15), big ? 14 : 6, [0xffffff, 0xa5d8ff, 0x74c0fc], big ? 2.4 : 1.4);
      tone(big ? 300 : 520, 0, 0.14, 'sine', 0.08);
      tone(big ? 190 : 380, 0.03, 0.2, 'triangle', 0.06);
      if (big) tone(640, 0.06, 0.08, 'sine', 0.04);
    };
    const happy = (): void => [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.09, 0.16, 'triangle', 0.06));

    // --- what is going on
    let state: State = 'wait';
    let t = 0;
    let waitFor = 4 + ctx.rng() * 4;
    let time = 0;
    let turnBack = 0; // seconds until he looks back at the water after greeting her
    let herTurn = false; // she asked to try: the next bite is hers
    let forHer = false; // the fish on the line is hers
    let catches = 0;
    let herCatches = 0;
    const tipLocal = new THREE.Vector3();
    const castFrom = new THREE.Vector3();
    const go = (s: State): void => {
      state = s;
      t = 0;
    };

    const greet = (): void => {
      man.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
      man.wave(1.3);
      turnBack = 1.6;
      ctx.say([ctx.greeting(), 'Olha que peixe! Aqui em Reiquiavique toda a gente adora peixe!']);
      // a fish for her to see: the float dips right away
      if (state === 'wait') waitFor = Math.min(waitFor, t + 1.4);
    };
    const tryIt = (): boolean => {
      if (!ctx.free()) return false;
      if (state === 'bite') {
        // she pulled while the float was under: the fish is hers
        forHer = true;
        herTurn = false;
        go('reel');
        splash(true);
        return true;
      }
      if (herTurn) return true; // already her turn: wait for the float to dip
      herTurn = true; // if he is busy, her bite comes right after his next cast
      man.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
      man.nod(1);
      turnBack = 1.2;
      if (state === 'wait') waitFor = t + 2.5;
      ctx.say(['Queres tentar? Toca quando a boia afundar!']);
      return true;
    };

    const tmpW = new THREE.Vector3();
    const tipNow = (): THREE.Vector3 => g.worldToLocal(tip.getWorldPosition(tmpW)).clone();

    return {
      things: [
        touchSpot(ctx, man.group, STAND.x, STAND.z, 3.6, greet, undefined, PERSON_CLEAR),
        personClick(ctx, man, STAND.x, STAND.z, tryIt, 2.6, 7),
      ],
      people: [giftable(man, MAN.x, MAN.z, ctx)],
      update(dt) {
        time += dt;
        t += dt;
        man.update(dt);
        sparks.update(dt);
        if (turnBack > 0 && (turnBack -= dt) <= 0) man.lookAt(null);
        // holding the rod: right arm forward while he is not waving / hopping
        if (!man.busy) man.folk.armR.rotation.x = -0.75;

        let rodX = ROD_REST;
        const bob = Math.sin(time * 2.1) * 0.02;
        if (state === 'wait') {
          float.position.set(FLOAT_AT.x, FLOAT_AT.y + bob, FLOAT_AT.z);
          if (t >= waitFor) {
            go('bite');
            tone(700, 0, 0.05, 'sine', 0.04);
          }
        } else if (state === 'bite') {
          // the float jerks under: something is pulling
          float.position.set(FLOAT_AT.x, FLOAT_AT.y - Math.abs(Math.sin(t * 13)) * 0.09, FLOAT_AT.z);
          if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
            ripple(FLOAT_AT.x, FLOAT_AT.z);
            tone(620 + Math.random() * 160, 0, 0.04, 'sine', 0.03);
          }
          rodX = ROD_REST - Math.sin(t * 13) * 0.04;
          if (herTurn) {
            if (t >= 3.2) {
              // too slow: the fish got away (kindly)
              herTurn = false;
              man.shake(1);
              ctx.say(['Fugiu! Tenta outra vez.']);
              go('wait');
              waitFor = 6 + ctx.rng() * 4;
            }
          } else if (t >= 0.9) {
            go('reel');
            splash(true);
          }
        } else if (state === 'reel') {
          const k = Math.min(1, t / 1.0);
          rodX = ROD_REST + (ROD_UP - ROD_REST) * k;
          fish.visible = true;
          fish.rotation.z = Math.sin(time * 18) * 0.5;
          // the float + fish come up out of the water to hang under the rod tip
          rod.rotation.x = rodX;
          const tp = tipNow();
          const hang = new THREE.Vector3(tp.x, tp.y - 0.7, tp.z);
          float.position.lerpVectors(FLOAT_AT, hang, k * k);
          float.position.y += Math.sin(k * Math.PI) * 0.6;
          if (Math.floor(t * 12) !== Math.floor((t - dt) * 12)) tone(1700, 0, 0.025, 'square', 0.015); // reel clicks
          if (t >= 1.0) {
            go('show');
            // he turns round to show it to her (if she is near)
            if (ctx.herDist(MAN.x, MAN.z) < 12) {
              man.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
              turnBack = 0;
            }
            happy();
            if (forHer) {
              herCatches++;
            } else {
              catches++;
              man.cheer(1.2);
            }
          }
        } else if (state === 'show') {
          rodX = ROD_UP;
          rod.rotation.x = rodX;
          const tp = tipNow();
          float.position.set(tp.x, tp.y - 0.7 + Math.sin(time * 5) * 0.04, tp.z);
          fish.rotation.z = Math.sin(time * 14) * 0.6; // it wriggles
          if (forHer && t >= 0.6) {
            // her fish flies over to her, then a coin the first time
            fish.visible = false;
            const from = ctx.at(float.position.x, float.position.z, float.position.y - 0.3);
            const p = ctx.game.player;
            const flying = fishMesh();
            flying.scale.setScalar(1.4);
            ctx.fly.send(flying, from, () => new THREE.Vector3(p.x, 1.2, p.z), 0.8, 0, () => {
              sparks.burst(new THREE.Vector3(p.x, 1.4, p.z), 12);
              happy();
              if (ctx.ready('peixe', 1e9)) ctx.pay(1, new THREE.Vector3(p.x, 1.6, p.z));
            });
            ctx.say(['Boa! Apanhaste um peixinho!']);
            man.cheer(1.4);
            forHer = false;
            turnBack = 1.2;
            go('cast');
          } else if (t >= 2.4) {
            go('drop');
            man.lookAt(null);
          }
        } else if (state === 'drop') {
          // the fish goes into the bucket
          const k = Math.min(1, t / 0.6);
          rodX = ROD_UP + (ROD_REST - ROD_UP) * k * 0.4;
          rod.rotation.x = rodX;
          const tp = tipNow();
          const target = new THREE.Vector3(BUCKET.x, PIER.top + 0.75, BUCKET.z);
          float.position.lerpVectors(new THREE.Vector3(tp.x, tp.y - 0.7, tp.z), target, k);
          if (t >= 0.6) {
            fish.visible = false;
            inBucket = Math.min(3, inBucket + 1);
            tails.forEach((m, i) => (m.visible = i < inBucket));
            tone(260, 0, 0.1, 'sine', 0.05); // plop in the bucket
            go('cast');
          }
        } else if (state === 'cast') {
          // rod back, then a whip forward: the float flies out and lands with a plop
          if (t < 0.4) rodX = ROD_UP + (0.25 - ROD_UP) * (t / 0.4);
          else if (t < 0.7) rodX = 0.25 + (ROD_REST - 0.1 - 0.25) * ((t - 0.4) / 0.3);
          else rodX = ROD_REST - 0.1 * (1 - Math.min(1, (t - 0.7) / 0.4));
          rod.rotation.x = rodX;
          if (t < 0.45) {
            const tp = tipNow();
            float.position.set(tp.x, tp.y - 0.5, tp.z);
            castFrom.copy(float.position);
          } else {
            const k = Math.min(1, (t - 0.45) / 0.75);
            float.position.lerpVectors(castFrom, FLOAT_AT, k);
            float.position.y += Math.sin(k * Math.PI) * 1.4;
            if (k >= 1) {
              splash(false);
              go('wait');
              waitFor = herTurn ? 2 : 7 + ctx.rng() * 6;
            }
          }
        }
        rod.rotation.x = rodX;

        // the line: rod tip → float
        tip.getWorldPosition(tmpW);
        g.worldToLocal(tipLocal.copy(tmpW));
        const pos = lineGeo.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, tipLocal.x, tipLocal.y, tipLocal.z);
        pos.setXYZ(1, float.position.x, float.position.y + 0.08, float.position.z);
        pos.needsUpdate = true;

        for (const r of ripples) {
          if (!r.m.visible) continue;
          r.t += dt;
          const s = 0.1 + r.t * 0.7;
          r.m.scale.set(s, s, 1);
          (r.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - r.t * 0.6);
          if (r.t > 1.2) r.m.visible = false;
        }
      },
      dispose() {
        sparks.clear();
      },
      debug: () => ({ state, catches, herCatches, herTurn, inBucket }),
    };
  },
});
