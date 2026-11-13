// Tuning: seven parts per car, seven stages each, bought with cash and fitted by hand (a quick-time game, see
// qte.js). Every stage costs more than the one before. Sport mode is a switch you buy once per car for four times
// the car's price, and it makes the car a good deal quicker everywhere while it is on.
// The save keeps one short string per tuned car: a digit per part in TUNE_PARTS order, then the sport digit
// (0 not bought, 1 bought and off, 2 on), e.g. "72103401". That keeps the cloud save small.
import { brakeOf } from './physics.js';

export const MAX_STAGE = 7;
/** What each stage adds: accel, top speed, grip, brakes (fractions). qte: the fitting game. */
export const TUNE_PARTS = [
  { id: 'turbo', name: 'Turbo', what: 'Top speed, and a spool you can hear', top: 0.02, accel: 0.01, qte: 'spool', job: 'Spool the turbo up' },
  { id: 'engine', name: 'Engine', what: 'Acceleration', accel: 0.03, qte: 'bolts', job: 'Torque the head bolts' },
  { id: 'susp', name: 'Suspension', what: 'Sharper steering', grip: 0.015, qte: 'bolts', job: 'Set the coilovers' },
  { id: 'brakes', name: 'Brakes', what: 'Stopping power', brake: 0.06, qte: 'bleed', job: 'Bleed the brake lines' },
  { id: 'ecu', name: 'ECU tune', what: 'A bit of everything, and more pops', accel: 0.015, top: 0.01, qte: 'bleed', job: 'Flash the new map' },
  { id: 'exhaust', name: 'Exhaust', what: 'Louder, with burbles', accel: 0.01, qte: 'weld', job: 'Weld the new pipes' },
  { id: 'tires', name: 'Tires', what: 'Grip and braking', grip: 0.02, brake: 0.015, qte: 'lugs', job: 'Tighten the wheel nuts' },
];
export const PART = Object.fromEntries(TUNE_PARTS.map((p, i) => [p.id, i]));
/** Sport mode while it is on. */
export const SPORT = { accel: 1.3, top: 1.12, grip: 1.12, brake: 1.2 };

/** Stages fitted to a car, in TUNE_PARTS order (each 0..7). */
export function tuneOf(save, id) {
  const s = String((save.tune && save.tune[id]) || '');
  return TUNE_PARTS.map((_, i) => Math.min(MAX_STAGE, Math.max(0, +s[i] || 0)));
}
/** Sport mode on a car: 0 not bought, 1 bought but off, 2 on. */
export function sportOf(save, id) { return Math.min(2, Math.max(0, +String((save.tune && save.tune[id]) || '')[TUNE_PARTS.length] || 0)); }
export function setTune(save, id, levels, sport = sportOf(save, id)) {
  if (!save.tune || typeof save.tune !== 'object') save.tune = {};
  const s = levels.map((v) => Math.min(MAX_STAGE, Math.max(0, v | 0))).join('') + Math.min(2, Math.max(0, sport | 0));
  if (+s) save.tune[id] = s; else delete save.tune[id];
}
/** What stage n (1..7) of a part costs on this car: each one costs 40% more than the last. */
export function stageCost(spec, stage) {
  const base = Math.min(2400, Math.max(250, (spec.price || 0) * 0.012));
  return Math.round((base * 1.4 ** (stage - 1)) / 50) * 50;
}
/** Sport mode: four times the car. */
export const sportCost = (spec) => Math.max(8000, (spec.price || 0) * 4);

/** The car as it drives with these stages fitted (and sport mode on or off). */
export function tunedSpec(spec, lv, sport = false) {
  if ((!lv || !lv.some(Boolean)) && !sport) return spec;
  let accel = 1, top = 1, grip = 1, brake = 1;
  TUNE_PARTS.forEach((p, i) => { const n = (lv && lv[i]) || 0; accel += (p.accel || 0) * n; top += (p.top || 0) * n; grip += (p.grip || 0) * n; brake += (p.brake || 0) * n; });
  if (sport) { accel *= SPORT.accel; top *= SPORT.top; grip *= SPORT.grip; brake *= SPORT.brake; }
  return { ...spec, accel: spec.accel * accel, top: Math.round(spec.top * top), grip: spec.grip * grip, brake: brakeOf(spec) * brake, nitroPush: sport ? 1.5 : 1, tuned: { lv, sport } };
}
/** Fitting a part: a failed job wastes this share of the price, a perfect one gives this share back. */
export const BOTCH = 0.1, PERFECT_BACK = 0.1;
