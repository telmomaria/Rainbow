import * as THREE from 'three';
import { tone } from '../audio';
import { feel } from '../bus';
import { giftable, greetSpot, personClick } from './common';
import { registerFolk } from './folk';
import { Puppet, Sparkles, box, clickSpot, cyl, helmet, mat } from './kit';

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
      ctx.say([ctx.greeting(), 'Parei os carros — podes atravessar!']);
      if (ctx.city === 'Londres' && ctx.ready('enAsk', 120)) {
        asking = true;
        const ok = await ctx.game.ask({ text: 'What colour is a London bus?', answers: ['Red', 'Blue', 'Green'] }, 10, 'en');
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

/** I23 — Engenheiro: block bridge she can cross. */
registerFolk({
  id: 'engenheiro',
  ref: 'I23',
  group: 'profissao',
  hw: 2.8,
  depth: 4.5,
  where: 'green',
  build(ctx) {
    const g = ctx.root;
    const eng = new Puppet(ctx, { shirt: 0xffe066, pants: 0x495057, hair: 0x5c3d2e, cap: 0xffe066 }, -1.2, -1.4);
    helmet(eng.folk.head, 0xffe066);
    const blocks: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      const b = box(g, mat(0x74c0fc), 0.7, 0.25, 0.7, -0.5 + i * 0.55, 0.15, -2.2);
      b.visible = false;
      blocks.push(b);
    }
    let n = 0;
    const build = (): boolean => {
      if (n >= 4 || !ctx.free()) return false;
      blocks[n].visible = true;
      n++;
      eng.work('hammer', 0.7);
      tone(220 + n * 30, 0, 0.08, 'square', 0.05);
      if (n >= 4) {
        ctx.block(-0.6, 2.0, -2.6, -1.8, 0.4);
        eng.hop(1.3);
        ctx.say(['A ponte está pronta — atravessa!']);
        feel('play');
        if (ctx.ready('bridge')) ctx.pay(2, ctx.at(0.5, -2.2, 1));
      } else ctx.say([`Bloco ${n} de 4!`]);
      return true;
    };
    return {
      things: [greetSpot(ctx, eng, -1.2, -1.4, 'Vamos montar uma ponte?'), clickSpot(ctx, g, 0, -1.8, 2.5, build, 5)],
      people: [giftable(eng, -1.2, -1.4, ctx)],
      update: (dt) => eng.update(dt),
      debug: () => ({ n }),
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
      ctx.say([ctx.greeting(), 'Acertaste no alvo!']);
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
