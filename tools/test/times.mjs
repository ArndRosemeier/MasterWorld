/**
 * A test reporter for tools/test/run.mjs: how many tests passed and failed. A test file's top-level tests sit one level
 * inside its wrapper (tools/test/claim.mjs), so those count; a wrapper counts only when it failed by itself (the file
 * would not load), not because a test in it failed. One line of JSON.
 */
export default async function* times(source) {
  let pass = 0, fail = 0;
  for await (const e of source) {
    if (e.type !== 'test:pass' && e.type !== 'test:fail') continue;
    const d = e.data;
    if (d.nesting === 1) {
      if (d.name === 'barrier') continue;
      if (e.type === 'test:pass') pass++; else fail++;
    } else if (d.nesting === 0 && e.type === 'test:fail' && d.details?.error?.failureType !== 'subtestsFailed') fail++;
  }
  yield JSON.stringify({ pass, fail }) + '\n';
}
