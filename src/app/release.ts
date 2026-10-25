/** This build's version and "What's new", put in by the build (tools/release/release.ts). */
import type { Release } from '../../tools/release/release';

declare const __RELEASE__: Release | undefined;

export const release: Release = typeof __RELEASE__ === 'undefined' ? { version: '0.000', dev: true, changes: [], earlier: [] } : __RELEASE__;

/** How the version is shown: "0.012", or "0.012 dev" for a build that is not from main. */
export const versionLabel = `${release.version}${release.dev ? ' dev' : ''}`;
