import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSeed } from '@futuremagic/core';
import { nextSetPiece } from '../src/vgm/dungeons';
import { SET_PIECES } from '../src/world/dungeon/setPieces';

test('vgm: no set piece repeats until the library has been used through', () => {
  for (let w = 0; w < 5; w++) {
    const used: string[] = [];
    for (let i = 0; i < SET_PIECES.length * 2; i++) used.push(nextSetPiece(used, deriveSeed(w, 'cellar', i)));
    assert.equal(new Set(used.slice(0, SET_PIECES.length)).size, SET_PIECES.length, 'the first round: each once');
    assert.equal(new Set(used.slice(SET_PIECES.length)).size, SET_PIECES.length, 'the second round: each once more');
  }
});
