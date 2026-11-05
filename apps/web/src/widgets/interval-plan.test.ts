import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, intervalPlan, phaseStart, pomodoroPlan, positionAt, roundOf, roundsTotal, totalMs } from './interval-plan.ts';

const MIN = 60_000;
const pomo = { focusMin: 25, shortMin: 5, longMin: 15, rounds: 4 };

test('pomodoro: 4 focus, 3 short breaks, then a long break', () => {
  const plan = pomodoroPlan(pomo);
  assert.deepEqual(plan.map((p) => p.label), ['Focus', 'Short break', 'Focus', 'Short break', 'Focus', 'Short break', 'Focus', 'Long break']);
  assert.equal(totalMs(plan), (4 * 25 + 3 * 5 + 15) * MIN);
  assert.deepEqual(pomodoroPlan({ ...pomo, rounds: 1 }).map((p) => p.label), ['Focus', 'Long break']);
});

test('interval: rest only between rounds, rest 0 is skipped', () => {
  const plan = intervalPlan({ workSec: 30, restSec: 10, rounds: 3 });
  assert.deepEqual(plan.map((p) => p.label), ['Work', 'Rest', 'Work', 'Rest', 'Work']);
  assert.equal(totalMs(plan), (3 * 30 + 2 * 10) * 1000);
  assert.equal(intervalPlan({ workSec: 30, restSec: 0, rounds: 3 }).length, 3);
});

test('config values are clamped', () => {
  assert.equal(clamp(Number.NaN, 1, 9), 1);
  assert.equal(clamp(-5, 1, 9), 1);
  assert.equal(clamp(99, 1, 9), 9);
  assert.equal(clamp(2.9, 1, 9), 2);
  const wild = pomodoroPlan({ focusMin: 1e9, shortMin: -3, longMin: Number.NaN, rounds: 500 });
  assert.equal(wild.length, 24);
  assert.equal(wild[0]?.ms, 180 * MIN);
  assert.equal(wild[1]?.ms, 1 * MIN);
});

test('positionAt: start, middle, exact boundary', () => {
  const plan = pomodoroPlan(pomo);
  assert.deepEqual(positionAt(plan, 0, false)?.index, 0);
  assert.equal(positionAt(plan, 0, false)?.remainingMs, 25 * MIN);
  const mid = positionAt(plan, 10 * MIN, false);
  assert.equal(mid?.index, 0);
  assert.equal(mid?.remainingMs, 15 * MIN);
  const edge = positionAt(plan, 25 * MIN, false);
  assert.equal(edge?.index, 1); // exactly at the end of Focus: the break has started
  assert.equal(edge?.remainingMs, 5 * MIN);
});

test('positionAt: finished, looping, odd input', () => {
  const plan = intervalPlan({ workSec: 30, restSec: 10, rounds: 2 }); // 30 + 10 + 30 = 70 s
  const done = positionAt(plan, 70_000, false);
  assert.equal(done?.done, true);
  assert.equal(done?.remainingMs, 0);
  assert.equal(done?.index, 2);
  const again = positionAt(plan, 70_000 + 35_000, true);
  assert.equal(again?.done, false);
  assert.equal(again?.cycle, 1);
  assert.equal(again?.index, 1); // 35 s into the second cycle is inside the rest
  assert.equal(positionAt([], 5, false), null);
  assert.equal(positionAt(plan, -50, false)?.index, 0);
  assert.equal(positionAt(plan, Number.NaN, false)?.index, 0);
});

test('phaseStart and rounds', () => {
  const plan = pomodoroPlan(pomo);
  assert.equal(phaseStart(plan, 0), 0);
  assert.equal(phaseStart(plan, 2), 30 * MIN);
  assert.equal(roundsTotal(plan), 4);
  assert.equal(roundOf(plan, 0), 1);
  assert.equal(roundOf(plan, 1), 1);
  assert.equal(roundOf(plan, 2), 2);
  assert.equal(roundOf(plan, 7), 4);
});
