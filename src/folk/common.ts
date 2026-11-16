import * as THREE from 'three';
import type { Interactable } from '../world';
import { PERSON_CLEAR, Puppet, clickSpot, touchSpot } from './kit';
import type { FolkCtx } from './types';

/** Greeting on approach: wave, look at her, say greeting + one short line. */
export function greetSpot(ctx: FolkCtx, who: Puppet, lx: number, lz: number, line: string | (() => string), radius = 3.2): Interactable {
  return touchSpot(
    ctx,
    who.group,
    lx,
    lz,
    radius,
    () => {
      who.lookAt(new THREE.Vector3(ctx.game.player.x, 0, ctx.game.player.z));
      who.wave(1.4);
      const extra = typeof line === 'function' ? line() : line;
      ctx.say([ctx.greeting(), extra]);
    },
    undefined,
    PERSON_CLEAR,
  );
}

/** Click/Enter on a person: always stops short (PERSON_CLEAR) so she never walks into them. */
export function personClick(
  ctx: FolkCtx,
  who: Puppet,
  lx: number,
  lz: number,
  onUse: () => void | boolean,
  radius = 2.5,
  reach = 5,
): Interactable {
  return clickSpot(ctx, who.group, lx, lz, radius, onUse, reach, PERSON_CLEAR);
}

/** She can give this person a flower or an apple. */
export function giftable(who: Puppet, lx: number, lz: number, ctx: FolkCtx) {
  return { object: who.group, position: ctx.at(lx, lz), thank: () => who.hop(1.4) };
}

/** One short curiosity per city (the king). */
export const CITY_FACT: Record<string, string> = {
  Porto: 'Sabias que o Porto tem um rio chamado Douro?',
  Roma: 'Sabias que em Roma há um circo antigo muito grande?',
  Madrid: 'Sabias que Madrid fica bem no meio de Espanha?',
  Londres: 'Sabias que em Londres os autocarros são vermelhos?',
  Paris: 'Sabias que Paris tem uma torre muito alta?',
  Varsóvia: 'Sabias que Varsóvia é a capital da Polónia?',
  Vilnius: 'Sabias que Vilnius é a capital da Lituânia?',
  Moscovo: 'Sabias que em Moscovo há uma praça muito colorida?',
  Pequim: 'Sabias que Pequim tem uma muralha muito antiga?',
  Tóquio: 'Sabias que em Tóquio há comboios super rápidos?',
  'Rio de Janeiro': 'Sabias que o Rio tem uma montanha com uma estátua no cimo?',
  'Cidade do México': 'Sabias que a Cidade do México é muito grande?',
  Reiquiavique: 'Sabias que em Reiquiavique se vêem luzes no céu?',
  Nuuk: 'Sabias que Nuuk fica na Gronelândia, bem a norte?',
  'Estados Unidos': 'Sabias que os Estados Unidos são um país muito grande?',
  Lua: 'Sabias que na Lua não há vento?',
};
