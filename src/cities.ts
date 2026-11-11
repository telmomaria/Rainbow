/**
 * The journey: one city per level. 100 coins → travel to the next one.
 * Until the OSM worlds exist, each city is the placeholder world with its own seed and palette.
 */
export interface City {
  name: string;
  /** Spoken/displayed on arrival, e.g. "Chegámos a Roma!" */
  arrival: string;
  seed: number;
  sky: number;
  ground: number;
  road: number;
  buildings: number[];
}

export const COINS_PER_LEVEL = 100;

export const CITIES: City[] = [
  { name: 'Portugal', arrival: 'Vamos explorar Portugal!', seed: 7, sky: 0x8fd3ff, ground: 0x7ccf5b, road: 0xb8b2c4, buildings: [0xff8fab, 0xffc56e, 0x9be37a, 0x7ec8ff, 0xc9a4ff, 0xfff07a] },
  { name: 'Roma', arrival: 'Chegámos a Roma!', seed: 11, sky: 0xa8dcff, ground: 0x9ccf6a, road: 0xd8c7a8, buildings: [0xe9a46b, 0xf2c48d, 0xd9805f, 0xf7dcb1, 0xc96f4a] },
  { name: 'Madrid', arrival: 'Chegámos a Madrid!', seed: 13, sky: 0x9fd8ff, ground: 0xb5cf6a, road: 0xd6c9b5, buildings: [0xf3d9a4, 0xe8b07a, 0xffffff, 0xd98c5f, 0xf6e7c8] },
  { name: 'Londres', arrival: 'Chegámos a Londres!', seed: 17, sky: 0xc6d8e8, ground: 0x6fbf6a, road: 0xa9a9b8, buildings: [0xb5523b, 0xd9d2c5, 0x8a3b2b, 0xe94b3c, 0x5c6b7a] },
  { name: 'Paris', arrival: 'Chegámos a Paris!', seed: 19, sky: 0xb4dcff, ground: 0x86cf73, road: 0xcfc6bd, buildings: [0xf0e6d2, 0xe3d3b3, 0x9aa9c4, 0xffd6e0, 0xd8cbb0] },
  { name: 'Varsóvia', arrival: 'Chegámos a Varsóvia!', seed: 23, sky: 0xaed6f5, ground: 0x7fc76b, road: 0xbdb8c6, buildings: [0xf7c873, 0xe57373, 0x81c784, 0x64b5f6, 0xffb74d] },
  { name: 'Vilnius', arrival: 'Chegámos a Vilnius!', seed: 29, sky: 0xb9dcf2, ground: 0x7cc77a, road: 0xc2bcc9, buildings: [0xfff1c1, 0xf6b26b, 0xead1dc, 0xb6d7a8, 0xffe599] },
  { name: 'Moscovo', arrival: 'Chegámos a Moscovo!', seed: 31, sky: 0xc5e0f5, ground: 0xe8f0f5, road: 0xb0b4c4, buildings: [0xd32f2f, 0x388e3c, 0xfbc02d, 0x1976d2, 0xf5f5f5] },
  { name: 'Pequim', arrival: 'Chegámos a Pequim!', seed: 37, sky: 0xcfe3f0, ground: 0x8fc96b, road: 0xc7b9a6, buildings: [0xc62828, 0xffb300, 0x2e7d32, 0xd84315, 0xfdd835] },
  { name: 'Rio de Janeiro', arrival: 'Chegámos ao Rio de Janeiro!', seed: 41, sky: 0x7fd0ff, ground: 0x5fcf5b, road: 0xf2e2b6, buildings: [0x00bfa5, 0xffeb3b, 0xff7043, 0x42a5f5, 0xffffff] },
  { name: 'Cidade do México', arrival: 'Chegámos à Cidade do México!', seed: 43, sky: 0x8fd0ff, ground: 0x9ccf5b, road: 0xd9c3a0, buildings: [0xff4081, 0x00bcd4, 0xffc107, 0x8bc34a, 0xff5722] },
  { name: 'Reiquiavique', arrival: 'Chegámos a Reiquiavique!', seed: 47, sky: 0xb3d4ec, ground: 0x9cc79a, road: 0xa7adb8, buildings: [0xe53935, 0x1e88e5, 0xfdd835, 0xffffff, 0x43a047] },
  { name: 'Nuuk', arrival: 'Chegámos a Nuuk, na Gronelândia!', seed: 53, sky: 0xc9e4f5, ground: 0xf1f6f9, road: 0xb9c3cc, buildings: [0xd50000, 0x2962ff, 0xffd600, 0x00c853, 0xffffff] },
];

export function cityAt(level: number): City {
  return CITIES[Math.min(Math.max(level, 0), CITIES.length - 1)];
}
