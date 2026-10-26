/// <reference lib="webworker" />
/** Actors' human worker, its pack requests queued and retried (packFetch.ts). */
import { installPackFetch } from './packFetch';
import '@actors/human/worker';

installPackFetch(self);
