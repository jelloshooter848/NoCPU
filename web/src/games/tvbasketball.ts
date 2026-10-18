// SPDX-License-Identifier: GPL-3.0-or-later
// TV Basketball (Midway, 1974): browser access to the original games/tvbasketball.cpp.
import type { GameDefinition } from './types';

/** Game length: the clock counts down from 120 once per period of the 9D 555
 * astable, ln 2 x (R + 2 x 15 kOhm) x 22 uF, R the play-time potentiometer. */
const seconds = (ohms: number) => Math.round(120 * Math.LN2 * (ohms + 30000) * 22e-6);

export const tvbasketball = {
  id: 'tvbasketball',
  coreId: 10,
  title: 'TV Basketball',
  verified: false,
  playerCount: 4,
  // Four PADDLEn_VERTICAL_INPUT chips. Measured on the original raster: a
  // larger canonical axis moves a player down. In a two-player game (one coin)
  // paddle 1 moves both striped players and paddle 2 both solid players.
  channels: [
    { label: 'Left striped player', kind: 'paddle', orientation: 'vertical', slot: 0, axisSign: 1, negative: 'p1Up', positive: 'p1Down', pad: 0, axis: 1 },
    { label: 'Right solid player', kind: 'paddle', orientation: 'vertical', slot: 1, axisSign: 1, negative: 'p2Up', positive: 'p2Down', pad: 1, axis: 1 },
    { label: 'Right striped player', kind: 'paddle', orientation: 'vertical', slot: 2, axisSign: 1, negative: 'p3Up', positive: 'p3Down', pad: 2, axis: 1 },
    { label: 'Left solid player', kind: 'paddle', orientation: 'vertical', slot: 3, axisSign: 1, negative: 'p4Up', positive: 'p4Down', pad: 3, axis: 1 },
  ],
  buttons: [],
  starts: 1,
  hasHit: false,
  hasAttract: false,
  // The striped team's score (left) and the solid team's score (right).
  scoreSlots: 2,
  // POT1 "playtime", 10..60 kOhm on the 9D clock astable; original default 35 kOhm.
  settings: [
    { kind: 'percent', key: 'playtimeOhms', label: 'Play time', testId: 'playtime', minOhms: 10000, maxOhms: 60000, defaultOhms: 35000 },
  ],
  labels: {
    p1Up: 'Left striped player up', p1Down: 'Left striped player down',
    p2Up: 'Right solid player up', p2Down: 'Right solid player down',
    p3Up: 'Right striped player up', p3Down: 'Right striped player down',
    p4Up: 'Left solid player up', p4Down: 'Left solid player down',
  },
  keys: {
    p1Up: ['KeyW'], p1Down: ['KeyS'], p2Up: ['ArrowUp'], p2Down: ['ArrowDown'],
    p3Up: ['KeyI'], p3Down: ['KeyK'], p4Up: ['KeyT'], p4Down: ['KeyG'],
  },
  text: {
    info: 'Two teams, striped and solid, bat the ball into the baskets. One coin is a two-player game, two coins a four-player game.',
    rules: (options) => `Insert one coin for a two-player game or two coins for a four-player game, then press Start. Move your players up and down; the ball bounces off them and off the walls. In a two-player game the left striped control moves both striped players and the right solid control both solid players; in a four-player game each control moves one player. A ball in the right-hand basket scores two points for the striped team (the left score), in the left-hand basket two points for the solid team (the right score). The clock counts down from 120 and ends the game: with the current play-time setting (${Math.round(((options.playtimeOhms ?? 35000) - 10000) / 500)}%) after about ${seconds(options.playtimeOhms ?? 35000)} seconds. A coin always clears the scores and restarts the clock, even during a game.`,
    gamepad: 'Controllers 1 to 4 move the left striped, right solid, right striped and left solid players with their vertical axis. A moved joystick sets the player\'s height; a centered joystick leaves the last position alone. Direction buttons move the player.',
    status: 'Insert one coin (two players) or two (four players), then Start',
  },
} as const satisfies GameDefinition;
