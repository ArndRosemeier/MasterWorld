import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { outlineCellar, sketchCellar } from '../src/world/dungeon/cellar';
import { checkVariety, testDecision, testHouse } from '../src/world/dungeon/variety';
import { SET_PIECES } from '../src/world/dungeon/setPieces';

const N = SET_PIECES.length;

const lore = classic.dungeons.cellar;

test('cellar: a sample of cellars varies and lacks nothing (the full sweep is npm run variety)', () => {
  const r = checkVariety(lore, 80);
  assert.deepEqual(r.problems, []);
  assert.ok(r.distinct.mainPattern >= 12, `${r.distinct.mainPattern} main patterns`);
  assert.ok(r.distinct.story >= 40, `${r.distinct.story} stories`);
  assert.equal(r.distinct.setPiece, SET_PIECES.length);
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
