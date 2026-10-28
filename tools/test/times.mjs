/**
 * A test reporter for tools/test/run.mjs: the seconds each test file's tests took (its top-level tests' times; what
 * it sets up at its top is not counted), and how many tests passed and failed. One line of JSON.
 */
import path from 'node:path';

export default async function* times(source) {
  const per = {};
  let pass = 0, fail = 0;
  for await (const e of source) {
    if ((e.type !== 'test:pass' && e.type !== 'test:fail') || e.data.nesting !== 0 || !e.data.file) continue;
    if (e.type === 'test:pass') pass++; else fail++;
    const file = path.relative(process.cwd(), e.data.file).split(path.sep).join('/');
    per[file] = (per[file] ?? 0) + (e.data.details.duration_ms ?? 0) / 1000;
  }
  yield JSON.stringify({ per, pass, fail }) + '\n';
}
