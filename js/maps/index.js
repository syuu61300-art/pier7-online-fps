// Map registry. Each map module exports `def` (name, bounds, theme…) and `build(renderer, quality)`.
import * as pier7 from './pier7.js';
import * as oldtown from './oldtown.js';
import * as frostlab from './frostlab.js';
import * as quarry from './quarry.js';
import * as metro from './metro.js';

const MODULES = [pier7, oldtown, frostlab, quarry, metro];

export const MAPS = MODULES.map((m) => m.def);
export const MAP_IDS = MAPS.map((d) => d.id);
export const DEFAULT_MAP = 'pier7';

export function mapDef(id) {
  return MAPS.find((d) => d.id === id) || MAPS[0];
}

export function buildMap(id, renderer, quality) {
  const mod = MODULES.find((m) => m.def.id === id) || MODULES[0];
  return mod.build(renderer, quality);
}
