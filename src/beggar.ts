import * as THREE from 'three';
import { speak, tone } from './audio';
import type { Interactable, Obstacle } from './world';

export interface BeggarHooks {
  coins(): number;
  /** Take one coin from the character (updates HUD/save). */
  giveCoin(): void;
}

/**
 * A poor woman sitting on a blanket with a cup. Walk up to her:
 * - with coins: one coin flies into her cup, she stands up happy, hearts float up, she thanks you;
 * - she only accepts once per city (afterwards she just waves and smiles);
 * - with no coins: she smiles and wishes a good walk.
 */
export function createBeggar(scene: THREE.Scene, obstacles: Obstacle[], at: THREE.Vector3, hooks: BeggarHooks): Interactable {
  const g = new THREE.Group();
  g.position.copy(at);
  g.rotation.y = Math.PI; // faces +Z (towards the road / spawn)
  scene.add(g);

  const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 1.6), mat(0x8d6e63));
  blanket.position.y = 0.03;
  blanket.receiveShadow = true;
  g.add(blanket);

  // person (sitting pose = body lowered; standing = raised)
  const person = new THREE.Group();
  g.add(person);
  const coat = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.6, 4, 12), mat(0x6d7f99));
  coat.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 14), mat(0xe0b48c));
  head.position.y = 1.45;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 16), mat(0xc0392b));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.2;
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5d4037));
  hat.position.y = 1.52;
  const eyeMat = mat(0x222222);
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeMat);
    e.position.set(s * 0.09, 1.48, -0.25);
    return e;
  });
  // mouth: a small torus arc; flipped = sad, normal = smile
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12, Math.PI), eyeMat);
  mouth.position.set(0, 1.37, -0.26);
  mouth.rotation.z = 0; // arc opening down = sad frown (set below)
  person.add(coat, head, scarf, hat, mouth, ...eyes);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.7), mat(0x4e5d6c));
  legs.position.set(0, 0.17, -0.35);
  person.add(legs);
  const arm = new THREE.Group();
  arm.position.set(0.36, 1.1, 0);
  const armMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.45, 4, 8), mat(0x6d7f99));
  armMesh.position.y = -0.28;
  arm.add(armMesh);
  person.add(arm);
  person.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  const SIT_Y = -0.35;
  person.position.y = SIT_Y;

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.22, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xb0bec5, side: THREE.DoubleSide }));
  cup.position.set(-0.3, 0.14, -0.75);
  g.add(cup);

  obstacles.push({ minX: at.x - 0.6, maxX: at.x + 0.6, minZ: at.z - 0.6, maxZ: at.z + 0.6 });

  // effects
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.05, 18),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa800, emissiveIntensity: 0.5 }),
  );
  coin.visible = false;
  scene.add(coin);
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, -0.25);
  heartShape.bezierCurveTo(-0.45, 0.05, -0.2, 0.35, 0, 0.15);
  heartShape.bezierCurveTo(0.2, 0.35, 0.45, 0.05, 0, -0.25);
  const heartGeo = new THREE.ShapeGeometry(heartShape);
  const heartMat = new THREE.MeshBasicMaterial({ color: 0xff4d8d, side: THREE.DoubleSide, transparent: true });
  const hearts = Array.from({ length: 6 }, () => {
    const h = new THREE.Mesh(heartGeo, heartMat.clone());
    h.visible = false;
    scene.add(h);
    return h;
  });

  let received = false;
  let coinT = -1; // coin flight progress 0..1, -1 idle
  const coinFrom = new THREE.Vector3();
  let happyT = -1; // seconds since she got the coin
  let waveT = -1;
  const cupWorld = () => cup.getWorldPosition(new THREE.Vector3());
  const setSmile = (smile: boolean) => {
    mouth.rotation.z = smile ? Math.PI : 0;
    mouth.position.y = smile ? 1.39 : 1.36;
  };
  setSmile(false);

  return {
    object: g,
    position: at.clone(),
    radius: 1.9,
    interact(ctx) {
      if (!received && hooks.coins() > 0) {
        received = true;
        hooks.giveCoin();
        coinFrom.copy(ctx.player).setY(1.4);
        coinT = 0;
        tone(988, 0, 0.08, 'square', 0.06);
      } else if (received) {
        waveT = 0;
        void speak(['Olá outra vez! Obrigada, já tenho o suficiente.']);
      } else {
        waveT = 0;
        setSmile(true);
        void speak(['Olá! Bom passeio!']);
      }
    },
    update(dt) {
      // coin arcs from the character into the cup
      if (coinT >= 0) {
        coinT = Math.min(1, coinT + dt * 1.6);
        const to = cupWorld();
        coin.visible = true;
        coin.position.lerpVectors(coinFrom, to, coinT);
        coin.position.y += Math.sin(coinT * Math.PI) * 1.2;
        coin.rotation.x += dt * 12;
        if (coinT >= 1) {
          coin.visible = false;
          coinT = -1;
          happyT = 0;
          tone(1319, 0, 0.12, 'triangle', 0.08);
          [523, 659, 784].forEach((f, i) => tone(f, 0.12 + i * 0.1, 0.25, 'triangle', 0.08));
          setSmile(true);
          void speak(['Muito obrigada! Tens um coração de ouro!']);
          hearts.forEach((h, i) => {
            h.visible = true;
            h.position.copy(g.position).add(new THREE.Vector3((i - 2.5) * 0.25, 1.8, 0));
            h.userData.v = 0.8 + Math.random() * 0.6;
            (h.material as THREE.MeshBasicMaterial).opacity = 1;
          });
        }
      }
      // stand up, little happy hops, then sit again (smiling from now on)
      if (happyT >= 0) {
        happyT += dt;
        const up = happyT < 3 ? Math.min(1, happyT * 3) : Math.max(0, 1 - (happyT - 3) * 2);
        person.position.y = SIT_Y + (0 - SIT_Y) * up + (happyT < 3 ? Math.abs(Math.sin(happyT * 9)) * 0.15 * up : 0);
        legs.visible = up < 0.5;
        arm.rotation.z = 2.5 + Math.sin(happyT * 10) * 0.4;
        for (const h of hearts) {
          if (!h.visible) continue;
          h.position.y += (h.userData.v as number) * dt;
          h.lookAt(h.position.clone().add(new THREE.Vector3(0, 0, 1)));
          const m = h.material as THREE.MeshBasicMaterial;
          m.opacity = Math.max(0, m.opacity - dt * 0.4);
          if (m.opacity <= 0) h.visible = false;
        }
        if (happyT > 3.6) {
          happyT = -1;
          arm.rotation.z = 0;
          person.position.y = SIT_Y;
          legs.visible = true;
        }
      }
      // wave
      if (waveT >= 0) {
        waveT += dt;
        arm.rotation.z = 2.4 + Math.sin(waveT * 10) * 0.4;
        if (waveT > 1.6) {
          waveT = -1;
          arm.rotation.z = 0;
        }
      }
    },
  };
}
