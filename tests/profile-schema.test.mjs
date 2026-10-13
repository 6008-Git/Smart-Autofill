import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({});
for (const file of ['field-rules.js', 'resume-schema.js', 'profile.js']) vm.runInContext(readFileSync(resolve(root, 'smart-autofill/data', file), 'utf8'), context);
const saf = context.SmartAutofill;
const plain = value => JSON.parse(JSON.stringify(value));

test('full schema is empty by default with 140 definitions and seven repeatable record groups', () => {
  const empty = saf.emptyProfile();
  assert.equal(saf.schemaDescriptors().length, 140);
  assert.equal(saf.GROUPS.length, 13);
  assert.equal(Object.values(empty).filter(group => Array.isArray(group.records)).length, 7);
  assert.ok(saf.getProfileFields(empty).every(field => saf.profileValue(empty, field.key) === ''));
  assert.equal(empty.workExperience.records.length, 0);
  assert.equal(empty.basic.emergencyContact.name, '');
});

test('English/Chinese mapping covers every schema field and all eleven source files', () => {
  const mapping = JSON.parse(readFileSync(resolve(root, 'doc/profile-field-mapping.json'), 'utf8'));
  assert.equal(mapping.fields.length, saf.schemaDescriptors().length);
  assert.equal(new Set(mapping.fields.filter(field => field.sourceFile).map(field => field.sourceFile)).size, 11);
  assert.equal(new Set(mapping.fields.map(field => field.key)).size, mapping.fields.length);
  const paths = new Set(saf.schemaDescriptors().map(field => field.path.join('.')));
  for (const field of mapping.fields) {
    assert.ok(paths.has(field.key));
    assert.match(field.key.replace(/\*/g, '0'), /^[a-zA-Z0-9.]+$/);
    assert.ok(field.label);
  }
});

test('grouped v2 import preserves multiple education/work records, nested contacts, arrays and multiline text', () => {
  const data = { version: 2, profile: {
    basic: { age: '24', emergencyContact: { name: '示例联系人', phone: '01000000000' } },
    educationHistory: { records: [{ school: '示例大学甲', gpa: '' }, { school: '示例大学乙', supervisor: '示例导师' }] },
    workExperience: { records: [{ company: '示例公司', responsibilities: ['第一项\n续行', '第二项'], departureReason: '' }] },
    job: { campusApplication: { referralCode: '00001234', acceptReassignment: '' } },
    selfAssessment: { summary: '第一段\n第二段' },
    skills: { categories: { programmingLanguages: ['Java', 'Python'] } }
  } };
  const imported = saf.parseImport(JSON.stringify(data));
  assert.equal(imported.educationHistory.records.length, 2);
  assert.deepEqual(plain(imported.workExperience.records[0].responsibilities), ['第一项\n续行', '第二项']);
  assert.equal(imported.basic.emergencyContact.phone, '01000000000');
  assert.equal(imported.job.campusApplication.referralCode, '00001234');
  assert.equal(saf.profileValue(imported, 'educationHistory.records.1.school'), '示例大学乙');
  assert.equal(saf.profileValue(imported, 'workExperience.records.0.responsibilities'), '第一项\n续行\n第二项');
  assert.equal(saf.profileValue(imported, 'selfAssessment.summary'), '第一段\n第二段');
  assert.deepEqual(plain(saf.parseImport(JSON.stringify({ version: 2, profile: imported }))), plain(imported));
  const fields = saf.getProfileFields(imported);
  assert.ok(fields.some(field => field.key === 'educationHistory.records.0.school' && field.label.includes('示例大学甲')));
  assert.ok(fields.some(field => field.key === 'educationHistory.records.1.school' && field.label.includes('示例大学乙')));
});

test('existing v1 profile and flat imports still retain all original common fields', () => {
  const original = { basic: { name: '示例姓名', phone: '13800000000' }, education: { school: '示例学校' } };
  const upgraded = saf.normalizeProfile(original);
  assert.equal(upgraded.basic.name, original.basic.name);
  assert.equal(upgraded.education.school, original.education.school);
  assert.equal(upgraded.workExperience.records.length, 0);
  assert.equal(saf.parseImport(JSON.stringify({ version: 1, profile: original })).basic.phone, original.basic.phone);
  assert.equal(saf.parseImport('{"name":"示例姓名"}').basic.name, '示例姓名');
});

test('malformed record groups, nested unknowns and incorrect arrays cannot silently lose data', () => {
  for (const profile of [
    { workExperience: { records: 'invalid' } }, { educationHistory: { records: [null] } },
    { educationHistory: { records: [{ school: 123 }] } }, { skills: { categories: { programmingLanguages: 'Java' } } },
    { family: { records: [{ unknownField: 'x' }] } }, { basic: { emergencyContact: { phone: null } } },
    { projects: { records: Array.from({length:101}, () => ({})) } }
  ]) assert.throws(() => saf.parseImport(JSON.stringify({ version: 2, profile })));
  assert.throws(() => saf.parseImport('{"version":999,"profile":{"basic":{}}}'));
  assert.throws(() => saf.parseImport('{"basic":{"emergencyContact":{"__proto__":{"polluted":"yes"}}}}'));
  assert.equal({}.polluted, undefined);
});

test('education common fields and popup school resolve one coherent latest record without overwriting saved overrides', () => {
  const profile = saf.parseImport(JSON.stringify({ educationHistory: {records:[
    {school:'近期学校',major:'近期专业',college:'近期学院',educationLevel:'硕士',degree:'硕士学位',dateRange:'2024-09-01 至 2027-06-30'},
    {school:'早期学校',major:'早期专业',dateRange:'2018.09-2022.06'}
  ]}}));
  const before = JSON.stringify(profile);
  for (const [key,value] of Object.entries({school:'近期学校',major:'近期专业',college:'近期学院',educationLevel:'硕士',degree:'硕士学位',enrollmentDate:'2024-09-01',graduationDate:'2027-06-30'})) {
    assert.equal(saf.profileValue(profile,key),value);
    assert.equal(saf.profileValue(profile,`education.${key}`),value);
    assert.equal(saf.getFieldResolution(profile,key).derived,true);
  }
  assert.equal(JSON.stringify(profile),before, 'readers must not create stale duplicated values');
  profile.education.major='单独维护的专业';
  assert.equal(saf.profileValue(profile,'major'),'单独维护的专业');
  assert.equal(saf.getFieldResolution(profile,'major').derived,false);
  profile.education.major='';
  profile.educationHistory.records[0].major='';
  assert.equal(saf.profileValue(profile,'major'),'','must not mix different education records');
  profile.educationHistory.records.splice(0,1);
  assert.equal(saf.profileValue(profile,'school'),'早期学校');
});

test('education date formats retain supplied precision and do not invent an end date for ongoing study', () => {
  for (const [range,expected] of [
    ['2018.09-2022.06',['2018-09','2022-06']], ['2024-09-01 至 2027-06-30',['2024-09-01','2027-06-30']],
    ['2024年9月1日—2027年6月30日',['2024-09-01','2027-06-30']], ['2018-2022',['2018','2022']]
  ]) assert.deepEqual(plain(saf.parseDateRange(range).map(date=>date.value)),expected,range);
  const profile = saf.parseImport('{"educationHistory":{"records":[{"school":"在读学校","dateRange":"2024-09 至今"}]}}');
  assert.equal(saf.profileValue(profile,'enrollmentDate'),'2024-09');
  assert.equal(saf.profileValue(profile,'graduationDate'),'');
});

test('job defaults bridge positions and cities but current employer requires explicit ongoing evidence', () => {
  const profile = saf.parseImport(JSON.stringify({job:{targetPositions:['研发','测试'],preferredWorkCities:['示例城市甲','示例城市乙']},workExperience:{records:[
    {company:'过去公司',position:'过去职位',dateRange:'2019-01 至 2022-01'},
    {company:'当前公司',position:'当前职位',dateRange:'2024-07-01 至今'}
  ]}}));
  assert.equal(saf.profileValue(profile,'expectedPosition'),'研发、测试');
  assert.equal(saf.profileValue(profile,'expectedCity'),'示例城市甲、示例城市乙');
  assert.equal(saf.profileValue(profile,'currentCompany'),'当前公司');
  assert.equal(saf.profileValue(profile,'currentPosition'),'当前职位');
  profile.workExperience.records[1].departureReason='已离职';
  assert.equal(saf.profileValue(profile,'currentCompany'),'');
  profile.job.targetPositions=[];
  profile.job.appliedPosition='明确求职岗位';
  assert.equal(saf.profileValue(profile,'expectedPosition'),'明确求职岗位');
  profile.job.expectedPosition='手动意向';
  assert.equal(saf.profileValue(profile,'expectedPosition'),'手动意向');
});

test('address defaults read explicit residence regions and never substitute a school city or family member', () => {
  const profile = saf.parseImport(JSON.stringify({location:{currentResidence:'浙江省杭州市示例地址'},educationHistory:{records:[{city:'学校城市'}]},family:{records:[{name:'家人姓名'}]}}));
  assert.equal(saf.profileValue(profile,'province'),'浙江省');
  assert.equal(saf.profileValue(profile,'city'),'杭州市');
  assert.equal(saf.profileValue(profile,'address'),'浙江省杭州市示例地址');
  assert.equal(saf.profileValue(profile,'name'),'');
  profile.location.currentResidence='暂无明确省市';
  assert.equal(saf.profileValue(profile,'city'),'');
  profile.location.currentResidence='北京市朝阳区示例地址';
  assert.equal(saf.profileValue(profile,'city'),'北京市');
  profile.location.city='单独维护的城市';
  assert.equal(saf.profileValue(profile,'city'),'单独维护的城市');
});

test('all populated categories and source-backed common education are represented in import statistics', () => {
  const profile = saf.parseImport(JSON.stringify({educationHistory:{records:[{school:'示例学校',major:'示例专业'}]},skills:{categories:{programmingLanguages:['Java']}},selfAssessment:{summary:'示例评价'},projects:{records:[{name:'示例项目'}]}}));
  const stats = saf.groupStats(profile);
  for (const key of ['education','educationHistory','skills','selfAssessment','projects']) assert.equal(stats.find(group=>group.key===key).hasData,true,key);
  assert.equal(stats.find(group=>group.key==='educationHistory').records,1);
  assert.equal(stats.find(group=>group.key==='family').hasData,false);
});
