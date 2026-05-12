const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rosterPath = path.join(root, 'docs', 'art', 'characters_v1_roster.json');
const sourceRoot = path.join(root, 'public', 'assets', 'characters', 'source');

function fail(message) {
  console.error(`[characters:v1] ${message}`);
  process.exitCode = 1;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

if (!fs.existsSync(rosterPath)) {
  fail(`Missing roster: ${path.relative(root, rosterPath)}`);
  process.exit();
}

const roster = readJson(rosterPath);
const ids = new Set();
const requiredClips = roster.runtimeContract?.defaultClips ?? {};

if (!Array.isArray(roster.characters) || roster.characters.length === 0) {
  fail('Roster has no characters.');
}

for (const character of roster.characters ?? []) {
  if (!character.id || typeof character.id !== 'string') {
    fail('Every character must have an id.');
    continue;
  }

  if (ids.has(character.id)) {
    fail(`Duplicate character id: ${character.id}`);
  }
  ids.add(character.id);

  if (!character.source) {
    fail(`${character.id} is missing source.`);
    continue;
  }

  const sourcePath = path.join(sourceRoot, character.source);
  if (!fs.existsSync(sourcePath)) {
    fail(`${character.id} source not found: ${path.relative(root, sourcePath)}`);
  }

  if (!character.class || !character.role || !character.palette) {
    fail(`${character.id} needs class, role and palette metadata.`);
  }

  if (!Object.prototype.hasOwnProperty.call(requiredClips, character.firstRuntimeClip ?? 'idle')) {
    fail(`${character.id} firstRuntimeClip is not declared in runtimeContract.defaultClips.`);
  }
}

for (const id of roster.productionOrder ?? []) {
  if (!ids.has(id)) {
    fail(`productionOrder references unknown character id: ${id}`);
  }
}

if (!process.exitCode) {
  console.log(`[characters:v1] OK - ${roster.characters.length} source characters registered.`);
}
