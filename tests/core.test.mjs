import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../smart-autofill');
const context = vm.createContext({});
for (const file of ['data/field-rules.js', 'data/resume-schema.js', 'data/profile.js', 'content/detector.js']) {
  vm.runInContext(readFileSync(resolve(root, file), 'utf8'), context, { filename: file });
}
const saf = context.SmartAutofill;
const plain = value => JSON.parse(JSON.stringify(value));

test('manifest contains only storage permission and all packaged assets exist', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.content_scripts[0].matches, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts[0].all_frames, true);
  assert.equal(manifest.content_scripts[0].match_about_blank, true);
  for (const file of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page,
    ...Object.values(manifest.icons), ...manifest.content_scripts[0].js, ...manifest.content_scripts[0].css]) {
    assert.ok(existsSync(resolve(root, file)), file);
  }
});

test('23 distinct common fields are recognized by their own labels', () => {
  assert.equal(saf.FIELD_RULES.length, 23);
  assert.equal(new Set(saf.FIELD_RULES.map(field => field.key)).size, 23);
  for (const field of saf.FIELD_RULES) {
    assert.equal(saf.detectField({ label: field.label })[0].key, field.key, field.label);
  }
});

test('document examples rank phone, email and graduateSchool first', () => {
  assert.equal(saf.detectField({ label: '手机号' })[0].key, 'phone');
  assert.equal(saf.detectField({ type: 'email', placeholder: '请输入邮箱' })[0].key, 'email');
  assert.equal(saf.detectField({ name: 'graduateSchool' })[0].key, 'school');
  assert.equal(saf.detectField({ label: '手机号', type: 'tel', name: 'mobile', placeholder: '请输入手机号' })[0].score, 290);
});

test('autocomplete token, title, camelCase and overlapping keywords use correct weights', () => {
  assert.equal(saf.detectField({ autocomplete: 'section-contact shipping tel' })[0].score, 100);
  assert.equal(saf.detectField({ title: '电子邮箱' })[0].score, 40);
  assert.equal(saf.detectField({ name: 'candidateMobile' })[0].key, 'phone');
  assert.equal(saf.detectField({ name: 'currentCity' })[0].key, 'city');
  assert.equal(saf.detectField({ name: 'departmentName' })[0].key, 'college');
  assert.equal(saf.detectField({ placeholder: '请输入手机号码' })[0].score, 70);
  assert.equal(saf.detectField({ name: 'hotel' }).find(field => field.key === 'phone').score, 0);
  assert.equal(saf.detectField({}).every(field => field.score === 0), true);
});

test('flat and nested JSON imports retain leading zeros and round trip', () => {
  const flat = saf.parseImport('{"name":"示例姓名","phone":"013800000000","postalCode":"010000"}');
  assert.equal(flat.basic.name, '示例姓名');
  assert.equal(flat.basic.phone, '013800000000');
  assert.equal(flat.location.postalCode, '010000');
  assert.equal(flat.education.school, '');
  const exported = JSON.stringify({ version: 1, profile: flat });
  assert.deepEqual(plain(saf.parseImport(exported)), plain(flat));
  assert.equal(saf.parseImport('\ufeff{"education":{"school":"示例大学"}}').education.school, '示例大学');
});

test('invalid imports are rejected rather than replacing saved data', () => {
  for (const text of ['[]', 'null', '{}', '{', '{"profile":null}', '{"phone":13800000000}',
    '{"custom":[]}', '{"basic":{"unknown":"x"}}', '{"__proto__":{"polluted":"x"}}', '{"name":"a","basic":{"name":"b"}}',
    '{"profile":{"basic":{"name":"x"}},"other":1}', JSON.stringify({ name: 'x'.repeat(10001) })]) {
    assert.throws(() => saf.parseImport(text), undefined, text.slice(0, 80));
  }
  assert.throws(() => saf.parseImport(' '.repeat(1024 * 1024 + 1)));
  assert.equal({}.polluted, undefined);
});

test('editable filter ignores sensitive and unsupported controls', () => {
  const element = (tagName, type, extra = {}) => ({ nodeType: 1, tagName, type, hasAttribute: () => false, getAttribute: () => null, ...extra });
  for (const type of ['text', 'tel', 'email', 'number']) assert.equal(saf.isEditableElement(element('INPUT', type)), true);
  assert.equal(saf.isEditableElement(element('TEXTAREA')), true);
  for (const type of ['password', 'hidden', 'date', 'checkbox', 'search', 'file']) assert.equal(saf.isEditableElement(element('INPUT', type)), false);
  assert.equal(saf.isEditableElement(element('INPUT', 'text', { disabled: true })), false);
  assert.equal(saf.isEditableElement(element('TEXTAREA', '', { readOnly: true })), false);
  assert.equal(saf.isEditableElement(element('DIV', '', { isContentEditable: true })), false);
});

test('dropdown exclusion covers native, datalist and semantic custom inputs without excluding plain text', () => {
  const element = (tagName, attributes = {}, parentElement = null) => ({
    nodeType: 1, tagName, type: 'text', parentElement,
    hasAttribute: key => Object.hasOwn(attributes, key),
    getAttribute: key => attributes[key] ?? null,
    ownerDocument: { getElementById: id => id === 'choices' ? element('UL', { role: 'listbox' }) : null }
  });
  for (const attributes of [
    { role: 'combobox' }, { 'aria-haspopup': 'listbox' }, { 'aria-haspopup': 'true' },
    { 'aria-haspopup': 'dialog' }, { 'aria-expanded': 'false' }, { 'aria-autocomplete': 'list' },
    { 'aria-autocomplete': 'both' }, { list: 'cities' }, { 'aria-controls': 'choices' },
    { 'aria-owns': 'choices' }, { placeholder: '请选择学历' }, { placeholder: 'Please select a city' }
  ]) assert.equal(saf.isEditableElement(element('INPUT', attributes)), false, JSON.stringify(attributes));
  assert.equal(saf.isDropdownElement(element('SELECT')), true);
  const wrapper = element('DIV', { role: 'combobox' });
  assert.equal(saf.isEditableElement(element('INPUT', {}, element('DIV', {}, wrapper))), false);
  assert.equal(saf.isEditableElement(element('INPUT', {}, element('DIV', { 'aria-haspopup': 'listbox' }))), false);
  assert.equal(saf.isEditableElement(element('INPUT', { placeholder: '请输入手机号' })), true);
  assert.equal(saf.isEditableElement(element('INPUT', { autocomplete: 'email' })), true);
  assert.equal(saf.isEditableElement(element('INPUT', { 'aria-haspopup': 'false' })), true);
  assert.equal(saf.isEditableElement(element('TEXTAREA')), true);
  // A broad page container outside the local wrapper budget must not exclude unrelated fields.
  let parent = wrapper;
  for (let index = 0; index < 3; index++) parent = element('DIV', {}, parent);
  assert.equal(saf.isEditableElement(element('INPUT', {}, parent)), true);
  const shadowHost = element('DIV', { role: 'combobox' });
  assert.equal(saf.isEditableElement({ ...element('INPUT'), getRootNode: () => ({ host: shadowHost }) }), false);
});
