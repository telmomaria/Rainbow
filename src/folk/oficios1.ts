import * as THREE from 'three';
import { tone } from '../audio';
import type { Character } from '../character';
import { feel } from '../bus';
import { HeartCheck, attachStethoscope, buildClinicCabin, buildExamBed } from '../clinic';
import { MASSEUSE_SPOT, MassageSession, buildMassageCabin, buildMassageTable, kneadPose, restPose } from '../massage';
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
      ctx.say(['Ajuda-me a meter o pão no forno!']);
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

/**
 * I16 — Cozinheiro: a steaming pot. Tap the pot or the cook = he stirs and fills a bowl on the little table;
 * tap the bowl = she eats it (the soup goes down in three spoonfuls, "nham" sounds, +energy via feel('eat'),
 * the cook smiles and hops, 1 coin). Then the pot is empty (no steam) and the next soup is ready ~3 min later.
 * (Until 2026-11-19 it only said "A sopa está quase!" and bobbed the soup — "é inútil".)
 */
registerFolk({
  id: 'cozinheiro',
  ref: 'I16',
  group: 'profissao',
  hw: 2.5,
  depth: 4,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    cyl(g, mat(0x495057), 0.62, 0.45, 0, 0.22, -2.0); // stove
    const pot = cyl(g, mat(0xadb5bd), 0.55, 0.55, 0, 0.72, -2.0);
    const soup = cyl(g, mat(0xff922b), 0.48, 0.04, 0, 0.98, -2.0);
    ctx.block(-0.65, 0.65, -2.65, -1.35, 1.0);
    const ladle = cyl(g, mat(0x868e96), 0.03, 0.8, 0.25, 1.25, -2.0);
    ladle.rotation.z = -0.35;
    // little table in front, with a bowl
    box(g, mat(0xb07d48), 0.8, 0.06, 0.6, -1.2, 0.78, -0.9);
    for (const [x, z] of [[-1.5, -1.1], [-0.9, -1.1], [-1.5, -0.7], [-0.9, -0.7]]) box(g, mat(0x8d5a2b), 0.06, 0.75, 0.06, x, 0.375, z);
    ctx.block(-1.65, -0.75, -1.25, -0.55, 0.85);
    const bowl = cyl(g, mat(0xffffff), 0.2, 0.12, -1.2, 0.87, -0.9);
    const bowlSoup = cyl(g, mat(0xff922b), 0.17, 0.02, -1.2, 0.93, -0.9);
    bowlSoup.visible = false;
    const cook = new Puppet(ctx, { shirt: 0xffffff, pants: 0x212529, hair: 0x5c3d2e }, 0.9, -1.5);
    chefHat(cook.folk.head);
    apron(cook.folk.body);
    const steamPot = new Steam(ctx.scene, ctx.at(0, -2.0, 1.05), 0.35);
    const steamBowl = new Steam(ctx.scene, ctx.at(-1.2, -0.9, 0.95), 0.1);
    const sparks = new Sparkles(ctx.scene);
    const seq = new Seq();

    // pot = soup ready · serving = stirring and filling · bowl = waiting for her · eating · empty = cooking the next one
    let state: 'pot' | 'serving' | 'bowl' | 'eating' | 'empty' = 'pot';
    let emptyFor = 0;
    const NEXT_SOUP = 180;
    const serve = (): boolean => {
      if (!ctx.free()) return false;
      if (state === 'bowl') return eat();
      if (state === 'empty') {
        cook.shake(1.2);
        ctx.say(['A sopa acabou! Estou a fazer mais.']);
        return true;
      }
      if (state !== 'pot') return false;
      state = 'serving';
      cook.lookAt(ctx.at(0, -2.0));
      cook.work('stir', 1.6);
      ladle.rotation.z = -0.2;
      [300, 350, 300].forEach((f, i) => tone(f, i * 0.25, 0.15, 'sine', 0.04));
      ctx.say(['Vou encher-te uma tigela!']);
      seq.after(1.7, () => {
        cook.lookAt(ctx.at(-1.2, -0.9));
        cook.work('reach', 0.8);
      });
      seq.after(2.3, () => {
        bowlSoup.visible = true;
        bowlSoup.position.y = 0.93;
        steamBowl.on = true;
        soup.position.y = 0.9; // less soup in the pot
        tone(520, 0, 0.12, 'triangle', 0.05);
        tone(660, 0.1, 0.16, 'triangle', 0.05);
        cook.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
        ctx.say(['Prova! Está quentinha.']);
        state = 'bowl';
      });
      return true;
    };
    const eat = (): boolean => {
      if (state !== 'bowl' || !ctx.free()) return false;
      state = 'eating';
      for (let i = 0; i < 3; i++) {
        seq.after(0.15 + i * 0.6, () => {
          bowlSoup.position.y = 0.93 - (i + 1) * 0.022;
          if (i === 2) bowlSoup.visible = false;
          tone(392, 0, 0.08, 'sine', 0.05); // "nham"
          tone(523, 0.07, 0.1, 'sine', 0.05);
        });
      }
      seq.after(2.0, () => {
        steamBowl.on = false;
        steamPot.on = false;
        soup.position.y = 0.8; // pot empty
        cook.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
        cook.hop(1.3);
        sparks.burst(ctx.at(-1.2, -0.9, 1.0), 10, [0xff8fab, 0xffe066, 0xffffff]);
        feel('eat');
        [523, 659, 784].forEach((f, i) => tone(f, i * 0.08, 0.15, 'triangle', 0.05)); // yum
        if (ctx.ready('soup', NEXT_SOUP)) ctx.pay(1, ctx.at(-1.2, -0.9, 1.2));
        ctx.say(['Comeste tudo! Que bom!']);
        state = 'empty';
        emptyFor = 0;
      });
      return true;
    };
    return {
      things: [
        greetSpot(ctx, cook, 0.9, -1.5, () => (state === 'empty' ? 'Estou a fazer sopa nova!' : 'Fiz sopa quentinha! Queres provar?')),
        personClick(ctx, cook, 0.9, -1.5, serve),
        clickSpot(ctx, pot, 0, -2.0, 2.4, serve, 5),
        clickSpot(ctx, bowl, -1.2, -0.9, 1.8, () => (state === 'bowl' ? eat() : serve()), 5),
      ],
      people: [giftable(cook, 0.9, -1.5, ctx)],
      update(dt) {
        cook.update(dt);
        seq.update(dt);
        sparks.update(dt);
        steamPot.update(dt);
        steamBowl.update(dt);
        if (state === 'serving') ladle.rotation.y += dt * 5;
        if (state === 'empty' && !ctx.game.isPaused()) {
          emptyFor += dt;
          if (emptyFor > NEXT_SOUP) {
            state = 'pot';
            soup.position.y = 0.98;
            steamPot.on = true;
          }
        }
      },
      dispose: () => {
        steamPot.clear();
        steamBowl.clear();
        sparks.clear();
      },
      debug: () => ({ state, bowl: bowlSoup.visible }),
    };
  },
});

/** Soft white puffs rising from a hot pot or bowl (only while `on`). */
class Steam {
  on = true;
  private puffs: { m: THREE.Mesh; t: number }[] = [];
  private static geo = new THREE.SphereGeometry(0.08, 8, 6);
  constructor(scene: THREE.Object3D, private readonly at: THREE.Vector3, private readonly spread: number) {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(Steam.geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      scene.add(m);
      this.puffs.push({ m, t: i / 6 });
    }
  }
  update(dt: number): void {
    for (const p of this.puffs) {
      p.t += dt * 0.45;
      if (p.t >= 1) {
        p.t -= 1;
        p.m.userData.ox = (Math.random() - 0.5) * this.spread * 2;
        p.m.userData.oz = (Math.random() - 0.5) * this.spread * 2;
      }
      const ox = (p.m.userData.ox as number | undefined) ?? 0;
      const oz = (p.m.userData.oz as number | undefined) ?? 0;
      p.m.position.set(this.at.x + ox + Math.sin(p.t * 6) * 0.05, this.at.y + p.t * 0.9, this.at.z + oz);
      p.m.scale.setScalar(0.7 + p.t * 1.6);
      const mat = p.m.material as THREE.MeshBasicMaterial;
      const want = this.on ? 0.55 * Math.sin(p.t * Math.PI) : 0;
      mat.opacity += (want - mat.opacity) * Math.min(1, dt * 4);
      p.m.visible = mat.opacity > 0.01;
    }
  }
  clear(): void {
    for (const p of this.puffs) p.m.removeFromParent();
  }
}

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
            ctx.say(['Deixa-me pentear-te um bocadinho!']);
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

/** I18 — Massagista: covered SPA cabin; she lies on the table as long as she wants while the masseuse kneads. */
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
    const TABLE_Y = table.ly;
    const onTable = ctx.at(table.lx, table.lz);
    const clearPose = (): void => {
      const p = ctx.player;
      p.lyingY = null;
      p.prone = false;
      p.airborne = false;
      p.root.rotation.x = 0;
      p.root.rotation.z = 0;
      p.root.position.y = 0;
      masseuse.folk.group.position.set(mx, 0, mz);
      masseuse.folk.group.rotation.y = Math.PI;
      masseuse.stop();
      restPose(masseuse.folk);
    };
    // any key / tap gets her up (the session calls this on the next frame)
    const session = new MassageSession(() => {
      const p = ctx.player;
      const still = Math.hypot(p.position.x - onTable.x, p.position.z - onTable.z) < 1.5;
      clearPose();
      if (still) {
        const stand = ctx.at(0, 1.2);
        p.position.set(stand.x, 0, stand.z);
        p.heading = ctx.heading(Math.PI);
      }
      ctx.say(['Que bem!']);
      [392, 523, 659].forEach((f, i) => tone(f, i * 0.1, 0.18, 'sine', 0.05));
      ctx.game.hold(false);
      if (ctx.ready('stretch')) ctx.pay(1, ctx.at(mx, mz, 1));
    });
    const startMassage = (): boolean => {
      if (!session.ready || !ctx.free()) return false;
      ctx.game.hold(true);
      const p = ctx.player;
      p.position.x = onTable.x;
      p.position.z = onTable.z;
      p.heading = ctx.heading(table.face);
      p.applyProneLie(TABLE_Y);
      // at the head end of the table, facing the door: her smiling face toward the camera
      masseuse.folk.group.position.set(MASSEUSE_SPOT.x, 0, MASSEUSE_SPOT.z);
      masseuse.face(MASSEUSE_SPOT.face);
      masseuse.folk.group.rotation.y = MASSEUSE_SPOT.face;
      session.start(); // mood +1 now; energy +1 every few seconds while she stays
      ctx.say(['Deita-te e descansa!']);
      tone(330, 0, 0.15, 'sine', 0.04);
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
        if (!session.update(dt)) return;
        const p = ctx.player;
        p.position.x = onTable.x;
        p.position.z = onTable.z;
        p.applyProneLie(TABLE_Y);
        // kneading at the head end (after the puppet's own pose, so this wins)
        masseuse.folk.group.position.set(MASSEUSE_SPOT.x, 0, MASSEUSE_SPOT.z);
        masseuse.folk.group.rotation.y = MASSEUSE_SPOT.face;
        kneadPose(masseuse.folk, session.t);
      },
      dispose() {
        if (session.active) {
          session.stop();
          clearPose();
          ctx.game.hold(false);
        }
      },
      debug: () => ({ busy: session.active, t: +session.t.toFixed(2), ticks: session.ticks }),
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
      ctx.say(['Deita-te na maca…', 'Vou ouvir o teu coração.']);
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

/**
 * I20 — Enfermeira. Only offers a plaster when she really got hurt (a monster bump / comet — game.sinceHurt()):
 * tap the nurse or the plaster box = a colourful plaster flies onto her arm and stays there ~3 min (+mood via
 * feel('doctor'), 1 coin). Not hurt = "Lavaste as mãos hoje?": tap the nurse or the washbasin = the tap runs,
 * soap bubbles rise, "Mãos limpinhas!". (Until 2026-11-19 she offered a plaster to anyone, for nothing.)
 */
registerFolk({
  id: 'enfermeira',
  ref: 'I20',
  group: 'profissao',
  hw: 2.3,
  depth: 3.6,
  where: 'street',
  build(ctx) {
    const g = ctx.root;
    const nurse = new Puppet(ctx, { shirt: 0xffffff, pants: 0x74c0fc, hair: 0xfaa2c1, dress: true, longHair: true }, 0.2, -1.6);
    // plaster box on a small white cabinet (right)
    box(g, mat(0xf8f9fa), 0.7, 0.8, 0.5, 1.3, 0.4, -1.4);
    const tin = box(g, mat(0xff6b9d), 0.4, 0.18, 0.28, 1.3, 0.89, -1.4);
    box(g, mat(0xffffff), 0.16, 0.19, 0.05, 1.3, 0.9, -1.4); // white cross on the lid (stripe)
    box(g, mat(0xffffff), 0.05, 0.19, 0.16, 1.3, 0.9, -1.4);
    ctx.block(0.95, 1.65, -1.65, -1.15, 1.0);
    // washbasin (left)
    cyl(g, mat(0xdee2e6), 0.12, 0.8, -1.3, 0.4, -1.5);
    const basin = cyl(g, mat(0xffffff), 0.36, 0.16, -1.3, 0.86, -1.5);
    cyl(g, mat(0xadb5bd), 0.03, 0.35, -1.3, 1.1, -1.8);
    box(g, mat(0xadb5bd), 0.05, 0.05, 0.22, -1.3, 1.26, -1.7);
    const stream = cyl(g, new THREE.MeshBasicMaterial({ color: 0x9bd3ff, transparent: true, opacity: 0.75 }), 0.025, 0.32, -1.3, 1.08, -1.6);
    stream.visible = false;
    ctx.block(-1.7, -0.9, -1.9, -1.15, 1.0);
    const sparks = new Sparkles(ctx.scene);
    const seq = new Seq();

    const HURT_RECENT = 180; // s: a bump this recent still "hurts"
    const PLASTER_TIME = 180; // s on her arm
    let plaster: THREE.Object3D | null = null;
    let plasterLeft = 0;
    let busy = false;
    const hurtNow = (): boolean => ctx.game.sinceHurt() < HURT_RECENT && !plaster;

    const putPlaster = (): void => {
      busy = true;
      nurse.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
      nurse.work('reach', 1.2);
      ctx.say(['Deixa ver… um penso colorido!']);
      const flying = plasterMesh();
      ctx.fly.send(flying, ctx.at(1.3, -1.4, 1.0), () => limbWorld(ctx.player), 0.8, 0.5, () => {
        plaster = attachPlaster(ctx.player);
        plasterLeft = PLASTER_TIME;
        sparks.burst(limbWorld(ctx.player), 10, [0xff6b9d, 0xffe066, 0x74c0fc, 0xffffff]);
        [659, 784, 988].forEach((f, i) => tone(f, i * 0.08, 0.14, 'triangle', 0.05));
        feel('doctor');
        if (ctx.ready('plaster')) ctx.pay(1, ctx.at(0.2, -1.2, 1.2));
        nurse.nod(1);
        ctx.say(['Pronto! Já passou.']);
        busy = false;
      });
    };
    const washHands = (): void => {
      busy = true;
      nurse.lookAt(ctx.at(-1.3, -1.5));
      nurse.talk(1.5);
      stream.visible = true;
      ctx.say(['Água e sabão… esfrega, esfrega!']);
      for (let i = 0; i < 8; i++) {
        seq.after(0.2 + i * 0.3, () => {
          const p = ctx.game.player;
          sparks.burst(new THREE.Vector3(p.x, 1.0, p.z), 4, [0xffffff, 0xd0ebff, 0xe5dbff], 1.2); // bubbles on her hands
          sparks.burst(ctx.at(-1.3, -1.5, 1.0), 3, [0xffffff, 0xd0ebff], 1.0);
          tone(900 + Math.random() * 500, 0, 0.05, 'sine', 0.025);
        });
      }
      seq.after(2.8, () => {
        stream.visible = false;
        nurse.hop(1.1);
        [523, 784].forEach((f, i) => tone(f, i * 0.1, 0.14, 'triangle', 0.05));
        if (ctx.ready('wash')) ctx.pay(1, ctx.at(-1.3, -1.5, 1.2));
        ctx.say(['Mãos limpinhas!']);
        busy = false;
      });
    };
    const help = (): boolean => {
      if (busy || !ctx.free()) return false;
      if (hurtNow()) putPlaster();
      else washHands();
      return true;
    };
    const tinTap = (): boolean => {
      if (busy || !ctx.free()) return false;
      if (hurtNow()) {
        putPlaster();
        return true;
      }
      nurse.shake(1.1); // no plaster needed: nothing hurts
      ctx.say([plaster ? 'Já tens um penso!' : ctx.game.isBoy() ? 'Não estás magoado. Que bom!' : 'Não estás magoada. Que bom!']);
      return true;
    };

    // QA (?debug): `rainbow-folk-hurt` bumps her (0 coins) so the plaster can be tested.
    const qaHurt = (): void => void ctx.game.hurt(ctx.at(0, 6), 0);
    const DEBUG = new URLSearchParams(location.search).has('debug');
    if (DEBUG) window.addEventListener('rainbow-folk-hurt', qaHurt);

    return {
      things: [
        greetSpot(ctx, nurse, 0.2, -1.6, () =>
          hurtNow() ? 'Ai, magoaste-te? Anda cá, eu ponho-te um penso!' : plaster ? 'Esse penso fica-te bem!' : 'Olá! Lavaste as mãos hoje?',
        ),
        personClick(ctx, nurse, 0.2, -1.6, help),
        clickSpot(ctx, tin, 1.3, -1.4, 1.8, tinTap, 5),
        clickSpot(ctx, basin, -1.3, -1.5, 1.8, () => (busy || !ctx.free() ? false : (washHands(), true)), 5),
      ],
      people: [giftable(nurse, 0.2, -1.6, ctx)],
      update(dt) {
        nurse.update(dt);
        sparks.update(dt);
        seq.update(dt);
        if (plaster) {
          if (!ctx.game.isPaused()) plasterLeft -= dt;
          // the model is rebuilt on a character / clothes change: put it back on the new arm
          if (!isOnPlayer(plaster, ctx.player)) {
            plaster.removeFromParent();
            plaster = attachPlaster(ctx.player);
          }
          if (plasterLeft <= 0) {
            plaster.removeFromParent();
            plaster = null;
          }
        }
      },
      dispose: () => {
        sparks.clear();
        plaster?.removeFromParent();
        plaster = null;
        if (DEBUG) window.removeEventListener('rainbow-folk-hurt', qaHurt);
      },
      debug: () => ({ busy, plaster: !!plaster, plasterLeft: Math.round(plasterLeft), sinceHurt: Math.round(Math.min(9999, ctx.game.sinceHurt())) }),
    };
  },
});

/** A plaster: pink strip with a white pad (≈ 14 × 6 cm). */
function plasterMesh(): THREE.Group {
  const g = new THREE.Group();
  box(g, mat(0xff6b9d), 0.15, 0.065, 0.02, 0, 0, 0);
  box(g, mat(0xffffff), 0.055, 0.05, 0.025, 0, 0, 0);
  return g;
}

/**
 * Where the plaster goes: the outer side of an arm (the camera is behind her, and the dresses hide the knees);
 * characters without arms (unicorn) get it on the outer side of a leg. Character keeps the model private: read it
 * defensively.
 */
function limbPivot(player: Character): THREE.Object3D | null {
  const model = (player as unknown as { model?: { legs?: { pivot: THREE.Object3D }[]; arms?: THREE.Object3D[] } }).model;
  return model?.arms?.[0] ?? model?.legs?.[0]?.pivot ?? null;
}

/** Outer side of the limb (away from the body), a bit below half way down, in the pivot's frame. */
function limbSpot(pivot: THREE.Object3D): { at: THREE.Vector3; side: number } {
  const side = pivot.position.x < 0 ? -1 : 1;
  const bb = new THREE.Box3();
  pivot.updateMatrixWorld(true);
  const inv = pivot.matrixWorld.clone().invert();
  const m = new THREE.Matrix4();
  pivot.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || isPlaster(mesh)) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    bb.union(mesh.geometry.boundingBox!.clone().applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld)));
  });
  if (bb.isEmpty()) return { at: new THREE.Vector3(side * 0.08, -0.4, 0), side };
  const x = side > 0 ? bb.max.x + 0.012 : bb.min.x - 0.012;
  return { at: new THREE.Vector3(x, bb.max.y - (bb.max.y - bb.min.y) * 0.6, (bb.min.z + bb.max.z) / 2), side };
}

function isPlaster(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.plaster) return true;
  return false;
}

function attachPlaster(player: Character): THREE.Object3D {
  const p = plasterMesh();
  p.userData.plaster = true;
  const pivot = limbPivot(player);
  if (pivot) {
    const { at, side } = limbSpot(pivot);
    p.position.copy(at);
    p.rotation.set(0, side * (Math.PI / 2), 0.35); // flat on the outer side of the arm, a little slanted
    p.scale.setScalar(1.5); // cartoon size: readable from the follow camera
    pivot.add(p);
  } else {
    p.position.set(0.25, 1.1, 0);
    p.rotation.y = Math.PI / 2;
    player.root.add(p);
  }
  return p;
}

function limbWorld(player: Character): THREE.Vector3 {
  const pivot = limbPivot(player);
  if (!pivot) return player.root.localToWorld(new THREE.Vector3(0.25, 1.1, 0));
  return pivot.localToWorld(limbSpot(pivot).at);
}

function isOnPlayer(o: THREE.Object3D, player: Character): boolean {
  for (let p = o.parent; p; p = p.parent) if (p === player.root) return true;
  return false;
}
