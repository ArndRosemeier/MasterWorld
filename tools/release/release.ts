/**
 * The game's version and its "What's new", from git at build time: every commit on main after BASE is one
 * build, 0.001 more than the one before (main takes one squashed commit per merged pull request, and the
 * Pages workflow deploys each). A commit's subject is its line in "What's new"; the commits up to BASE are
 * the history before versions began.
 */
import { execFileSync } from 'node:child_process';

/** The last commit before versions began: the next commit on main is 0.001. */
export const BASE = 'c3bdc39f7557eb790f80d0610b4a9ab15364ed39';

export interface Change {
  /** '0.001' and on; '' for the history before versions. */
  version: string;
  /** Commit day, YYYY-MM-DD. */
  date: string;
  text: string;
}

export interface Release {
  /** This build's version, '0.000' when the history is not known. */
  version: string;
  /** Built from a branch or a working copy, not from main. */
  dev: boolean;
  /** Newest first. */
  changes: Change[];
  /** The history before 0.001, newest first. */
  earlier: Change[];
}

export const versionName = (n: number): string => (n / 1000).toFixed(3);

/** A commit subject as a player reads it: without the pull request number at the end. */
export const changeText = (subject: string): string => subject.replace(/\s*\(#\d+\)\s*$/, '').trim();

/** Lines of `git log --format=%cs%x09%s`, oldest first, into numbered changes, newest first. */
export function numberChanges(lines: string[], numbered: boolean): Change[] {
  return lines
    .filter((l) => l.includes('\t'))
    .map((l, i) => {
      const [date, ...rest] = l.split('\t');
      return { version: numbered ? versionName(i + 1) : '', date, text: changeText(rest.join('\t')) };
    })
    .reverse();
}

/** Read the release from the git history in `cwd` (a shallow or missing history gives version 0.000). */
export function readRelease(cwd: string, onMain: boolean): Release {
  const git = (...args: string[]): string[] => execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\n').filter(Boolean);
  try {
    if (git('rev-parse', '--is-shallow-repository')[0] === 'true') throw new Error('shallow');
    const changes = numberChanges(git('log', '--first-parent', '--reverse', '--format=%cs%x09%s', `${BASE}..HEAD`), true);
    const earlier = numberChanges(git('log', '--first-parent', '--reverse', '--format=%cs%x09%s', BASE), false);
    const dirty = git('status', '--porcelain', '--untracked-files=no').length > 0;
    return { version: changes[0]?.version ?? versionName(0), dev: !onMain || dirty, changes, earlier };
  } catch {
    return { version: versionName(0), dev: true, changes: [], earlier: [] };
  }
}
