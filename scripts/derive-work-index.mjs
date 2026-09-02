// The Work index is derived from the project source, never authored twice.
//
// work.html's `names` map used to be a hand-maintained second copy of every
// project's title, category, location and thumbnail. A project edited in one
// file and not the other drifted silently, and Add Project would have made
// that a routine hazard. This regenerates it from `static DATA` in
// project.html at build time; SuDu Control regenerates it on every save
// through the same function in lib/content-model.mjs, so the two can never
// disagree no matter which way the edit arrived.
import { readFileSync, writeFileSync } from 'node:fs';
import * as model from '../lib/content-model.mjs';

const projectSrc = readFileSync(model.PROJECT_FILE, 'utf8');
const workSrc = readFileSync(model.WORK_FILE, 'utf8');
const site = model.readSite(projectSrc, workSrc);
const { work } = model.serialise(projectSrc, workSrc, model.reindex(site), site);

if (work === workSrc) {
  console.log('derive-work-index: work.html already matches project.html');
} else {
  writeFileSync(model.WORK_FILE, work);
  console.log('derive-work-index: regenerated the work index from project.html');
}
