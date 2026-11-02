import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryAnimal } from '@actors/animal/library';
import { BIRD_CLIPS, LIBRARY_KINDS, OTTER_CLIPS, libraryClip, type AnimalDoing, type LibraryKind } from '../src/render/libraryAnimals';
// @ts-expect-error a plain .mjs tool without types
import { libraryIds } from '../tools/packs/library.mjs';

test('every library kind names animals in the catalogue, and each has a clip for every doing it lists', () => {
  for (const [kind, k] of Object.entries(LIBRARY_KINDS) as [string, LibraryKind][]) {
    for (const id of new Set(k.ids)) {
      const names = libraryAnimal(id).clips.map((c) => c.name);
      for (const doing of Object.keys(k.clips) as AnimalDoing[]) {
        const clip = libraryClip({ clipNames: names, clipFor: () => undefined }, k, doing);
        assert.ok(clip, `${kind}: ${id} has none of ${k.clips[doing]?.join(', ')} for ${doing}`);
      }
    }
  }
});

test('npm run packs copies exactly the library animals the kinds name', () => {
  const named = [...new Set(Object.values(LIBRARY_KINDS).flatMap((k) => k.ids))].sort();
  assert.deepEqual(libraryIds(), named);
});

test('the hero\'s bird (the pheasant) and otter (the mink) have every clip their forms play', () => {
  for (const [kind, clips] of [['pheasant', BIRD_CLIPS], ['otter', OTTER_CLIPS]] as const) {
    const names = libraryAnimal(LIBRARY_KINDS[kind].ids[0]).clips.map((c) => c.name);
    for (const [doing, clip] of Object.entries(clips)) assert.ok(names.includes(clip), `${kind} ${doing}: ${clip}`);
  }
});
