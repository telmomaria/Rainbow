import * as THREE from 'three';
import { tone } from '../audio';
import { feel } from '../bus';
import { HeartCheck, attachStethoscope, buildClinicCabin, buildExamBed } from '../clinic';
import { MASSAGE_DUR, buildMassageCabin, buildMassageTable } from '../massage';
import { giftable, greetSpot, personClick } from './common';
import { registerFolk } from './folk';
import { Puppet, Seq, Sparkles, apron, box, chefHat, clickSpot, cyl, mat } from './kit';

/** I11 — Padeiro: put bread in the oven (G12 = 3). */
registerFolk({
  id: 'padeiro',
  ref: 'I11',
  group: 'profissao',
  hw: 2.6,
  depth: 4,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    box(g, mat(0xe8590c), 2.4, 2.2, 1.6, 0, 1.1, -2.4); // oven body
    box(g, mat(0x212529), 1.2, 0.9, 0.08, 0, 1.0, -1.55); // door
    ctx.block(-1.2, 1.2, -3.2, -1.6, 2.2);
    const baker = new Puppet(ctx, { shirt: 0xffffff, pants: 0x868e96, hair: 0xf8f9fa }, 0.8, -1.4);
    chefHat(baker.folk.head);
    apron(baker.folk.body);
    const loaf = box(g, mat(0xf4a261), 0.5, 0.2, 0.25, -0.6, 1.05, -1.3);
    loaf.visible = true;
    const seq = new Seq();
    let busy = false;
    const bake = (): boolean => {
      if (busy || !ctx.free()) return false;
      busy = true;
      baker.work('reach', 1.2);
      ctx.say([ctx.greeting(), 'Ajuda-me a meter o pão no forno!']);
      loaf.visible = true;
      seq.after(0.4, () => {
        loaf.position.set(0, 1.0, -2.0);
        tone(200, 0, 0.15, 'sine', 0.05);
      });
      seq.after(1.6, () => {
        loaf.position.set(0.5, 1.05, -1.3);
        baker.hop(1.2);
        feel('meal');
        if (ctx.ready('bread')) ctx.pay(3, ctx.at(0.5, -1.3, 1.1));
        ctx.say(['Pão quentinho!']);
        [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.18, 'triangle', 0.05));
      });
      seq.after(2.4, () => {
        busy = false;
      });
      return true;
    };
    return {
      things: [greetSpot(ctx, baker, 0.8, -1.4, 'Cheira bem a pão, pois não?'), clickSpot(ctx, loaf, -0.6, -1.3, 2.2, bake, 5)],
      people: [giftable(baker, 0.8, -1.4, ctx)],
      update(dt) {
        baker.update(dt);
        seq.update(dt);
      },
      debug: () => ({ busy }),
    };
  },
});

/** I12 — Pedreiro: three taps, one course each → short straight wall (G13 = 3). */
registerFolk({
  id: 'pedreiro',
  ref: 'I12',
  group: 'profissao',
  hw: 2.6,
  depth: 4,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    // Wall in the middle; mason stands to the right so the face reads clearly from the front.
    const wall = new THREE.Group();
    wall.position.set(-0.2, 0, -2.15);
    g.add(wall);
    const COLS = 3;
    const ROWS = 3;
    const BW = 0.7;
    const BH = 0.34;
    const BD = 0.42;
    const GAP = 0.03;
    const span = COLS * BW + (COLS - 1) * GAP;
    box(wall, mat(0x868e96), span + 0.2, 0.16, 0.55, 0, 0.08, 0); // footing
    ctx.block(-span / 2 - 0.2, span / 2 + 0.2, -2.5, -1.8, 1.4);
    const mats = [mat(0xc92a2a), mat(0xa61e4d)];
    const bricks: THREE.Mesh[] = [];
    for (let row = 0; row < ROWS; row++) {
      const y = 0.16 + BH / 2 + row * (BH + GAP);
      for (let col = 0; col < COLS; col++) {
        const x = -span / 2 + BW / 2 + col * (BW + GAP);
        const b = box(wall, mats[(row + col) % 2], BW, BH, BD, x, y, 0);
        b.visible = false;
        bricks.push(b);
      }
    }
    const mason = new Puppet(ctx, { shirt: 0xffe066, pants: 0x495057, hair: 0x5c3d2e, cap: 0xffe066 }, 1.55, -1.55);
    let n = 0;
    const lay = (): boolean => {
      if (n >= ROWS || !ctx.free()) return false;
      // One tap = one full course (three bricks side by side).
      const base = n * COLS;
      for (let c = 0; c < COLS; c++) bricks[base + c].visible = true;
      n++;
      mason.work('hammer', 0.8);
      tone(180 + n * 40, 0, 0.08, 'square', 0.05);
      if (n >= ROWS) {
        mason.hop(1.3);
        feel('play');
        if (ctx.ready('bricks')) ctx.pay(3, ctx.at(-0.2, -2.15, 1));
        ctx.say(['Pronto — um muro bem direito!']);
      } else ctx.say([`Mais ${ROWS - n}!`]);
      return true;
    };
    return {
      things: [
        greetSpot(ctx, mason, 1.55, -1.55, 'Sou o pedreiro! Ajuda-me a assentar tijolos!'),
        clickSpot(ctx, g, -0.2, -1.4, 2.8, lay, 5),
      ],
      people: [giftable(mason, 1.55, -1.55, ctx)],
      update(dt) {
        mason.update(dt);
      },
      debug: () => ({ n }),
    };
  },
});

/** I13 — Sapateiro: REMOVIDO (2026-11-17, qualidade).
 *  Martelo + brilho no sapato — interação fraca. Não repor. */

/** I14 — Advogado: REMOVIDO (2026-11-16, qualidade).
 *  Mesa cinzenta + só fala «quem parte, arranja» — sem cena visível. Não repor. */

/** I15 — Juiz: REMOVIDO (2026-11-17, qualidade).
 *  Martelo de juiz + «ordem na sala» — interação fraca. Não repor. */

/** I16 — Cozinheiro: stir the pot, taste the soup. */
registerFolk({
  id: 'cozinheiro',
  ref: 'I16',
  group: 'profissao',
  hw: 2.5,
  depth: 4,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    cyl(g, mat(0x868e96), 0.55, 0.7, 0, 0.5, -2.0);
    const soup = cyl(g, mat(0xff922b), 0.48, 0.08, 0, 0.85, -2.0);
    const cook = new Puppet(ctx, { shirt: 0xffffff, pants: 0x212529, hair: 0x5c3d2e }, 0.7, -1.4);
    chefHat(cook.folk.head);
    apron(cook.folk.body);
    let steam = 0;
    const stir = (): boolean => {
      cook.work('stir', 2);
      steam = 1;
      ctx.say([ctx.greeting(), 'Mexa a panela… e prova a sopa!']);
      feel('eat');
      if (ctx.ready('soup')) ctx.pay(1, ctx.at(0, -2, 1));
      [300, 350, 300].forEach((f, i) => tone(f, i * 0.2, 0.15, 'sine', 0.04));
      return true;
    };
    return {
      things: [greetSpot(ctx, cook, 0.7, -1.4, 'A sopa está quase!'), clickSpot(ctx, soup, 0, -2.0, 2.3, stir, 5)],
      people: [giftable(cook, 0.7, -1.4, ctx)],
      update(dt) {
        cook.update(dt);
        steam = Math.max(0, steam - dt * 0.3);
        soup.position.y = 0.85 + Math.sin(performance.now() * 0.01) * 0.02 * steam;
      },
      debug: () => ({ steam: +steam.toFixed(2) }),
    };
  },
});

/** I17 — Cabeleireira: free comb at the door (paid style = S01 later). */
registerFolk({
  id: 'cabeleireira',
  ref: 'I17',
  group: 'profissao',
  hw: 2.4,
  depth: 3.8,
  where: 'street',
  build(ctx) {
    box(ctx.root, mat(0xffc9c9), 2.0, 2.0, 1.2, 0, 1.0, -2.2);
    box(ctx.root, mat(0xffffff), 0.8, 1.4, 0.08, 0, 0.9, -1.55); // mirror
    ctx.block(-1.0, 1.0, -2.8, -1.6, 2.0);
    const stylist = new Puppet(ctx, { shirt: 0xff6b9d, pants: 0x495057, hair: 0xfaa2c1, dress: true, longHair: true }, 0.5, -1.4);
    const holder = { seq: null as Seq | null };
    return {
      things: [
        greetSpot(ctx, stylist, 0.5, -1.4, 'Bem-vinda ao salão!'),
        clickSpot(
          ctx,
          stylist.group,
          0.5,
          -1.4,
          2.5,
          () => {
            if (!ctx.free()) return false;
            holder.seq = new Seq();
            stylist.work('reach', 1.5);
            ctx.game.hold(true);
            ctx.say([ctx.greeting(), 'Deixa-me pentear-te um bocadinho!']);
            feel('groom');
            holder.seq.after(1.8, () => {
              ctx.game.hold(false);
              stylist.hop(1);
              if (ctx.ready('comb')) ctx.pay(1, ctx.at(0.5, -1.4, 1));
              holder.seq = null;
            });
            return true;
          },
          5,
        ),
      ],
      people: [giftable(stylist, 0.5, -1.4, ctx)],
      update(dt) {
        stylist.update(dt);
        holder.seq?.update(dt);
      },
      dispose() {
        if (holder.seq) ctx.game.hold(false);
      },
      debug: () => ({ combing: !!holder.seq }),
    };
  },
});

/** I18 — Massagista: covered SPA cabin; she lies face-down; masseuse kneads her back (~10 s). */
registerFolk({
  id: 'massagista',
  ref: 'I18',
  group: 'profissao',
  hw: 2.6,
  depth: 4.4,
  apron: 4,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    buildMassageCabin(g, 2.6, 4.4);
    ctx.block(-2.6, 2.6, -4.4, 0);
    const table = buildMassageTable(g, 0, -2.15);
    ctx.block(-0.75, 0.75, -3.2, -1.1, 0.9);

    const mx = 1.4;
    const mz = -3.2;
    const masseuse = new Puppet(ctx, { shirt: 0x69db7c, pants: 0xffffff, hair: 0x5c3d2e, dress: true }, mx, mz);
    const seq = new Seq();
    let busy = false;
    let t = 0;
    const TABLE_Y = table.ly;
    const endMassage = (): void => {
      const p = ctx.player;
      p.lyingY = null;
      p.prone = false;
      p.airborne = false;
      p.root.rotation.x = 0;
      p.root.rotation.z = 0;
      const stand = ctx.at(0, 1.2);
      p.position.set(stand.x, 0, stand.z);
      p.heading = ctx.heading(Math.PI);
      masseuse.folk.group.position.set(mx, 0, mz);
      masseuse.folk.group.rotation.y = Math.PI;
      feel('massage');
      ctx.say(['Que bem!']);
      [392, 523, 659].forEach((f, i) => tone(f, i * 0.1, 0.18, 'sine', 0.05));
      ctx.game.hold(false);
      busy = false;
      if (ctx.ready('stretch')) ctx.pay(1, ctx.at(mx, mz, 1));
    };
    const startMassage = (): boolean => {
      if (busy || !ctx.free()) return false;
      busy = true;
      t = 0;
      ctx.game.hold(true);
      const p = ctx.player;
      const onTable = ctx.at(table.lx, table.lz);
      p.position.x = onTable.x;
      p.position.z = onTable.z;
      p.heading = ctx.heading(table.face);
      p.applyProneLie(TABLE_Y);
      masseuse.folk.group.position.set(-0.95, 0, -2.35);
      masseuse.folk.group.rotation.y = Math.PI / 2;
      masseuse.work('massage', MASSAGE_DUR + 0.4);
      ctx.say([ctx.greeting(), 'Deita-te — massagem nas costas!']);
      tone(330, 0, 0.15, 'sine', 0.04);
      seq.after(MASSAGE_DUR, endMassage);
      return true;
    };
    return {
      things: [
        // door / apron — cabin body is solid, so Enter must work from outside
        greetSpot(ctx, masseuse, 0, 1.15, 'Vamos fazer uma massagem?'),
        clickSpot(ctx, g, 0, 1.15, 2.5, startMassage, 6),
        personClick(ctx, masseuse, mx, mz, startMassage),
      ],
      people: [giftable(masseuse, mx, mz, ctx)],
      update(dt) {
        masseuse.update(dt);
        seq.update(dt);
        if (!busy) return;
        t += dt;
        const onTable = ctx.at(table.lx, table.lz);
        const p = ctx.player;
        p.position.x = onTable.x;
        p.position.z = onTable.z;
        p.applyProneLie(TABLE_Y);
        // reinforce kneading — lean in, hands press the back (not arms in the air)
        const ph = t * 5.2;
        const pump = Math.abs(Math.sin(ph));
        const f = masseuse.folk;
        f.armR.rotation.x = -1.05 - pump * 0.4;
        f.armL.rotation.x = -1.05 - Math.abs(Math.sin(ph + 1.05)) * 0.4;
        f.armR.rotation.z = 0.55 + Math.sin(ph * 0.7) * 0.15;
        f.armL.rotation.z = -0.55 - Math.sin(ph * 0.7 + 0.5) * 0.15;
        f.body.rotation.x = -0.45 - pump * 0.1;
      },
      dispose() {
        if (busy) {
          ctx.player.lyingY = null;
          ctx.player.prone = false;
          ctx.player.airborne = false;
          ctx.player.root.rotation.x = 0;
          ctx.player.root.rotation.z = 0;
          ctx.game.hold(false);
          busy = false;
        }
      },
      debug: () => ({ busy, t: +t.toFixed(2) }),
    };
  },
});

/** I19 — Médico: consultório com maca; deita-se, estetoscópio ao peito, «Estás bem!». */
registerFolk({
  id: 'medico',
  ref: 'I19',
  group: 'profissao',
  hw: 2.6,
  depth: 4.2,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    buildClinicCabin(g, 2.6, 4.2);
    ctx.block(-2.6, 2.6, -4.2, 0);
    const bed = buildExamBed(g, 0, -2.0);
    ctx.block(-1.0, 1.0, -2.5, -1.5, 0.75);

    const docHome = { x: 1.45, z: -3.1 };
    const docBeside = { x: 0.1, z: -1.25 };
    const doc = new Puppet(ctx, { shirt: 0xffffff, pants: 0x343a40, hair: 0x5c3d2e, cap: 0x2f9e44 }, docHome.x, docHome.z);
    const tip = attachStethoscope(doc.folk);
    const check = new HeartCheck(doc.folk, tip, docHome, docBeside);
    let busy = false;

    const endConsult = (): void => {
      const p = ctx.player;
      p.lyingY = null;
      p.airborne = false;
      p.root.rotation.x = 0;
      const stand = ctx.at(0, 1.2);
      p.position.set(stand.x, 0, stand.z);
      p.heading = ctx.heading(Math.PI);
      check.reset();
      busy = false;
      ctx.game.hold(false);
      if (ctx.ready('heart')) ctx.pay(1, ctx.at(docHome.x, docHome.z, 1));
    };

    const startConsult = (): boolean => {
      if (busy || !ctx.free() || check.busy) return false;
      busy = true;
      ctx.game.hold(true);
      const p = ctx.player;
      const onBed = ctx.at(bed.lx, bed.lz);
      p.position.set(onBed.x, 0, onBed.z);
      p.heading = ctx.heading(bed.face);
      p.lyingY = bed.ly;
      p.airborne = true;
      const chest = ctx.at(bed.lx, bed.lz, bed.ly + 0.35);
      ctx.say([ctx.greeting(), 'Deita-te na maca…', 'Vou ouvir o teu coração.']);
      check.start(chest, () => {
        feel('doctor');
        ctx.say(['Estás bem!']);
      });
      return true;
    };

    return {
      things: [
        greetSpot(ctx, doc, docHome.x, docHome.z, 'Sou o médico — há uma maca para a consulta!'),
        personClick(ctx, doc, docHome.x, docHome.z, startConsult),
        clickSpot(ctx, g, bed.lx, bed.lz + 0.9, 2.2, startConsult, 5),
      ],
      people: [giftable(doc, docHome.x, docHome.z, ctx)],
      update(dt) {
        if (busy) {
          check.update(dt);
          const p = ctx.player;
          const onBed = ctx.at(bed.lx, bed.lz);
          p.position.set(onBed.x, bed.ly, onBed.z);
          p.lyingY = bed.ly;
          if (check.finished) endConsult();
        } else {
          doc.update(dt);
          check.update(dt);
        }
      },
      dispose() {
        if (busy) {
          ctx.player.lyingY = null;
          ctx.player.airborne = false;
          ctx.player.root.rotation.x = 0;
          check.reset();
          ctx.game.hold(false);
          busy = false;
        }
      },
      debug: () => ({ busy, consulting: check.busy }),
    };
  },
});

/** I20 — Enfermeira: colourful plaster. */
registerFolk({
  id: 'enfermeira',
  ref: 'I20',
  group: 'profissao',
  hw: 2.3,
  depth: 3.6,
  where: 'street',
  build(ctx) {
    const nurse = new Puppet(ctx, { shirt: 0xffffff, pants: 0x74c0fc, hair: 0xfaa2c1, dress: true, longHair: true }, 0, -1.5);
    const plaster = box(ctx.root, mat(0xff6b9d), 0.25, 0.08, 0.12, 0.5, 1.0, -1.2);
    const sparks = new Sparkles(ctx.scene);
    const put = (): boolean => {
      if (!ctx.free()) return false;
      nurse.work('reach', 1.2);
      plaster.position.set(0.2, 1.0, -0.5);
      sparks.burst(ctx.at(0.2, -0.5, 1.0), 8, [0xff6b9d, 0xffe066, 0x74c0fc]);
      ctx.say([ctx.greeting(), 'Um penso colorido para ti!']);
      feel('doctor');
      if (ctx.ready('plaster')) ctx.pay(1, ctx.at(0, -1.5, 1));
      return true;
    };
    return {
      things: [greetSpot(ctx, nurse, 0, -1.5, 'Precisas de um penso?'), clickSpot(ctx, plaster, 0.5, -1.2, 2.2, put, 5)],
      people: [giftable(nurse, 0, -1.5, ctx)],
      update(dt) {
        nurse.update(dt);
        sparks.update(dt);
      },
      dispose: () => sparks.clear(),
      debug: () => ({}),
    };
  },
});
