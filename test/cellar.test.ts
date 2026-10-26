import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { outlineCellar, sketchCellar } from '../src/world/dungeon/cellar';
import { checkVariety, testDecision, testHouse } from '../src/world/dungeon/variety';
import { setPiecesFor } from '../src/world/dungeon/setPieces';

const SET_PIECES = setPiecesFor('cellar');
const N = SET_PIECES.length;

const lore = classic.dungeons.cellar;

test('cellar: a sample of cellars varies and lacks nothing (the full sweep is npm run variety)', () => {
  const r = checkVariety(lore, 80);
  assert.deepEqual(r.problems, []);
  assert.ok(r.distinct.mainPattern >= 12, `${r.distinct.mainPattern} main patterns`);
  assert.ok(r.distinct.story >= 40, `${r.distinct.story} stories`);
  assert.equal(r.distinct.setPiece, SET_PIECES.length);
});

test('barrow: a sample of barrows varies and lacks nothing, with their own lore and set pieces', () => {
  const r = checkVariety(classic.dungeons.barrow!, 60, 2, 'barrow');
  assert.deepEqual(r.problems, []);
  assert.equal(r.distinct.setPiece, setPiecesFor('barrow').length);
  assert.ok(setPiecesFor('barrow').some((p) => p.kinds?.includes('barrow')), 'set pieces of their own');
});

for (const kind of ['cave', 'tower'] as const) {
  test(`${kind}: a sample varies and lacks nothing, with its own lore and set pieces`, () => {
    const r = checkVariety(classic.dungeons[kind]!, 60, 2, kind);
    assert.deepEqual(r.problems, []);
    assert.equal(r.distinct.setPiece, setPiecesFor(kind).length);
    assert.ok(setPiecesFor(kind).some((p) => p.kinds?.length === 1 && p.kinds[0] === kind), 'set pieces of its own');
  });
}

test('tower: its rooms climb (the goal up the tower), a cellar at most one storey under its foot', () => {
  for (let n = 1; n <= 12; n++) {
    const c = outlineCellar(testDecision(n, 1, 'tower'), testHouse(n), classic.dungeons.tower!);
    const L = c.layout, goal = L.rooms.find((r) => r.id === c.graph.goal)!;
    assert.ok(L.levels[0] >= -1, `tower ${n}: ${L.levels}`);
    assert.ok(goal.level >= 1, `tower ${n}: goal on storey ${goal.level}`);
  }
});

test('cellar: the same decision gives the same cellar', () => {
  const a = outlineCellar(testDecision(5), testHouse(5), lore), b = outlineCellar(testDecision(5), testHouse(5), lore);
  assert.deepEqual(a, b);
});

test('cellar: history first: layers oldest first, the house named, hints and facts for the household', () => {
  const s = sketchCellar(testDecision(2), testHouse(2), lore);
  assert.equal(s.history[s.history.length - 1].layer, 'now');
  assert.ok(s.history.every((h) => !h.text.includes('{house}')));
  assert.ok(s.hints.length >= 2 && s.facts.length >= 4);
  assert.deepEqual(s.knownBy, { town: 'town-1', building: 2 });
});

test('cellar: the broken floor looks down on the goal from a fallen room; the way down is around', () => {
  for (let i = 0; i < 6 * N; i += N) {
    const c = outlineCellar(testDecision(i), testHouse(i), lore);
    assert.equal(c.setPiece.id, 'broken-floor');
    const l = c.graph.links.find((x) => x.id === c.pieceLink)!;
    assert.equal(l.kind, 'drop');
    assert.equal(c.rooms[l.a].use.id, 'collapse');
    assert.ok(c.graph.rooms[l.b].height === 2 && c.graph.rooms[l.b].level === -1, 'a tall hall below');
    assert.ok(c.history.some((h) => h.def.id === 'collapse'));
  }
});

test('cellar: the bricked wall is a detective puzzle: a paler wall and a ledger that gives it away', () => {
  for (let i = 1; i < 6 * N; i += N) {
    const c = outlineCellar(testDecision(i), testHouse(i), lore);
    assert.equal(c.setPiece.id, 'bricked-wall');
    const l = c.graph.links.find((x) => x.id === c.pieceLink)!;
    assert.equal(l.kind, 'secret');
    const told = c.clues.filter((k) => k.link === l.id);
    assert.ok(told.some((k) => k.text.includes('mason')) && told.some((k) => k.text.includes('hollow')));
    assert.ok(c.props.some((p) => p.kind === 'ledger' && p.clue !== undefined));
    assert.ok(!c.pace.needsSecret, 'the goal can be reached without it');
  }
});

test('cellar: every set piece hangs on its link, leaves a clue that points at it, and its own room use', () => {
  assert.ok(N >= 10, `${N} set pieces`);
  for (let k = 0; k < N; k++) for (let i = k; i < k + 3 * N; i += N) {
    const c = outlineCellar(testDecision(i), testHouse(i), lore);
    const p = SET_PIECES[k];
    assert.equal(c.setPiece.id, p.id);
    const l = c.graph.links.find((x) => x.id === c.pieceLink);
    assert.ok(l, `${p.id}: its link`);
    assert.ok(c.clues.some((x) => x.link === l.id && c.props.some((q) => q.clue === c.clues.indexOf(x))), `${p.id}: a clue on a prop`);
    if (p.use) {
      const r = p.use.room(c.graph, l);
      if (r !== c.graph.entrance && r !== c.graph.goal && r !== c.pace.safe) assert.equal(c.rooms[r].use.id, p.use.id, `${p.id}: its room`);
    }
  }
});

test('cellar: an entrance room with a door in every cell still has its ladder up to the hatch (found by the loop check)', () => {
  // Seed '99', the third promise: a 2 x 2 entrance room with four doors.
  const d = { kind: 'dungeon', id: 'cellar-3', template: 'cellar', town: 'town-1', building: 25, seed: 1271959754, setPiece: 'barred-view', danger: 18, at: 9.14 } as const;
  const house = { kind: 'cottage', hu: 2.672, hv: 2.7196 };
  const c = outlineCellar(d, house, lore);
  const entrance = c.layout.rooms[0];
  assert.equal(entrance.w * entrance.d, 4);
  assert.equal(c.layout.links.flatMap((l) => l.doors).filter((dr) => dr.room === entrance.id).length, 4);
  assert.equal(c.hatch?.kind, 'ladder');
  assert.equal(c.hatch.room, entrance.id);
});
