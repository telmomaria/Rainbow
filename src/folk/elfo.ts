import * as THREE from 'three';
import { tone } from '../audio';
import { coinMesh } from '../places';
import { registerFolk } from './folk';
import { PERSON_CLEAR, Puppet, Sparkles, ball, box, cyl, mat, pointedHat, touchSpot } from './kit';

/**
 * I01 — Elfo: says good morning in rhyme and points to where a coin is hidden (behind his bush).
 * (Also the worked example for the other characters: stage, person, greeting on approach, a small reward.)
 */
const RHYMES: Record<string, string> = {
  'Bom dia!': 'Bom dia, bom dia! Que bela alegria!',
  'Boa tarde!': 'Boa tarde, boa tarde! O sol ainda arde!',
  'Boa noite!': 'Boa noite, lua cheia! Já se acende a candeia!',
};

registerFolk({
  id: 'elfo',
  ref: 'I01',
  group: 'fantasia',
  hw: 2.5,
  depth: 4,
  where: 'green',
  build(ctx) {
    const g = ctx.root;
    // --- stage: a tree stump house with a red mushroom roof, and a round bush on the left
    cyl(g, mat(0x9c6b43), 0.8, 1.1, 1.3, 0.55, -2.8);
    const roof = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe03131));
    roof.position.set(1.3, 1.1, -2.8);
    roof.scale.y = 0.7;
    roof.castShadow = true;
    g.add(roof);
    for (const [x, y, z] of [[0.9, 1.6, -2.2], [1.8, 1.55, -2.5], [1.3, 1.85, -2.9], [0.7, 1.45, -3.2]]) ball(g, mat(0xffffff), 0.13, x, y, z);
    box(g, mat(0x5c3d2e), 0.4, 0.7, 0.06, 1.3, 0.35, -1.98); // little door
    ctx.block(0.5, 2.1, -3.6, -2); // the stump is solid
    const BUSH = { x: -1.5, z: -2.6 };
    for (const [dx, dy, dz, r] of [[0, 0.5, 0, 0.7], [0.5, 0.4, 0.2, 0.5], [-0.45, 0.4, -0.1, 0.5], [0.1, 0.85, -0.1, 0.45]]) ball(g, mat(0x2f9e44), r, BUSH.x + dx, dy, BUSH.z + dz);
    ctx.block(BUSH.x - 0.6, BUSH.x + 0.6, BUSH.z - 0.5, BUSH.z + 0.5, 1.2);

    // --- the elf: small, green, pointed hat and pointed ears
    const SKIN = 0xf1c27d;
    const elf = new Puppet(ctx, { shirt: 0x37b24d, pants: 0x8d5a3b, hair: 0xd9480f, skin: SKIN }, 0.2, -1.3);
    elf.group.scale.setScalar(0.78);
    pointedHat(elf.folk.head, 0x2b8a3e, 0.55);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 6), mat(SKIN));
      ear.position.set(s * 0.33, 0.04, 0);
      ear.rotation.z = -s * 1.1;
      elf.folk.head.add(ear);
    }

    // --- the hidden coin: pops up from behind the bush when he points at it
    const coin = coinMesh();
    coin.scale.setScalar(1.4);
    coin.visible = false;
    g.add(coin);
    let coinUp = 0; // 0 hidden … 1 hovering above the bush
    let coinThere = false;
    let time = 0;
    const sparks = new Sparkles(ctx.scene);

    const greet = (): void => {
      elf.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
      elf.wave(1.4);
      [988, 1175, 1319, 1568].forEach((f, i) => tone(f, i * 0.08, 0.16, 'triangle', 0.05)); // a little tune
      if (ctx.ready('coin')) {
        coinThere = true;
        ctx.say([RHYMES[ctx.greeting()], 'Olha ali! Há uma moeda escondida no arbusto!']);
      } else if (!coinThere) ctx.say([RHYMES[ctx.greeting()]]);
    };
    const takeCoin = (): void => {
      if (!coinThere || coinUp < 0.6) return;
      coinThere = false;
      coin.visible = false;
      coinUp = 0;
      const from = ctx.at(BUSH.x, BUSH.z, 1.5);
      sparks.burst(from, 12);
      ctx.pay(1, from);
      elf.hop(1.2);
    };

    return {
      things: [
        touchSpot(ctx, elf.group, 0.2, -1.3, 3.2, greet, undefined, PERSON_CLEAR),
        touchSpot(ctx, coin, BUSH.x, BUSH.z + 0.3, 1.7, takeCoin),
      ],
      people: [{ object: elf.group, position: ctx.at(0.2, -1.3), thank: () => elf.hop(1.4) }],
      update(dt) {
        time += dt;
        elf.update(dt);
        sparks.update(dt);
        // while the coin waits, he points at the bush with his arm and looks at it now and then
        if (coinThere) {
          if (!elf.busy) elf.work('reach', 1.5);
          if (!elf.busy || coinUp < 0.2) elf.lookAt(ctx.at(BUSH.x, BUSH.z));
          coinUp = Math.min(1, coinUp + dt * 1.2);
          coin.visible = true;
          coin.position.set(BUSH.x, 0.6 + coinUp * 0.95 + Math.sin(time * 3) * 0.06, BUSH.z);
          coin.rotation.z = time * 3;
        } else if (ctx.herDist(0.2, -1.3) > 8) elf.lookAt(null);
      },
      dispose() {
        sparks.clear();
      },
      debug: () => ({ coinThere, bush: (() => { const p = ctx.at(BUSH.x, BUSH.z + 0.9); return [+p.x.toFixed(1), +p.z.toFixed(1)]; })() }),
    };
  },
});
