// Convert explicitly supplied local resume JSON files. Never embed personal values in extension code.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = process.argv[2];
if (!sourceDirectory) throw new Error('Usage: node scripts/convert-profile.mjs SOURCE_DIRECTORY [OUTPUT_DIRECTORY]');
const outputDirectory = resolve(process.argv[3] || resolve(root, 'personal-data'));
const context = vm.createContext({});
for (const file of ['field-rules.js', 'resume-schema.js', 'profile.js']) vm.runInContext(readFileSync(resolve(root, 'smart-autofill/data', file), 'utf8'), context);
const saf = context.SmartAutofill;
const descriptors = saf.schemaDescriptors();
const sourceDescriptors = descriptors.filter(field => field.sourceFile);
const files = new Map([...new Set(sourceDescriptors.map(field => field.sourceFile))].map(file => [file, JSON.parse(readFileSync(resolve(sourceDirectory, file), 'utf8').replace(/^\uFEFF/, ''))]));
const profile = saf.emptyProfile();
const covered = new Set();
function sourceValues(value, path, concrete = [], indices = []) {
  if (!path.length) return [{ value, concrete, indices }];
  const [part, ...rest] = path;
  if (part === '*') {
    if (!Array.isArray(value)) throw new Error('Source record group must be an array');
    return value.flatMap((item, index) => sourceValues(item, rest, [...concrete, String(index)], [...indices, String(index)]));
  }
  if (!value || !Object.hasOwn(value, part)) return [];
  return sourceValues(value[part], rest, [...concrete, part], indices);
}
function leafPaths(value, path = []) {
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  return [path];
}
for (const field of sourceDescriptors) {
  for (const entry of sourceValues(files.get(field.sourceFile), field.sourcePath)) {
    let cursor = 0;
    const destination = field.path.map(part => part === '*' ? entry.indices[cursor++] : part);
    const value = field.schema.type === 'list'
      ? entry.value.map(item => item === null ? '' : String(item))
      : entry.value === null ? '' : String(entry.value);
    saf.setPath(profile, destination, value);
    for (const path of leafPaths(entry.value, entry.concrete)) covered.add(`${field.sourceFile}:${JSON.stringify(path)}`);
  }
}
let leafCount = 0;
for (const [file, value] of files) {
  for (const path of leafPaths(value)) {
    leafCount++;
    assert.ok(covered.has(`${file}:${JSON.stringify(path)}`), `Unmapped source field: ${file}: ${path.join('.')}`);
  }
}
const normalized = saf.normalizeProfile(profile);
// Assert every supplied value survives mapping and normalization; emit only field paths on failure.
for (const field of sourceDescriptors) {
  for (const entry of sourceValues(files.get(field.sourceFile), field.sourcePath)) {
    let cursor = 0;
    const destination = field.path.map(part => part === '*' ? entry.indices[cursor++] : part);
    const expected = field.schema.type === 'list' ? entry.value.map(item => item === null ? '' : String(item)) : entry.value === null ? '' : String(entry.value);
    assert.ok(JSON.stringify(saf.getPath(normalized, destination)) === JSON.stringify(expected), `Conversion mismatch: ${destination.join('.')}`);
  }
}
const importData = { version: saf.PROFILE_VERSION, profile: normalized };
const json = JSON.stringify(importData, null, 2) + '\n';
assert.ok(JSON.stringify(saf.parseImport(json)) === JSON.stringify(normalized), 'Generated JSON must round-trip through the actual extension importer');
function assertEnglishKeys(value) {
  if (Array.isArray(value)) { value.forEach(assertEnglishKeys); return; }
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    assert.ok(/^[a-z][a-zA-Z0-9]*$/.test(key), `Non-English JSON key: ${key}`);
    assertEnglishKeys(child);
  }
}
assertEnglishKeys(importData);
const mapping = {
  version: 2,
  groups: Object.fromEntries(saf.GROUPS.map(group => [group.key, group.label])),
  fields: descriptors.map(field => ({
    key: field.path.join('.'), label: field.label, group: field.group, type: field.schema.type,
    autocomplete: field.schema.autocomplete?.[0] || null,
    fallbackSources: field.schema.legacyKey ? saf.COMMON_FIELD_SOURCES[field.schema.legacyKey] || [] : [],
    sourceFile: field.sourceFile || null, sourcePath: field.sourceFile ? field.sourcePath.join('.') : null
  }))
};
assertEnglishKeys(mapping);
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, 'profile-import.json'), json, 'utf8');
writeFileSync(resolve(root, 'doc/profile-field-mapping.json'), JSON.stringify(mapping, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ sourceFiles: files.size, sourceLeafValues: leafCount, fieldDefinitions: descriptors.length, recordCounts: Object.fromEntries(saf.GROUPS.filter(group => normalized[group.key].records).map(group => [group.key, normalized[group.key].records.length])), importVerified: true, englishKeysVerified: true }));
