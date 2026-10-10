// Audited DICE catalog metadata, GPL-3.0-or-later. No game rules live here.
import manifest from '../../tests/fixtures/game-manifest.json';
import { getControlSchema, type GameControlSchema } from './control-schema';

export interface CatalogRom {
  archive: string;
  expected_member: string;
  accepted_crc32: readonly string[];
  dump_variants: readonly { crc32: string; size_bytes: number }[];
}
export interface GameInfo {
  id: string;
  name: string;
  manufacturer: string;
  year: number;
  players: number;
  sharedControls: boolean;
  controlSchema: GameControlSchema;
  controlFamilies: readonly string[];
  roms: readonly CatalogRom[];
  audioWired: boolean;
  playable: boolean;
}

export const GAMES: readonly GameInfo[] = manifest.games.map((game) => {
  const controlSchema = getControlSchema(game.id);
  if (!controlSchema) throw new Error(`Missing audited control schema for ${game.id}.`);
  return {
    id: game.id,
    name: game.display_name,
    manufacturer: game.manufacturer,
    year: game.year,
    players: controlSchema.players,
    sharedControls: game.input_slots.length < controlSchema.players,
    controlSchema,
    controlFamilies: [...new Set(controlSchema.controls.filter((control) => !['coin', 'start'].includes(control.family)).map((control) =>
      control.family === 'paddle' ? `${control.sourceChip.includes('HORIZONTAL') ? 'Horizontal' : 'Vertical'} paddle` :
        control.family === 'joystick' ? 'Joystick' : control.family === 'wheel' ? 'Steering wheel' :
          control.family === 'throttle' ? 'Throttle' : 'Buttons'))],
    roms: game.roms,
    audioWired: game.audio.mono_output_wired,
    playable: controlSchema.runtime === 'pong',
  };
});

export function getGame(id: string): GameInfo {
  const game = GAMES.find((entry) => entry.id === id);
  if (!game) throw new Error('Unknown game.');
  return game;
}
