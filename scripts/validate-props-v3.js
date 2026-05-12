const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const promptPath = path.join(projectRoot, 'docs', 'art', 'props_v3_prompts.json');
const productionPath = path.join(projectRoot, 'docs', 'art', 'props_v3_production.json');
const decorRoot = path.join(projectRoot, 'public', 'assets', 'decorations');
const strict = process.argv.includes('--strict');

const allowedCategories = new Set(['ruins', 'altar', 'torch', 'statue']);
const expectedCountByCategory = {
  ruins: 4,
  altar: 4,
  torch: 4,
  statue: 4,
};

function fail(message) {
  throw new Error(message);
}

if (!fs.existsSync(promptPath)) {
  fail(`Missing prompt manifest: ${promptPath}`);
}

const manifest = JSON.parse(fs.readFileSync(promptPath, 'utf8'));
const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
const seenFiles = new Set();
const categoryCounts = {};
const pendingFiles = [];
const promptFiles = new Set();

for (const category of allowedCategories) {
  const dir = path.join(decorRoot, category);
  if (!fs.existsSync(dir)) {
    fail(`Missing decoration category folder: ${path.relative(projectRoot, dir)}`);
  }
}

for (const asset of assets) {
  if (!asset || typeof asset !== 'object') fail('Invalid asset entry.');
  if (!allowedCategories.has(asset.category)) fail(`Invalid category: ${asset.category}`);
  if (typeof asset.prompt !== 'string' || asset.prompt.trim().length < 80) {
    fail(`Prompt is too short for ${asset.file}`);
  }
  if (typeof asset.file !== 'string') fail(`Invalid file path for ${asset.category}`);
  if (seenFiles.has(asset.file)) fail(`Duplicate target file: ${asset.file}`);
  seenFiles.add(asset.file);
  promptFiles.add(asset.file.replace(/\\/g, '/'));

  const normalized = asset.file.replace(/\\/g, '/');
  const expectedPrefix = `public/assets/decorations/${asset.category}/`;
  if (!normalized.startsWith(expectedPrefix)) {
    fail(`Target file is outside expected category folder: ${asset.file}`);
  }
  if (!normalized.endsWith('_v3.png')) {
    fail(`V3 prop target must end with _v3.png: ${asset.file}`);
  }

  categoryCounts[asset.category] = (categoryCounts[asset.category] || 0) + 1;

  const absoluteTarget = path.join(projectRoot, normalized);
  if (!fs.existsSync(absoluteTarget)) {
    pendingFiles.push(normalized);
  }
}

for (const [category, expectedCount] of Object.entries(expectedCountByCategory)) {
  const actualCount = categoryCounts[category] || 0;
  if (actualCount !== expectedCount) {
    fail(`Expected ${expectedCount} ${category} prompts, found ${actualCount}.`);
  }
}

if (strict && pendingFiles.length > 0) {
  fail(`Missing generated V3 assets:\n${pendingFiles.map(file => `- ${file}`).join('\n')}`);
}

let production = null;
if (fs.existsSync(productionPath)) {
  production = JSON.parse(fs.readFileSync(productionPath, 'utf8'));
  const validStatuses = new Set(['ready_for_imagegen', 'generated', 'approved', 'rejected', 'queued']);
  const masterSet = Array.isArray(production.masterSet) ? production.masterSet : [];
  const queuedSet = Array.isArray(production.queuedSet) ? production.queuedSet : [];
  if (masterSet.length !== 4) fail(`Expected 4 master-set props, found ${masterSet.length}.`);
  if (production.chromaKey !== '#ff00ff') fail('V3 production chromaKey must stay #ff00ff for green/moss props.');

  const productionFiles = new Set();
  for (const item of masterSet) {
    const file = item.file?.replace(/\\/g, '/');
    if (!promptFiles.has(file)) fail(`Master-set file has no prompt entry: ${item.file}`);
    if (!validStatuses.has(item.status)) fail(`Invalid production status for ${item.file}: ${item.status}`);
    if (productionFiles.has(file)) fail(`Duplicate production file: ${item.file}`);
    productionFiles.add(file);
  }
  for (const fileRaw of queuedSet) {
    const file = String(fileRaw).replace(/\\/g, '/');
    if (!promptFiles.has(file)) fail(`Queued file has no prompt entry: ${fileRaw}`);
    if (productionFiles.has(file)) fail(`Queued file duplicates master set: ${fileRaw}`);
    productionFiles.add(file);
  }
  if (productionFiles.size !== assets.length) {
    fail(`Production manifest covers ${productionFiles.size} files, expected ${assets.length}.`);
  }
}

console.log(JSON.stringify({
  prompts: assets.length,
  categories: categoryCounts,
  pendingAssets: pendingFiles.length,
  masterSet: production?.masterSet?.length ?? 0,
  queuedSet: production?.queuedSet?.length ?? 0,
  strict,
}, null, 2));
