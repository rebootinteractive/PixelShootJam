export type ColorKey = 'red' | 'pink' | 'yellow' | 'green' | 'blue' | 'purple';

export type Direction = 'up' | 'right' | 'down' | 'left';

export const ALL_DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];

export const DIR_VECTORS: Record<Direction, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  right: { dc: 1, dr: 0 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
};

export type CellKind = 'void' | 'arena' | 'pixel';

export interface ShooterDef {
  id: string;
  col: number;
  row: number;
  color: ColorKey;
  ammo: number;
  shootsPerSecond: number;
}

export interface WeldDef {
  a: string;
  b: string;
}

export interface LevelData {
  id: string;
  name: string;
  cols: number;
  rows: number;
  cells: CellKind[][];
  pixels: (ColorKey | null)[][];
  shooters: ShooterDef[];
  welds: WeldDef[];
  timeLimit: number;
}
