/// <reference lib="webworker" />
/** Actors' animal worker, its pack requests queued and retried (packFetch.ts). */
import { installPackFetch } from './packFetch';
import '@actors/animal/worker';

installPackFetch(self);
