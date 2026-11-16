import * as THREE from 'three';
import { tone } from '../audio';
import { feel } from '../bus';
import { giftable, greetSpot, personClick } from './common';
import { registerFolk } from './folk';
import { Puppet, Seq, Sparkles, apron, ball, box, clickSpot, cyl, helmet, mat } from './kit';

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

/** I25 — Contabilista: count coins on abacus (G03 = 5). */
registerFolk({
  id: 'contabilista',
  ref: 'I25',
  group: 'profissao',
  hw: 2.5,
  depth: 3.8,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    box(g, mat(0x8d5a3b), 1.6, 1.0, 0.3, 0, 1.0, -2.0);
    const beads: THREE.Mesh[] = [];
    let answer = 3;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 5; i++) {
        const b = ball(g, mat(row ? 0xe03131 : 0x228be6), 0.1, -0.6 + i * 0.3, 0.7 + row * 0.35, -1.85);
        beads.push(b);
      }
    }
    const accountant = new Puppet(ctx, { shirt: 0x4263eb, pants: 0x343a40, hair: 0x212529 }, 0.7, -1.4);
    let waiting = false;
    const ask = async (): Promise<boolean> => {
      if (waiting || !ctx.free()) return false;
      waiting = true;
      answer = 2 + Math.floor(ctx.rng() * 4); // 2..5
      beads.forEach((b, i) => {
        b.visible = i < answer;
      });
      accountant.talk(2);
      ctx.say([ctx.greeting(), 'Conta as contas do ábaco!']);
      const opts: [string, string, string] = [`${answer}`, `${answer + 1}`, `${Math.max(1, answer - 1)}`];
      // shuffle wrong positions but keep right first for ask()
      const ok = await ctx.game.ask({ text: 'Quantas contas estão no ábaco?', answers: opts }, 5);
      waiting = false;
      if (ok) {
        accountant.hop(1.3);
        feel('play');
      } else accountant.shake(1);
      return true;
    };
    return {
      things: [
        greetSpot(ctx, accountant, 0.7, -1.4, 'Vamos contar juntos?'),
        clickSpot(ctx, g, 0, -1.8, 2.5, () => {
          void ask();
          return true;
        }, 5),
      ],
      people: [giftable(accountant, 0.7, -1.4, ctx)],
      update: (dt) => accountant.update(dt),
      debug: () => ({ answer, waiting }),
    };
  },
});

/** I26 — Professor: REMOVIDO (2026-11-16, qualidade).
 *  Quadro + barra branca a fingir letra + só fala — sem letra legível. Não repor. */

/** I27 — Político: speech on podium; she climbs and crowd cheers. */
registerFolk({
  id: 'politico',
  ref: 'I27',
  group: 'profissao',
  hw: 2.5,
  depth: 4,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    box(g, mat(0x868e96), 1.4, 0.7, 1.0, 0, 0.35, -2.2); // podium
    ctx.block(-0.7, 0.7, -2.7, -1.7, 0.8);
    const pol = new Puppet(ctx, { shirt: 0x228be6, pants: 0x212529, hair: 0x5c3d2e }, 0, -2.0);
    const sparks = new Sparkles(ctx.scene);
    const seq = new Seq();
    let busy = false;
    const speech = (): boolean => {
      if (busy || !ctx.free()) return false;
      busy = true;
      ctx.game.hold(true);
      pol.talk(2);
      ctx.say([ctx.greeting(), 'Sobe ao palanque e diz olá à praça!']);
      const stand = ctx.at(0, -1.5, 0.7);
      seq.after(0.3, () => {
        ctx.player.position.set(stand.x, 0.7, stand.z);
        ctx.player.heading = ctx.heading(Math.PI);
      });
      seq.after(1.2, () => {
        sparks.burst(stand.clone().setY(1.5), 18);
        [523, 659, 784, 988, 1175].forEach((f, i) => tone(f, i * 0.07, 0.15, 'triangle', 0.05));
        ctx.say(['A praça aplaude!']);
      });
      seq.after(2.8, () => {
        ctx.player.position.set(stand.x, 0, stand.z + 1.5);
        ctx.game.hold(false);
        busy = false;
        feel('play');
        if (ctx.ready('speech')) ctx.pay(2, stand.clone().setY(1));
      });
      return true;
    };
    return {
      things: [greetSpot(ctx, pol, 0, -2.0, 'Queres discursar?'), clickSpot(ctx, g, 0, -1.8, 2.5, speech, 5)],
      people: [giftable(pol, 0, -2.0, ctx)],
      update(dt) {
        pol.update(dt);
        seq.update(dt);
        sparks.update(dt);
      },
      dispose() {
        if (busy) ctx.game.hold(false);
      },
      debug: () => ({ busy }),
    };
  },
});

/** I28 — Criadora de vídeos: three-step dance. */
registerFolk({
  id: 'criadora',
  ref: 'I28',
  group: 'profissao',
  hw: 2.4,
  depth: 3.6,
  where: 'street',
  build(ctx) {
    const creator = new Puppet(ctx, { shirt: 0xff6b9d, pants: 0x212529, hair: 0xfaa2c1, longHair: true }, 0, -1.5);
    const phone = box(ctx.root, mat(0x212529), 0.18, 0.35, 0.05, 0.4, 1.3, -1.1);
    const seq = new Seq();
    let busy = false;
    const dance = (): boolean => {
      if (busy || !ctx.free()) return false;
      busy = true;
      ctx.game.hold(true);
      ctx.say([ctx.greeting(), 'Passo um… dois… três! Copia a dança!']);
      creator.cheer(1);
      seq.after(0.8, () => creator.wave(0.8));
      seq.after(1.6, () => creator.hop(0.8));
      seq.after(2.4, () => {
        creator.cheer(1.2);
        ctx.player.airborne = true;
        ctx.player.root.rotation.order = 'YXZ';
        ctx.player.root.rotation.x = -0.2;
      });
      seq.after(3.4, () => {
        ctx.player.root.rotation.x = 0;
        ctx.player.airborne = false;
        ctx.game.hold(false);
        busy = false;
        feel('play');
        if (ctx.ready('dance')) ctx.pay(2, ctx.at(0, -1.5, 1));
        ctx.say(['Que vídeo giro!']);
      });
      return true;
    };
    return {
      things: [greetSpot(ctx, creator, 0, -1.5, 'Vamos gravar uma dança?'), clickSpot(ctx, phone, 0.4, -1.1, 2.2, dance, 5)],
      people: [giftable(creator, 0, -1.5, ctx)],
      update(dt) {
        creator.update(dt);
        seq.update(dt);
      },
      dispose() {
        if (busy) {
          ctx.player.root.rotation.x = 0;
          ctx.player.airborne = false;
          ctx.game.hold(false);
        }
      },
      debug: () => ({ busy }),
    };
  },
});

/** I29 — Cantor de rua: REMOVIDO (2026-11-16, qualidade).
 *  Pedía «bate palmas» sem ela bater; só fala + tons. Não repor. */

/** I30 — Empregada de mesa: tray with water glass (feel drink). */
registerFolk({
  id: 'empregada',
  ref: 'I30',
  group: 'profissao',
  hw: 2.4,
  depth: 3.6,
  where: 'street',
  build(ctx) {
    const waiter = new Puppet(ctx, { shirt: 0xffffff, pants: 0x212529, hair: 0xfaa2c1, dress: true }, 0, -1.5);
    apron(waiter.folk.body);
    const tray = box(ctx.root, mat(0xdee2e6), 0.55, 0.05, 0.4, 0.45, 1.35, -1.1);
    const glass = cyl(ctx.root, mat(0x74c0fc), 0.08, 0.22, 0.45, 1.5, -1.1);
    (glass.material as THREE.MeshStandardMaterial).transparent = true;
    (glass.material as THREE.MeshStandardMaterial).opacity = 0.7;
    const serve = (): boolean => {
      if (!ctx.free()) return false;
      waiter.work('reach', 1.2);
      ctx.say([ctx.greeting(), 'Um copo de água fresquinha!']);
      feel('drink');
      tone(1200, 0, 0.08, 'sine', 0.04);
      tone(1500, 0.1, 0.12, 'sine', 0.04);
      if (ctx.ready('water')) ctx.pay(1, ctx.at(0.45, -1.1, 1));
      return true;
    };
    return {
      things: [greetSpot(ctx, waiter, 0, -1.5, 'Queres água?'), clickSpot(ctx, tray, 0.45, -1.1, 2.2, serve, 5)],
      people: [giftable(waiter, 0, -1.5, ctx)],
      update: (dt) => waiter.update(dt),
      debug: () => ({}),
    };
  },
});
