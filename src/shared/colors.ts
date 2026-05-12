import type { ColorKey } from './types';

export const COLOR_HEX: Record<ColorKey, number> = {
  red: 0xe23a3a,
  pink: 0xee69b3,
  yellow: 0xf6c33b,
  green: 0x3ecc6a,
  blue: 0x3a8de2,
  purple: 0xa45df0,
};

export const COLOR_CSS: Record<ColorKey, string> = {
  red: '#e23a3a',
  pink: '#ee69b3',
  yellow: '#f6c33b',
  green: '#3ecc6a',
  blue: '#3a8de2',
  purple: '#a45df0',
};

export const ALL_COLORS: ColorKey[] = [
  'red',
  'pink',
  'yellow',
  'green',
  'blue',
  'purple',
];
