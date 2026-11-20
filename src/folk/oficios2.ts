import * as THREE from 'three';
import { tone } from '../audio';
import { feel } from '../bus';
import { ENGLISH_QUESTIONS } from '../questions';
import { giftable, greetSpot, personClick } from './common';
import { registerFolk } from './folk';
import { Puppet, Sparkles, ball, box, clickSpot, cyl, helmet, mat } from './kit';
import { siteBox } from '../places';
import type { Obstacle } from '../world';

/** I21 — Polícia de trânsito: whistle, stop cars; in London asks a simple English question (G01). */
registerFolk({
  id: 'policia',
  ref: 'I21',
  group: 'profissao',
  hw: 2.4,
  depth: 3.6,
  where: 'street',
  build(ctx) {
    const cop = new Puppet(ctx, { shirt: 0x1c7ed6, pants: 0x212529, hair: 0x5c3d2e, cap: 0x1c7ed6 }, 0, -1.4);
    box(ctx.root, mat(0xffe066), 0.5, 0.08, 0.08, 0.35, 1.5, -0.9); // baton
    let asking = false;
    const help = async (): Promise<boolean> => {
      if (asking || !ctx.free()) return false;
      cop.work('reach', 1);
      // whistle
      tone(1800, 0, 0.15, 'square', 0.06);
      tone(2200, 0.18, 0.2, 'square', 0.06);
      const at = ctx.at(0, 2);
      ctx.stopTraffic(at, 14, 6);
      ctx.say(['Parei os carros — podes atravessar!']);
      if (ctx.city === 'Londres' && ctx.ready('enAsk', 120)) {
        asking = true;
        const q = ENGLISH_QUESTIONS[Math.floor(Math.random() * ENGLISH_QUESTIONS.length)];
        const ok = await ctx.game.ask(q, 10, 'en');
        asking = false;
        if (ok) {
          cop.hop(1.4);
          ctx.say(['Very good!']);
        } else cop.nod(1);
      } else if (ctx.ready('stop')) ctx.pay(1, at.clone().setY(1));
      return true;
    };
    return {
      things: [
        greetSpot(ctx, cop, 0, -1.4, 'Atenção ao trânsito!'),
        personClick(ctx, cop, 0, -1.4, () => {
          void help();
          return true;
        }),
      ],
      people: [giftable(cop, 0, -1.4, ctx)],
      update: (dt) => cop.update(dt),
      debug: () => ({ asking, london: ctx.city === 'Londres' }),
    };
  },
});

/** I22 — Carteiro: REMOVIDO (2026-11-16, qualidade).
 *  Dizia «postal de X» e pagava moedas — sem postal no inventário nem entrega visível. Não repor. */

/**
 * I23 — Engenheiro: a little stream cuts the stage in two (she can't step in the water). Tap the pile of planks
 * (or the engineer) = one plank flies over the water and lands in place; four planks = a bridge. She walks over
 * it to the far bank: the flag goes up, the engineer cheers and pays. When she goes away the bridge is taken
 * apart for the next time. (Until 2026-11-19 four blue blocks appeared on the grass — "ponte" over nothing.)
 */
registerFolk({
  id: 'engenheiro',
  ref: 'I23',
  group: 'profissao',
  hw: 3.0,
  depth: 5.0,
  where: 'green',
  build(ctx) {
    const g = ctx.root;
    const ZN = -1.8; // near bank
    const ZF = -3.2; // far bank
    const GAP = 0.75; // half width of the bridge
    // stream (water + muddy banks + a few stones at the ends)
    box(g, new THREE.MeshStandardMaterial({ color: 0x4dabf7, emissive: 0x0b3d66, roughness: 0.25, metalness: 0.1 }), 6.0, 0.04, ZN - ZF, 0, 0.03, (ZN + ZF) / 2);
    box(g, mat(0x8d6e4a), 6.0, 0.06, 0.2, 0, 0.03, ZN + 0.05);
    box(g, mat(0x8d6e4a), 6.0, 0.06, 0.2, 0, 0.03, ZF - 0.05);
    for (const x of [-2.9, 2.9]) ball(g, mat(0x868e96), 0.3, x, 0.1, (ZN + ZF) / 2);
    ctx.block(-3.0, -GAP, ZF, ZN, 0.3);
    ctx.block(GAP, 3.0, ZF, ZN, 0.3);
    const gate = siteBox(ctx.site, -GAP, GAP, ZF, ZN, 0.3); // the gap the bridge will fill
    const obstacles = ctx.obstacles as Obstacle[];
    obstacles.push(gate);
    const setGate = (closed: boolean): void => {
      const i = obstacles.indexOf(gate);
      if (closed && i < 0) obstacles.push(gate);
      if (!closed && i >= 0) obstacles.splice(i, 1);
    };
    // far bank: a flag that goes up when she gets there
    cyl(g, mat(0xdee2e6), 0.04, 2.2, 0, 1.1, -4.4);
    const flag = box(g, mat(0xff6b6b), 0.6, 0.38, 0.03, 0.31, 0.5, -4.4);
    ctx.block(-0.15, 0.15, -4.55, -4.25);
    for (const x of [-1.6, 1.6]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 10), mat(0xff922b));
      cone.position.set(x, 0.2, -4.0);
      g.add(cone);
    }

    const eng = new Puppet(ctx, { shirt: 0xffe066, pants: 0x495057, hair: 0x5c3d2e, cap: 0xffe066 }, -1.9, -0.9);
    helmet(eng.folk.head, 0xffe066);
    // pile of planks on the near bank
    const pile = new THREE.Group();
    pile.position.set(1.7, 0, -0.7);
    g.add(pile);
    const wood = [mat(0xc08a4e), mat(0xa9713a)];
    const SLOTS = [-0.54, -0.18, 0.18, 0.54];
    const pilePos = (i: number) => new THREE.Vector3(1.7, 0.05 + (3 - i) * 0.09, -0.7);
    const planks = SLOTS.map((_, i) => {
      const p = box(g, wood[i % 2], 0.34, 0.08, 2.0, 0, 0, 0);
      p.position.copy(pilePos(i));
      p.rotation.y = Math.PI / 2;
      return p;
    });
    ctx.block(0.7, 2.7, -0.9, -0.5, 0.4);

    let n = 0; // planks laid
    let flying: { m: THREE.Mesh; t: number; from: THREE.Vector3; to: THREE.Vector3 } | null = null;
    let onBridge = false;
    let done = false; // she crossed: flag up
    let flagY = 0.5;
    const sparks = new Sparkles(ctx.scene);
    const WORDS = ['Uma!', 'Duas!', 'Três!'];

    const lay = (): boolean => {
      if (n >= SLOTS.length || flying || !ctx.free()) return false;
      const m = planks[n];
      flying = { m, t: 0, from: m.position.clone(), to: new THREE.Vector3(SLOTS[n], 0.1, (ZN + ZF) / 2) };
      n++;
      eng.lookAt(ctx.at(0, (ZN + ZF) / 2));
      eng.work('hammer', 0.9);
      tone(330, 0, 0.1, 'triangle', 0.04);
      return true;
    };
    const landed = (): void => {
      tone(180 + n * 40, 0, 0.09, 'square', 0.05);
      tone(140 + n * 40, 0.1, 0.09, 'square', 0.04);
      sparks.burst(ctx.at(SLOTS[n - 1], (ZN + ZF) / 2, 0.2), 6, [0xc08a4e, 0xffe066, 0xffffff], 1.4);
      if (n < SLOTS.length) {
        ctx.say([WORDS[n - 1]]);
        return;
      }
      setGate(false);
      eng.hop(1.3);
      ctx.say(['A ponte está pronta! Passa para o outro lado!']);
    };
    const reset = (): void => {
      n = 0;
      done = false;
      onBridge = false;
      flying = null;
      planks.forEach((p, i) => {
        p.position.copy(pilePos(i));
        p.rotation.set(0, Math.PI / 2, 0);
      });
      setGate(true);
    };
    const her = new THREE.Vector3();
    return {
      things: [
        greetSpot(ctx, eng, -1.9, -0.9, () => (n >= SLOTS.length ? 'Já tens ponte! Atravessa o riacho!' : 'Fazemos uma ponte no riacho? Toca nas tábuas!')),
        personClick(ctx, eng, -1.9, -0.9, lay),
        clickSpot(ctx, pile, 1.7, -0.7, 2.4, lay, 6),
      ],
      people: [giftable(eng, -1.9, -0.9, ctx)],
      update(dt) {
        eng.update(dt);
        sparks.update(dt);
        if (flying) {
          flying.t = Math.min(1, flying.t + dt / 0.8);
          const k = flying.t;
          flying.m.position.lerpVectors(flying.from, flying.to, k);
          flying.m.position.y += Math.sin(k * Math.PI) * 1.4;
          flying.m.rotation.set(0, (Math.PI / 2) * (1 - k), Math.sin(k * Math.PI) * 0.4);
          if (k >= 1) {
            flying.m.rotation.set(0, 0, 0);
            flying = null;
            landed();
          }
        }
        // where is she (stage-local)?
        her.set(ctx.game.player.x, 0, ctx.game.player.z);
        g.worldToLocal(her);
        if (n >= SLOTS.length && !flying && !done) {
          if (Math.abs(her.x) < GAP + 0.2 && her.z < ZN + 0.2 && her.z > ZF - 0.2) onBridge = true;
          if (onBridge && her.z < ZF - 0.3 && Math.abs(her.x) < 3) {
            done = true;
            eng.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
            eng.cheer(1.8);
            feel('play');
            sparks.burst(ctx.at(0.3, -4.4, 2.0), 14);
            [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.18, 'triangle', 0.05));
            if (ctx.ready('bridge')) ctx.pay(2, ctx.at(0, -4.0, 1.2));
            ctx.say(['Atravessaste a ponte! Muito bem!']);
          }
        }
        flagY += ((done ? 2.0 : 0.5) - flagY) * Math.min(1, dt * 2);
        flag.position.y = flagY;
        flag.rotation.y = Math.sin(performance.now() * 0.004) * 0.15;
        // gone away: take the bridge apart for next time
        if (n > 0 && !flying && Math.hypot(her.x, her.z + 2.5) > 25) reset();
      },
      dispose: () => {
        sparks.clear();
        setGate(false);
      },
      debug: () => ({ n, done, onBridge, gate: obstacles.includes(gate), her: [+her.x.toFixed(1), +her.z.toFixed(1)] }),
    };
  },
});

/** I24 — Bombeiro: aim hose at target (G27 = 3). */
registerFolk({
  id: 'bombeiro',
  ref: 'I24',
  group: 'profissao',
  hw: 2.6,
  depth: 4.2,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    const fire = new Puppet(ctx, { shirt: 0xe03131, pants: 0x212529, hair: 0x5c3d2e }, 0.8, -1.5);
    helmet(fire.folk.head, 0xe03131);
    const target = cyl(g, mat(0xffe066), 0.35, 0.8, -1.0, 0.5, -2.8);
    const hose = cyl(g, mat(0x495057), 0.06, 1.2, 0.2, 1.0, -1.2);
    hose.rotation.z = 0.6;
    const sparks = new Sparkles(ctx.scene);
    const spray = (): boolean => {
      if (!ctx.free()) return false;
      fire.work('reach', 1.2);
      sparks.burst(ctx.at(-1.0, -2.8, 1.0), 20, [0x74c0fc, 0xe7f5ff, 0xffffff], 3);
      for (let i = 0; i < 6; i++) tone(600 + Math.random() * 200, i * 0.05, 0.08, 'sine', 0.04);
      ctx.say(['Acertaste no alvo!']);
      feel('play');
      if (ctx.ready('hose')) ctx.pay(3, ctx.at(-1.0, -2.8, 1));
      return true;
    };
    return {
      things: [greetSpot(ctx, fire, 0.8, -1.5, 'Queres apontar a mangueira?'), clickSpot(ctx, target, -1.0, -2.8, 2.5, spray, 6)],
      people: [giftable(fire, 0.8, -1.5, ctx)],
      update(dt) {
        fire.update(dt);
        sparks.update(dt);
      },
      dispose: () => sparks.clear(),
      debug: () => ({}),
    };
  },
});

/** I25 — Contabilista: REMOVIDO (2026-11-17, qualidade).
 *  Ábaco + pergunta de contar — interação fraca. Não repor. */

/** I26 — Professor: REMOVIDO (2026-11-16, qualidade).
 *  Quadro + barra branca a fingir letra + só fala — sem letra legível. Não repor. */

/** I27 — Político: REMOVIDO (2026-11-17, qualidade).
 *  Palanque + aplauso forçado — interação fraca. Não repor. */

/** I28 — Criadora de vídeos: REMOVIDO (2026-11-17, qualidade).
 *  Dança em 3 passos sem ela copiar de verdade. Não repor. */

/** I29 — Cantor de rua: REMOVIDO (2026-11-16, qualidade).
 *  Pedía «bate palmas» sem ela bater; só fala + tons. Não repor. */

/** I30 — Empregada de mesa: REMOVIDO (2026-11-17, qualidade).
 *  Tabuleiro + copo de água — interação fraca. Não repor. */
