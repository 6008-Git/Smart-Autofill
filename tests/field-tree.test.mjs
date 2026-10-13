import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({});
for (const file of ['field-rules.js','resume-schema.js','profile.js','field-tree.js']) vm.runInContext(readFileSync(resolve(root,'smart-autofill/data',file),'utf8'),context);
const saf = context.SmartAutofill;

test('cascade exposes every concrete field once, with group/record/field trails', () => {
  const profile=saf.parseImport(JSON.stringify({educationHistory:{records:[{school:'学校一'},{school:'学校二'}]},basic:{emergencyContact:{name:'示例联系人'}}}));
  const leaves=saf.flattenFieldTree(saf.buildFieldTree(profile));
  assert.equal(leaves.length,saf.getProfileFields(profile).length);
  assert.equal(new Set(leaves.map(node=>node.key)).size,leaves.length);
  const school=leaves.find(node=>node.key==='educationHistory.records.1.school');
  assert.equal(school.trail.join('/'),'教育经历/学校二/学校');
  assert.equal(school.available,true);
  assert.equal(leaves.find(node=>node.key==='basic.emergencyContact.name').trail.join('/'),'基本信息/紧急联系人/姓名');
});

test('record summaries show identifying snippets while contacts and full descriptions stay out of the tree', () => {
  const profile=saf.parseImport(JSON.stringify({educationHistory:{records:[{school:'示例学校',dateRange:'2024.09-2027.06',notes:'PRIVATE_NOTE'}]},basic:{phone:'PRIVATE_PHONE',idCard:'PRIVATE_ID'},workExperience:{records:[{company:'示例公司',position:'测试岗位',responsibilities:['PRIVATE_LONG_DESCRIPTION']}]}}));
  const tree=saf.buildFieldTree(profile);
  const leaves=saf.flattenFieldTree(tree);
  for(const key of ['school','enrollmentDate','graduationDate']) assert.equal(leaves.find(node=>node.key===key).available,true,key);
  for(const value of ['PRIVATE_PHONE','PRIVATE_ID','PRIVATE_NOTE','PRIVATE_LONG_DESCRIPTION']) assert.equal(JSON.stringify(tree).includes(value),false);
  assert.equal(tree.find(node=>node.id==='workExperience').children[0].label,'示例公司 · 测试岗位');
  assert.equal(leaves.find(node=>node.key==='postalCode').available,false);
});

test('all seven record categories use content summaries, long names truncate, and empty rows request names',()=>{
  for(const [group,row,name] of [
    ['educationHistory',{school:'示例大学',educationLevel:'硕士'},'示例大学'],
    ['workExperience',{company:'示例单位',position:'开发工程师'},'示例单位'],
    ['family',{relationship:'父亲',name:'示例家人'},'父亲'],
    ['certificates',{name:'英语证书'},'英语证书'],['awards',{name:'示例奖励'},'示例奖励'],
    ['publications',{title:'论文标题'},'论文标题'],['projects',{name:'项目名称'},'项目名称']
  ]) assert.ok(saf.recordLabel(group,row).includes(name),group);
  const label=saf.recordLabel('projects',{name:'长'.repeat(1000),role:'角色'.repeat(1000),dateRange:'2024-2025'});
  assert.ok(Array.from(label).length<=90);assert.ok(label.includes('…'));assert.ok(label.includes('2024-2025'));
  assert.ok(saf.recordLabel('projects',{}).includes('待补充名称'));
  assert.equal(saf.recordLabel('family',{phone:'PRIVATE_PHONE'}).includes('PRIVATE_PHONE'),false);
});

test('version displayed in the menu matches the manifest', () => {
  const manifest=JSON.parse(readFileSync(resolve(root,'smart-autofill/manifest.json'),'utf8'));
  assert.equal(saf.VERSION,manifest.version);
});
