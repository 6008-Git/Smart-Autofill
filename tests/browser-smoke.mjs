// Dependency-free DevTools Protocol smoke tests. No Playwright, Selenium, or application server.
// Run: node tests/browser-smoke.mjs chrome   (or edge)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const browserName = process.argv[2] || 'chrome';
const executables = {
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
};
assert.ok(executables[browserName], 'Use chrome or edge');
const profileDir = mkdtempSync(resolve(artifacts, `smoke-${browserName}-`));
const downloadDir = resolve(profileDir, 'downloads');
mkdirSync(downloadDir);
const child = spawn(executables[browserName], [
  '--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--disable-features=Translate,MediaRouter',
  `--user-data-dir=${profileDir}`, 'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });

let sequence = 0;
let buffer = '';
let diagnostic = '';
const pending = new Map();
const listeners = new Map();
const sockets = new Map();
const loads = new Map();
child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-2000); });
child.stdio[4].on('data', chunk => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf('\0')) !== -1) {
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id) {
      const request = pending.get(message.id);
      if (request) {
        clearTimeout(request.timer); pending.delete(message.id);
        message.error ? request.reject(new Error(`${request.method}: ${message.error.message}`)) : request.resolve(message.result);
      }
    } else {
      for (const handler of listeners.get(message.method) || []) handler(message.params, message.sessionId);
    }
  }
});
child.on('error', error => { for (const request of pending.values()) request.reject(error); });
child.on('exit', code => {
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(`Browser exited (${code}): ${diagnostic}`)); }
  pending.clear();
});
function send(method, params = {}, sessionId) {
  return new Promise((resolveRequest, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}. ${diagnostic}`)); }, 15000);
    pending.set(id, { resolve: resolveRequest, reject, timer, method });
    child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
}
function on(method, handler) { listeners.set(method, [...(listeners.get(method) || []), handler]); }
on('Page.loadEventFired', (_params, session) => loads.set(session, (loads.get(session) || 0) + 1));
async function page(url) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  sockets.set(targetId, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 850, deviceScaleFactor: 1, mobile: false }, sessionId);
  if (url) await send('Page.navigate', { url }, sessionId);
  return sessionId;
}
async function evaluate(session, expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, session);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
  return result.result.value;
}
async function until(session, expression, description, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(session, expression)) return;
    await delay(50);
  }
  throw new Error(`Not observed: ${description}`);
}
async function click(session, selector) {
  const rect = await evaluate(session, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw Error('Missing element'); for(let parent=el.parentElement;parent;parent=parent.parentElement) if(parent.tagName==='DETAILS') parent.open=true; el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...rect }, session);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...rect }, session);
  await delay(100);
}
async function key(session, key, code = key) {
  const virtual = { Tab: 9, Escape: 27, ArrowDown: 40, Enter: 13 }[key];
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtual, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) }, session);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtual }, session);
  await delay(100);
}
async function altZ(session) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 1 }, session);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 1 }, session);
  await delay(100);
}
async function clickShadow(session, hostSelector) {
  const rect=await evaluate(session, `(() => {const host=document.querySelector(${JSON.stringify(hostSelector)}); host.scrollIntoView({block:'center'}); const r=host.shadowRoot.querySelector('input').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await send('Input.dispatchMouseEvent', {type:'mousePressed',button:'left',clickCount:1,...rect},session);
  await send('Input.dispatchMouseEvent', {type:'mouseReleased',button:'left',clickCount:1,...rect},session);
  await delay(100);
}
async function clickFrame(session, selector) {
  const rect=await evaluate(session,`(() => {const frame=document.getElementById('test-frame');frame.scrollIntoView({block:'center'});const el=frame.contentDocument.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'nearest'});const f=frame.getBoundingClientRect(),r=el.getBoundingClientRect();return {x:f.left+frame.clientLeft+r.left+r.width/2,y:f.top+frame.clientTop+r.top+r.height/2};})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect},session);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect},session);
  await delay(100);
}
async function screenshot(session, file) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' }, session);
  writeFileSync(resolve(artifacts, `${browserName}-${file}.png`), Buffer.from(data, 'base64'));
}
async function selectCascade(session, branches, fieldKey) {
  await click(session,'.saf-cascade-trigger');
  for(const id of branches) await click(session,`.saf-cascade-branch[data-node-id="${id}"]`);
  await click(session,`.saf-cascade-leaf[data-field-key="${fieldKey}"]`);
  await click(session,'.saf-confirm');
}
let checks = 0;
function pass(label) { checks++; console.log(`PASS ${browserName}: ${label}`); }
const errors = [];
on('Runtime.exceptionThrown', (params, session) => errors.push({ session, text: params.exceptionDetails.exception?.description || params.exceptionDetails.text }));

try {
  const version = await send('Browser.getVersion');
  console.log(`Browser: ${version.product}`);
  const extension = await send('Extensions.loadUnpacked', { path: resolve(root, 'smart-autofill') });
  const extensionId = extension.id;
  assert.ok(extensionId, 'Extension ID returned');
  pass('Manifest V3 extension loads');
  const options = await page(`chrome-extension://${extensionId}/options/options.html`);
  await until(options, '!!document.querySelector("#save-button") && !document.querySelector("#save-button").disabled', 'options loaded');
  assert.equal(await evaluate(options, 'document.querySelectorAll("[data-field-path]").length === SmartAutofill.schemaDescriptors().filter(field => !field.path.includes("*")).length'), true);
  assert.equal(await evaluate(options, 'document.querySelectorAll("[data-add-records]").length'), 7);
  pass('options renders all fixed fields and seven repeatable record groups with empty defaults');
  await screenshot(options, 'options-empty');
  const fakeProfile = {
    basic: { name: '虚构测试姓名', phone: '13800000000', email: 'fixture@example.invalid', gender: '男', birthday: '2000-01-01', idCard: '000000000000000000', ethnicity: '汉族' },
    education: { school: '示例大学', college: '示例学院', major: '计算机科学', educationLevel: '本科', degree: '学士', enrollmentDate: '2018-09', graduationDate: '2022-06' },
    location: { hometown: '示例籍贯', province: '示例省', city: '示例城市', address: '示例地址\n第二行', postalCode: '010000' },
    job: { currentCompany: '示例单位', currentPosition: '测试岗位', expectedPosition: '示例意向岗位', expectedCity: '示例意向城市' }
  };
  await evaluate(options, `(() => {
    const profile = ${JSON.stringify(fakeProfile)};
    for (const [group, fields] of Object.entries(profile)) for (const [key,value] of Object.entries(fields)) document.getElementById('profile-'+key).value = value;
    document.querySelector('#profile-name').dispatchEvent(new Event('input', {bubbles:true}));
  })()`);
  await click(options, '#save-button');
  await until(options, 'document.querySelector("#save-status").textContent.includes("已保存")', 'saved profile');
  const stored = await evaluate(options, '(async () => (await chrome.storage.local.get("profile")).profile)()');
  assert.equal(stored.basic.phone, fakeProfile.basic.phone);
  pass('UI saves profile to chrome.storage.local');
  const beforeReload = loads.get(options) || 0;
  await send('Page.reload', {}, options);
  for (let i = 0; i < 120 && (loads.get(options) || 0) <= beforeReload; i++) await delay(50);
  assert.ok((loads.get(options) || 0) > beforeReload, 'reload completed');
  await until(options, '!!document.querySelector("#save-button") && !document.querySelector("#save-button").disabled', 'options reloaded');
  assert.equal(await evaluate(options, 'document.querySelector("#profile-phone").value'), fakeProfile.basic.phone);
  pass('profile persists across refresh');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: false }, options);
  assert.equal(await evaluate(options, 'document.documentElement.scrollWidth <= window.innerWidth'), true);
  await screenshot(options, 'options-mobile');
  pass('options fits 375px viewport');
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 850, deviceScaleFactor: 1, mobile: false }, options);

  const session = await page();
  on('Fetch.requestPaused', async (params, source) => {
    if (source !== session) return;
    if (params.request.url === 'http://saf-fixture.test/' || params.request.url === 'http://saf-fixture.test/frame') {
      await send('Fetch.fulfillRequest', {
        requestId: params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
        body: Buffer.from(params.request.url.endsWith('/frame') ? '<!doctype html><html><body><label>手机号<input id="frame-input" type="tel"></label></body></html>' : readFileSync(resolve(root, 'tests/fixture.html'))).toString('base64')
      }, source);
    } else await send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'BlockedByClient' }, source);
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, session);
  await send('Page.navigate', { url: 'http://saf-fixture.test/' }, session);
  await until(session, 'document.readyState === "complete" && !!document.getElementById("phone")', 'fixture ready');
  await delay(400);
  assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false);
  pass('no menu on page load');
  await evaluate(session, 'document.getElementById("phone").focus()');
  await altZ(session);
  await until(session,'!!document.querySelector(".saf-menu")','Alt+Z menu');
  assert.equal(await evaluate(session,'document.getElementById("phone").value'),'');
  await click(session,'.saf-menu-item:not(:disabled)');
  assert.equal(await evaluate(session,'document.getElementById("phone").value'),fakeProfile.basic.phone);
  await evaluate(session,'document.getElementById("phone").value=""');
  pass('Alt+Z manually opens on script-focused input and only fills after a user choice');
  for (const id of ['password','readonly','combo-input','datalist-input','select-placeholder']) {
    await evaluate(session,`document.getElementById(${JSON.stringify(id)}).focus()`);
    await altZ(session);
    assert.equal(await evaluate(session,'!!document.querySelector(".saf-menu")'),false,id);
  }
  await click(session,'#outside');await altZ(session);
  assert.equal(await evaluate(session,'!!document.querySelector(".saf-menu")'),false);
  await evaluate(session,'document.getElementById("phone").focus();document.getElementById("phone").dispatchEvent(new KeyboardEvent("keydown",{key:"z",code:"KeyZ",altKey:true,bubbles:true}))');
  assert.equal(await evaluate(session,'!!document.querySelector(".saf-menu")'),false);
  pass('shortcut excludes dropdowns, password, readonly, non-input focus and synthetic key events');
  await click(session,'#stopped');
  assert.equal(await evaluate(session,'!!document.querySelector(".saf-menu")'),true);
  await key(session,'Escape');await altZ(session);
  assert.equal(await evaluate(session,'!!document.querySelector(".saf-menu")'),true);
  await click(session,'.saf-menu-item:not(:disabled)');
  assert.equal(await evaluate(session,'document.getElementById("stopped").value'),fakeProfile.basic.phone);
  pass('capture listeners survive page click/keyboard propagation blockers');
  await clickShadow(session,'#shadow-field');
  assert.equal(await evaluate(session,'!!document.querySelector(".saf-menu")'),true);
  await key(session,'Escape');await altZ(session);
  assert.equal(await evaluate(session,'!!document.querySelector(".saf-menu")'),true);
  await click(session,'.saf-menu-item:not(:disabled)');
  assert.equal(await evaluate(session,'document.querySelector("#shadow-field").shadowRoot.querySelector("input").value'),fakeProfile.basic.phone);
  await clickShadow(session,'#shadow-dropdown');await altZ(session);
  assert.equal(await evaluate(session,'!!document.querySelector(".saf-menu")'),false);
  pass('open Shadow DOM supports click/shortcut filling while dropdown hosts stay excluded');
  for (const kind of ['http','srcdoc']) {
    await evaluate(session,`(() => {document.getElementById('test-frame')?.remove();const frame=document.createElement('iframe');frame.id='test-frame';frame.style='width:800px;height:500px;border:0;display:block';${kind==='http' ? "frame.src='/frame';" : "frame.srcdoc='<!doctype html><html><body><label>手机号<input id=frame-input type=tel></label></body></html>';"}document.body.append(frame);})()`);
    await until(session,'!!document.getElementById("test-frame").contentDocument?.getElementById("frame-input")','frame ready');
    await delay(500);
    await clickFrame(session,'#frame-input');
    await until(session,'!!document.getElementById("test-frame").contentDocument.querySelector(".saf-menu")','iframe menu');
    await key(session,'Escape');await altZ(session);
    assert.equal(await evaluate(session,'!!document.getElementById("test-frame").contentDocument.querySelector(".saf-menu")'),true);
    await clickFrame(session,'.saf-menu-item:not(:disabled)');
    assert.equal(await evaluate(session,'document.getElementById("test-frame").contentDocument.getElementById("frame-input").value'),fakeProfile.basic.phone);
    assert.equal(await evaluate(session,'document.getElementById("phone").value'),'');
    pass(`${kind} iframe supports click and Alt+Z while filling only its selected field`);
  }
  await evaluate(session,'document.getElementById("test-frame").remove();window.events=[]');
  await evaluate(session, 'document.getElementById("phone").focus()');
  assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false);
  await click(session, '#outside');
  await click(session, '#script-focus');
  assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false);
  pass('programmatic focus is ignored');
  await click(session, '#phone');
  await until(session, '!!document.querySelector(".saf-menu")', 'phone menu');
  assert.equal(await evaluate(session, 'document.querySelector(".saf-label").textContent'), '手机号');
  assert.equal(await evaluate(session, 'document.getElementById("phone").value'), '');
  assert.equal(await evaluate(session, 'document.querySelector(".saf-menu").textContent.includes("13800000000")'), false);
  const menuBox = await evaluate(session, '(() => {const r=document.querySelector(".saf-menu").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,right:r.right,bottom:r.bottom}})()');
  assert.equal(menuBox.width, 224);
  assert.ok(menuBox.x >= 8 && menuBox.y >= 8 && menuBox.right <= 1092 && menuBox.bottom <= 842);
  await screenshot(session, 'menu');
  pass('top five candidates appear, menu fits viewport, no automatic fill or exposed values');
  await evaluate(session, 'document.querySelector(".saf-menu-item:not(:disabled)").click()');
  assert.equal(await evaluate(session, 'document.getElementById("phone").value'), '');
  assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), true);
  pass('page scripts cannot fill by dispatching a synthetic candidate click');
  await click(session, '.saf-menu-item:not(:disabled)');
  assert.equal(await evaluate(session, 'document.getElementById("phone").value'), fakeProfile.basic.phone);
  assert.deepEqual(await evaluate(session, 'window.events.filter(event => event.id === "phone").map(event => event.type)'), ['input', 'change']);
  assert.equal(await evaluate(session, 'document.activeElement.id'), 'phone');
  assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false);
  pass('one click fills only target, dispatches input/change, keeps focus and closes');
  await evaluate(session, `window.gestures=[]; for (const type of ['pointerdown','focusin','focusout','click','blur']) document.addEventListener(type,e => window.gestures.push({type,target:e.target.id||e.target.className,related:e.relatedTarget?.id,trusted:e.isTrusted}),true)`);
  for (const [id, label, expected] of [['email','邮箱',fakeProfile.basic.email], ['school','学校',fakeProfile.education.school], ['text','详细地址',fakeProfile.location.address]]) {
    await click(session, `#${id}`);
    try { await until(session, '!!document.querySelector(".saf-label")', `${id} menu`); }
    catch (error) {
      await screenshot(session, 'failure');
      console.log('Diagnostics:', JSON.stringify({ errors, state: await evaluate(session, '({active:document.activeElement?.id, menu:!!document.querySelector(".saf-menu"), gestures:window.gestures})') }));
      throw error;
    }
    assert.equal(await evaluate(session, 'document.querySelector(".saf-label").textContent'), label);
    await click(session, '.saf-menu-item:not(:disabled)');
    assert.equal(await evaluate(session, `document.getElementById(${JSON.stringify(id)}).value`), expected);
  }
  pass('email, graduateSchool and textarea are recognized and filled');
  await click(session, '#tracked');
  await click(session, '.saf-menu-item:not(:disabled)');
  assert.equal(await evaluate(session, 'window.controlledState'), fakeProfile.basic.phone);
  await click(session, '#model');
  await click(session, '.saf-menu-item:not(:disabled)');
  assert.equal(await evaluate(session, 'window.modelState'), fakeProfile.basic.phone);
  pass('native setter bypasses own property tracker; input event updates model binding');
  for (const id of ['password', 'readonly', 'unsupported', 'editable']) {
    await click(session, `#${id}`);
    assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false, id);
  }
  pass('password, readonly, date and contenteditable controls are ignored');
  for (const id of ['native-select', 'datalist-input', 'combo-input', 'wrapped-combo', 'popup-input', 'linked-input', 'expanded-input', 'autocomplete-list', 'select-placeholder']) {
    await click(session, `#${id}`);
    assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false, id);
    if (id === 'native-select') await key(session, 'Escape');
    else assert.equal(await evaluate(session, `document.getElementById(${JSON.stringify(id)}).value`), '', id);
  }
  pass('native selects, datalists and custom dropdown inputs never trigger autofill');
  await click(session, '#combo-input');
  await key(session, 'ArrowDown');
  assert.equal(await evaluate(session, 'document.activeElement.id'), 'combo-input');
  assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false);
  await click(session, '#dynamic-dropdown');
  await until(session, '!!document.querySelector(".saf-menu")', 'initial plain-text menu');
  await evaluate(session, 'document.getElementById("dynamic-dropdown").setAttribute("role", "combobox")');
  await key(session, 'ArrowDown');
  assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false);
  assert.equal(await evaluate(session, 'document.activeElement.id'), 'dynamic-dropdown');
  assert.equal(await evaluate(session, 'document.getElementById("dynamic-dropdown").value'), '');
  pass('dropdown keyboard behavior stays native and dynamic dropdown conversion closes menu');
  await click(session, '#phone'); await click(session, '#outside');
  assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false);
  await click(session, '#phone'); await key(session, 'Escape');
  assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false);
  await click(session, '#phone'); await evaluate(session, 'document.getElementById("phone").blur()');
  assert.equal(await evaluate(session, '!!document.querySelector(".saf-menu")'), false);
  pass('outside click, Escape and blur dismiss menu');
  await click(session, '#outside'); await key(session, 'Tab');
  // Tab reaches script-focus button; Tab once more reaches bottom phone.
  await key(session, 'Tab');
  await until(session, '!!document.querySelector(".saf-menu")', 'keyboard focus menu');
  assert.equal(await evaluate(session, 'document.activeElement.id'), 'bottom');
  await key(session, 'ArrowDown');
  assert.equal(await evaluate(session, 'document.activeElement.classList.contains("saf-close")'), true);
  await key(session, 'ArrowDown');
  assert.equal(await evaluate(session, 'document.activeElement.classList.contains("saf-menu-item")'), true);
  await key(session, 'Enter');
  assert.equal(await evaluate(session, 'document.getElementById("bottom").value'), fakeProfile.basic.phone);
  pass('Tab focus and keyboard candidate selection work');
  await click(session, '#unknown');
  await selectCascade(session,['job'],'expectedCity');
  assert.equal(await evaluate(session, 'document.getElementById("unknown").value'), fakeProfile.job.expectedCity);
  pass('manual correction can select any of 23 fields');
  await click(session, '#number');
  await evaluate(session, 'document.getElementById("number").value = "42"');
  await selectCascade(session,['education'],'school');
  assert.equal(await evaluate(session, 'document.getElementById("number").value'), '42');
  assert.deepEqual(await evaluate(session, 'window.events.filter(event => event.id === "number")'), []);
  assert.equal(await evaluate(session, 'document.querySelector(".saf-status").textContent.includes("数字")'), true);
  await key(session, 'Escape');
  pass('invalid number does not wipe an input or dispatch fill events');
  await click(session, '#bottom');
  const bottomMenu = await evaluate(session, 'document.querySelector(".saf-menu").getBoundingClientRect().bottom <= innerHeight-8');
  assert.equal(bottomMenu, true);
  await screenshot(session, 'menu-bottom');
  pass('menu near bottom stays within viewport');

  const importPath = resolve(artifacts, `${browserName}-import.json`);
  writeFileSync(importPath, JSON.stringify({ name: '导入测试姓名', phone: '13900000000' }));
  const { root: documentRoot } = await send('DOM.getDocument', {}, options);
  const { nodeId } = await send('DOM.querySelector', { nodeId: documentRoot.nodeId, selector: '#import-file' }, options);
  await send('DOM.setFileInputFiles', { nodeId, files: [importPath] }, options);
  await until(options, '!document.querySelector("#import-preview").hidden', 'import preview');
  assert.equal(await evaluate(options, '(async () => (await chrome.storage.local.get("profile")).profile.basic.phone)()'), fakeProfile.basic.phone);
  await click(options, '#confirm-import');
  await until(options, 'document.querySelector("#backup-status").textContent === "导入完成。"', 'confirmed import');
  assert.equal(await evaluate(options, 'document.querySelector("#profile-phone").value'), '13900000000');
  assert.equal(await evaluate(options, 'document.querySelector("#profile-school").value'), '');
  pass('JSON preview leaves storage intact; confirmation replaces saved profile');
  await click(session, '#phone');
  await click(session, '.saf-menu-item:not(:disabled)');
  assert.equal(await evaluate(session, 'document.getElementById("phone").value'), '13900000000');
  pass('open webpage receives updated local profile without reload');
  writeFileSync(importPath, '{"phone":123}');
  const { root: afterRoot } = await send('DOM.getDocument', {}, options);
  const { nodeId: afterNode } = await send('DOM.querySelector', { nodeId: afterRoot.nodeId, selector: '#import-file' }, options);
  await send('DOM.setFileInputFiles', { nodeId: afterNode, files: [importPath] }, options);
  await until(options, 'document.querySelector("#backup-status").classList.contains("is-error")', 'invalid import rejected');
  assert.equal(await evaluate(options, '(async () => (await chrome.storage.local.get("profile")).profile.basic.phone)()'), '13900000000');
  pass('invalid JSON data preserves saved profile');

  rmSync(resolve(downloadDir, 'smart-autofill-profile.json'), { force: true });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true });
  const downloadEvents = [];
  on('Browser.downloadProgress', params => downloadEvents.push(params));
  await click(options, '#export-button');
  for (let i = 0; i < 100 && !downloadEvents.some(event => event.state === 'completed'); i++) await delay(50);
  assert.ok(downloadEvents.some(event => event.state === 'completed'), 'JSON download complete');
  const backup = JSON.parse(readFileSync(resolve(downloadDir, 'smart-autofill-profile.json'), 'utf8'));
  assert.equal(backup.profile.basic.phone, '13900000000');
  pass('JSON export downloads valid saved-profile backup');
  const expandedProfile = { version: 2, profile: {
    basic: { name: '完整资料测试姓名', phone: '13900000000', emergencyContact: {name: '示例紧急联系人', phone:'01000000000'} },
    educationHistory: { records: [{ school: '示例大学一', major:'示例专业一',college:'示例学院一',educationLevel:'本科',degree:'学士',dateRange:'2018.09-2022.06',researchFocus:'网页开发、嵌入式开发（信息3表单）；字节表单填「区块链、LLM」' }, { school: '示例大学二', major:'示例专业二',college:'示例学院二',educationLevel:'硕士',degree:'硕士',dateRange:'2024-09-01 至 2027-06-30', notes:'备注第一段\n第二段' }, {school:'示例高中',educationLevel:'高中',city:'示例省示例市示例县',dateRange:'2015-09-01 至 2018-06-10'}] },
    workExperience: { records: [{ company:'示例公司一',position:'过去岗位',dateRange:'2019-01 至 2022-01', responsibilities:['工作一','工作二'] }, { company:'示例公司二',position:'当前岗位',dateRange:'2024-07-01 至今',responsibilities:['职责第一条','职责第二条'] }] },
    family: { records:[{name:'示例成员一',relationship:'父亲'}] }, certificates: {records:[{name:'示例证书',score:'00123'}]},
    awards: {records:[{name:'示例奖励'}]}, publications: {records:[{title:'示例论文',status:'示例状态'}]},
    projects: {records:[{name:'项目一',highlights:['亮点一','亮点二']},{name:'项目二',role:'示例角色'}]},
    skills: {categories:{programmingLanguages:['Java','Python'],aiSkills:['示例技能']}}, selfAssessment: {summary:'评价第一段\n评价第二段'},
    job: {targetPositions:['研发岗位','测试岗位'],preferredWorkCities:['示例城市一','示例城市二'],campusApplication:{referralCode:'00001234',preferredCities:['示例城市一','示例城市二']}},
    location:{currentResidence:'浙江省杭州市示例地址'}
  }};
  writeFileSync(importPath, JSON.stringify(expandedProfile));
  const {root: expandedRoot} = await send('DOM.getDocument', {}, options);
  const {nodeId: expandedInput} = await send('DOM.querySelector', {nodeId:expandedRoot.nodeId,selector:'#import-file'}, options);
  await send('DOM.setFileInputFiles', {nodeId:expandedInput,files:[importPath]}, options);
  await until(options, '!document.querySelector("#import-preview").hidden', 'complete profile preview');
  assert.equal(await evaluate(options, 'document.querySelector("#import-breakdown").textContent.includes("教育经历：3 条")'), true);
  await click(options, '#confirm-import');
  await until(options, 'document.querySelector("#backup-status").textContent === "导入完成。"', 'complete profile imported');
  assert.equal(await evaluate(options, 'document.getElementById("profile-educationHistory-records-1-school").value'), '示例大学二');
  assert.equal(await evaluate(options, 'document.getElementById("profile-selfAssessment-summary").value'), '评价第一段\n评价第二段');
  assert.equal(await evaluate(options, 'document.getElementById("profile-workExperience-records-1-responsibilities").value'), '职责第一条\n职责第二条');
  assert.equal(await evaluate(options, '(async()=>SmartAutofill.groupStats((await chrome.storage.local.get("profile")).profile).filter(group=>group.hasData).every(group=>document.getElementById("section-"+group.key).open))()'), true);
  for (const [id,expected] of Object.entries({school:'示例大学二',college:'示例学院二',major:'示例专业二',educationLevel:'硕士',degree:'硕士',enrollmentDate:'2024-09-01',graduationDate:'2027-06-30',currentCompany:'示例公司二',currentPosition:'当前岗位',expectedPosition:'研发岗位、测试岗位',expectedCity:'示例城市一、示例城市二',province:'浙江省',city:'杭州市',address:'浙江省杭州市示例地址'})) {
    assert.equal(await evaluate(options, `document.getElementById(${JSON.stringify('profile-'+id)}).value`),expected,id);
  }
  assert.equal(await evaluate(options, 'document.getElementById("profile-school-source").textContent.includes("示例大学二")'),true);
  pass('import preview lists categories, populated sections auto-expand and common fields show source defaults');
  // Check every displayed field, including all record groups, against the actual persisted schema.
  assert.equal(await evaluate(options, '(async()=>{const profile=(await chrome.storage.local.get("profile")).profile;return Array.from(document.querySelectorAll("[data-field-path]")).every(control=>{const raw=SmartAutofill.getPath(profile,control.dataset.fieldPath.split("."));const expected=control.dataset.legacyKey?SmartAutofill.profileValue(profile,control.dataset.legacyKey):Array.isArray(raw)?raw.join("\\n"):raw;return control.value===expected;});})()'), true);
  pass('every fixed, nested, list and repeated field displays its imported value without omissions');
  await evaluate(options,'document.getElementById("section-education").scrollIntoView({block:"start"})');
  await screenshot(options,'education-summary');
  await evaluate(options, 'document.getElementById("section-educationHistory").open=true; document.getElementById("section-educationHistory").scrollIntoView({block:"start"})');
  await screenshot(options, 'education-records');
  pass('full v2 import renders independent records, nested fields, lists and multiline text');
  assert.equal(await evaluate(options,'Array.from(document.querySelectorAll("[data-record-heading]")).every(node=>!/^.*第\\s*\\d+\\s*条/.test(node.textContent) && !/^教育经历 \\d+$/.test(node.textContent))'),true);
  for (const text of ['示例大学二','示例公司二','父亲','示例证书','示例奖励','示例论文','项目二']) {
    assert.equal(await evaluate(options,`Array.from(document.querySelectorAll('[data-record-heading]')).some(node=>node.textContent.includes(${JSON.stringify(text)}))`),true,text);
  }
  pass('all seven record categories show content summaries in profile management');
  const oldSchoolValue=await evaluate(session,'document.getElementById("school").value');
  await click(session,'#school');
  assert.equal(await evaluate(session,'document.querySelector(".saf-menu").dataset.version'),'0.3.3');
  assert.equal(await evaluate(session,'!!document.querySelector(".saf-picker")'),false);
  await click(session,'.saf-cascade-trigger');
  await click(session,'.saf-cascade-branch[data-node-id="education"]');
  assert.equal(await evaluate(session,'document.querySelector(".saf-cascade-leaf[data-field-key=school]").disabled'),false);
  await click(session,'.saf-cascade-branch[data-node-id="educationHistory"]');
  await click(session,'.saf-cascade-branch[data-node-id="educationHistory.records.1"]');
  assert.equal(await evaluate(session,'document.querySelectorAll(".saf-cascade-column").length'),3);
  await click(session,'.saf-cascade-leaf[data-field-key="educationHistory.records.1.school"]');
  assert.equal(await evaluate(session,'document.getElementById("school").value'),oldSchoolValue);
  assert.equal(await evaluate(session,'document.querySelector(".saf-selected-path").textContent.includes("示例大学二 · 硕士 · 示例专业二")'),true);
  for (const text of ['13900000000','备注第一段','职责第一条']) assert.equal(await evaluate(session,`document.querySelector('.saf-menu').textContent.includes(${JSON.stringify(text)})`),false);
  await screenshot(session,'cascade');
  pass('cascade groups and records stay stable, imported school is enabled, selection waits for confirmation');
  await click(session,'.saf-cascade-search');
  await key(session,'ArrowDown');
  for(let index=0;index<4;index++) await key(session,'ArrowDown');
  assert.equal(await evaluate(session,'document.activeElement.dataset.nodeId'),'educationHistory');
  await key(session,'ArrowRight');
  assert.equal(await evaluate(session,'document.activeElement.dataset.level'),'1');
  await key(session,'ArrowDown');
  await key(session,'ArrowRight');
  assert.equal(await evaluate(session,'document.activeElement.dataset.level'),'2');
  await key(session,'ArrowLeft');
  assert.equal(await evaluate(session,'document.activeElement.dataset.level'),'1');
  await key(session,'Escape');
  assert.equal(await evaluate(session,'!!document.querySelector(".saf-menu")'),false);
  pass('cascade supports keyboard columns, vertical navigation and Escape dismissal');
  await click(session,'#text');
  await click(session,'.saf-cascade-trigger');
  await click(session,'.saf-cascade-branch[data-node-id="educationHistory"]');
  await click(session,'.saf-cascade-branch[data-node-id="educationHistory.records.0"]');
  assert.equal(await evaluate(session,'Array.from(document.querySelectorAll(".saf-cascade-leaf")).some(node=>/notes|dataSources|pendingItems/.test(node.dataset.fieldKey))'),false);
  await click(session,'.saf-cascade-leaf[data-field-key="educationHistory.records.0.researchFocus"]');
  await click(session,'.saf-confirm');
  assert.equal(await evaluate(session,'document.getElementById("text").value'),'网页开发、嵌入式开发；区块链、LLM');
  assert.equal(await evaluate(options,'document.getElementById("profile-educationHistory-records-0-notes").value.includes("信息3表单")'),true);
  pass('imported source annotations remain in maintenance notes and never enter filled research content');
  await click(session,'#school');
  await selectCascade(session,['educationHistory','educationHistory.records.2'],'educationHistory.records.2.school');
  assert.equal(await evaluate(session,'document.getElementById("school").value'),'示例高中');
  assert.equal(await evaluate(options,'document.getElementById("profile-school").value'),'示例大学二');
  pass('secondary-school record fills independently while university defaults stay intact');
  await click(session,'#phone');
  await click(session,'.saf-cascade-trigger');
  await click(session,'.saf-cascade-branch[data-node-id="workExperience"]');
  assert.equal(await evaluate(session,'document.querySelector(".saf-cascade-branch[data-node-id=\\"workExperience.records.1\\"]").textContent.includes("示例公司二 · 当前岗位")'),true);
  assert.equal(await evaluate(session,'Array.from(document.querySelectorAll(".saf-cascade-branch[data-record]")).every(node=>!/^第\\s*\\d+\\s*条/.test(node.textContent))'),true);
  await screenshot(session,'record-summaries');
  await click(session,'.saf-cascade-search');
  await send('Input.insertText',{text:'示例公司二'},session);
  assert.equal(await evaluate(session,'Array.from(document.querySelectorAll(".saf-cascade-leaf")).some(node=>node.dataset.fieldKey==="workExperience.records.1.company")'),true);
  await key(session,'Escape');
  pass('cascade identifies work by company/position/date and searches record content');
  await click(session,'#text');
  await click(session,'.saf-cascade-trigger');
  await click(session,'.saf-cascade-search');
  await send('Input.insertText',{text:'selfAssessment.summary'},session);
  await until(session,'Array.from(document.querySelectorAll(".saf-cascade-leaf")).some(node=>node.dataset.fieldKey==="selfAssessment.summary")','cascade search result');
  await click(session,'.saf-cascade-leaf[data-field-key="selfAssessment.summary"]');
  await click(session,'.saf-confirm');
  assert.equal(await evaluate(session,'document.getElementById("text").value'),'评价第一段\n评价第二段');
  pass('English-key search finds nested fields and confirms multiline fill');
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false},session);
  await click(session,'#school');
  await click(session,'.saf-cascade-trigger');
  await click(session,'.saf-cascade-branch[data-node-id="educationHistory"]');
  await click(session,'.saf-cascade-branch[data-node-id="educationHistory.records.1"]');
  const narrowCascade=await evaluate(session,'(()=>{const r=document.querySelector(".saf-menu").getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom};})()');
  assert.ok(narrowCascade.left>=8 && narrowCascade.right<=367 && narrowCascade.bottom<=804);
  await screenshot(session,'cascade-mobile');
  await key(session,'Escape');
  await send('Emulation.setDeviceMetricsOverride',{width:1100,height:850,deviceScaleFactor:1,mobile:false},session);
  pass('three cascade columns stay within a 375px viewport');
  await click(session, '#school');
  await selectCascade(session,['educationHistory','educationHistory.records.1'],'educationHistory.records.1.school');
  assert.equal(await evaluate(session, 'document.getElementById("school").value'), '示例大学二');
  await click(session, '#text');
  await selectCascade(session,['workExperience','workExperience.records.1'],'workExperience.records.1.responsibilities');
  assert.equal(await evaluate(session, 'document.getElementById("text").value'), '职责第一条\n职责第二条');
  pass('specific education and work record fields can fill only the selected webpage input');
  await evaluate(options, 'const updatedSchool=document.getElementById("profile-educationHistory-records-1-school");updatedSchool.value="更新后的示例大学二";updatedSchool.dispatchEvent(new Event("input",{bubbles:true}))');
  assert.equal(await evaluate(options, 'document.getElementById("profile-school").value'),'更新后的示例大学二');
  await evaluate(options, 'const commonMajor=document.getElementById("profile-major");commonMajor.value="单独维护的专业";commonMajor.dispatchEvent(new Event("input",{bubbles:true}))');
  assert.equal(await evaluate(options, 'document.getElementById("profile-major").value'),'单独维护的专业');
  await click(options, '[data-add-records="family.records"]');
  await evaluate(options, 'const member=document.getElementById("profile-family-records-1-name"); member.value="示例成员二"; member.dispatchEvent(new Event("input",{bubbles:true}))');
  assert.equal(await evaluate(options,'document.querySelector("[data-record-heading=\\"family.records.1\\"]").textContent'),'示例成员二');
  await click(options, '#section-projects .record-card .remove-record');
  await click(options, '#save-button');
  await until(options, 'document.querySelector("#save-status").textContent.includes("已保存")', 'record changes saved');
  const edited = await evaluate(options, '(async () => (await chrome.storage.local.get("profile")).profile)()');
  assert.equal(edited.family.records.length, 2);
  assert.equal(edited.family.records[1].name, '示例成员二');
  assert.equal(edited.projects.records.length, 1);
  assert.equal(edited.projects.records[0].name, '项目二');
  assert.deepEqual(edited.workExperience.records[1].responsibilities, ['职责第一条','职责第二条']);
  assert.equal(edited.educationHistory.records[1].notes, '备注第一段\n第二段');
  assert.equal(edited.education.school,'','derived common school must not be saved as a stale copy');
  assert.equal(edited.education.major,'单独维护的专业','explicit overrides must persist');
  pass('record add/delete and UI save preserve the remaining records and multiline content');
  assert.equal(await evaluate(options, 'document.getElementById("profile-school").value'),'更新后的示例大学二');
  const priorReload = loads.get(options)||0;
  await send('Page.reload',{},options);
  for(let i=0;i<120 && (loads.get(options)||0)<=priorReload;i++) await delay(50);
  await until(options,'!!document.querySelector("#save-button") && !document.querySelector("#save-button").disabled','reloaded source defaults');
  assert.equal(await evaluate(options,'document.getElementById("profile-school").value'),'更新后的示例大学二');
  assert.equal(await evaluate(options,'document.getElementById("profile-major").value'),'单独维护的专业');
  assert.equal(await evaluate(options,'document.getElementById("section-educationHistory").open'),true);
  pass('source defaults update after record edits and survive refresh while explicit overrides stay intact');
  downloadEvents.length = 0;
  rmSync(resolve(downloadDir, 'smart-autofill-profile.json'), {force:true});
  await click(options, '#export-button');
  for (let i=0;i<100 && !downloadEvents.some(event => event.state==='completed');i++) await delay(50);
  assert.ok(downloadEvents.some(event => event.state==='completed'));
  const fullBackup = JSON.parse(readFileSync(resolve(downloadDir,'smart-autofill-profile.json'),'utf8'));
  assert.equal(fullBackup.version, 2);
  assert.deepEqual(fullBackup.profile, edited);
  pass('v2 export retains the complete edited profile without dropping records or arrays');
  const popup = await page(`chrome-extension://${extensionId}/popup/popup.html`);
  await until(popup, 'document.querySelectorAll(".summary-row").length === 4', 'popup ready');
  assert.equal(await evaluate(popup,'document.querySelectorAll(".summary-row dd")[3].textContent'),'更新后的示例大学二');
  await screenshot(popup, 'popup');
  pass('popup shows local summary and management entry');
  await evaluate(options, 'chrome.storage.local.remove("profile")');
  await click(session, '#phone');
  assert.equal(await evaluate(session, 'document.querySelectorAll(".saf-menu-item:not(:disabled)").length'), 0);
  assert.equal(await evaluate(session, 'document.querySelector(".saf-status").textContent.includes("先在管理页")'), true);
  await click(session, '.saf-manage');
  await until(session, '!document.querySelector(".saf-menu")', 'management page opens');
  pass('empty profile disables fill and menu management opens options through extension');
  // The HTTP fixture has no shared extension namespace, confirming isolated-world execution.
  assert.equal(await evaluate(session, 'typeof globalThis.SmartAutofill'), 'undefined');
  pass('content scripts run in isolated world');
  assert.deepEqual(errors, [], 'no script exceptions');
  console.log(`${checks} browser checks passed for ${browserName}.`);
} finally {
  try { await send('Browser.close'); } catch { child.kill(); }
  await Promise.race([new Promise(done => child.once('exit', done)), delay(1500)]);
  for (const request of pending.values()) clearTimeout(request.timer);
  child.kill();
  // Delete only this script's generated browser profile within this project's artifacts directory.
  const checked = resolve(profileDir);
  if (checked.startsWith(artifacts + sep) && basename(checked).startsWith(`smoke-${browserName}-`)) {
    try { rmSync(checked, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
    catch { console.log(`Temporary test profile retained for cleanup: ${checked}`); }
  }
}
