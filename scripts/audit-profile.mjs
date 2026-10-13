// Audit the explicitly supplied local import file; never access or change browser storage.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const input=resolve(process.argv[2] || resolve(root,'personal-data/profile-import.json'));
const output=resolve(process.argv[3] || resolve(root,'personal-data/profile-missing-checklist.md'));
const context=vm.createContext({});
for(const file of ['field-rules.js','resume-schema.js','profile.js','field-tree.js']) vm.runInContext(readFileSync(resolve(root,'smart-autofill/data',file),'utf8'),context);
const saf=context.SmartAutofill;
const profile=saf.parseImport(readFileSync(input,'utf8'));
const tree=saf.buildFieldTree(profile);
const leaves=saf.flattenFieldTree(tree);
const escape=value=>String(value).replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
const administrative=key=>/\.(?:dataSources|notes|pendingItems)$/.test(key);
const missing=leaves.filter(leaf=>!saf.profileValue(profile,leaf.key).trim() && !administrative(leaf.key));
function inapplicableReason(leaf) {
  const match=leaf.id.match(/^(\w+)\.records\.(\d+)\.(\w+)$/);
  if(!match) return '';
  const [,group,index,key]=match;
  const row=profile[group].records[Number(index)];
  if(group==='workExperience' && key==='departureReason' && /至今|现在|在职|\bpresent\b/i.test(row.dateRange)) return '仍在职，不需要补离职原因';
  if(group==='certificates' && ['listeningAndSpeaking','readingAndWriting'].includes(key) && !/英语|日语|韩语|法语|德语|俄语|语言|外语|CET|IELTS|TOEFL|JLPT/i.test(row.name+' '+row.certificateType)) return '非语言证书，不需要补语言能力';
  return '';
}
const inapplicable=missing.filter(leaf=>inapplicableReason(leaf));
const unresolved=leaves.filter(leaf=>!administrative(leaf.key) && /待补充|待完善|待确认|待核实|未提供|未填写|待定|\bTODO\b/i.test(saf.profileValue(profile,leaf.key)));
const pending=(profile.job?.campusApplication?.pendingItems || []).filter(item=>item.trim());
const lines=[
  '# 个人资料补充清单', '',
  '依据本地 `profile-import.json` 核对，不读取浏览器里后来修改的资料。这里只列现有字段中的空项和待确认项，不自动补值。', '',
  '可按“类别 / 内容摘要 / 字段：内容”回复；不适用的项目写“不适用”，暂不确定的写“待确认”。日期可提供到年月，已有资料不需要重复发送。', '',
  '常用学校、学院、专业、学历、学位、入学时间和毕业时间等已使用正式来源读取规则；已有来源值的空白副本不算缺失。数据来源和空备注不作为必须补充项。', '',
  '当前单位/岗位适用于在职人员；辅修、海外经历、证书编号、论文发表信息等按实际情况补充。证件照需在招聘网页手动上传，不要求提供给插件。', '',
  `现有字段中有 ${missing.length} 个空项，其中 ${inapplicable.length} 个按当前记录不适用，无需补充；另有 ${unresolved.length} 个待确认项。其余 ${missing.length-inapplicable.length} 个空项按网申需要补充，不代表所有网站都必填。`, ''
];
if(pending.length) {
  lines.push('## 原资料注明的待补充项','');
  for(const item of pending) lines.push(`- ${escape(item)}`);
  lines.push('');
}
for(const group of saf.GROUPS) {
  const blanks=missing.filter(leaf=>leaf.id.split('.')[0]===group.key);
  const checks=unresolved.filter(leaf=>leaf.id.split('.')[0]===group.key);
  if(!blanks.length && !checks.length) continue;
  lines.push(`## ${group.label}`,'','| 记录 / 子分类 | 字段 | 状态 | 英文键 |','| --- | --- | --- | --- |');
  for(const [items,status] of [[blanks,'当前为空'],[checks,'现有内容含待补充/待确认标记']]) {
    for(const leaf of items) lines.push(`| ${escape(leaf.trail.slice(1,-1).join(' / ') || '通用')} | ${escape(leaf.label)} | ${inapplicableReason(leaf) || status} | \`${leaf.id}\` |`);
  }
  lines.push('');
}
writeFileSync(output,lines.join('\n')+'\n');
console.log(JSON.stringify({emptyFields:missing.length,unresolvedFields:unresolved.length,checklist:output,
  groups:saf.GROUPS.map(group=>({label:group.label,empty:missing.filter(leaf=>leaf.id.split('.')[0]===group.key).map(leaf=>({record:leaf.trail.slice(1,-1).join(' / '),field:leaf.label,key:leaf.id})),
    unresolved:unresolved.filter(leaf=>leaf.id.split('.')[0]===group.key).map(leaf=>({record:leaf.trail.slice(1,-1).join(' / '),field:leaf.label,key:leaf.id}))})).filter(group=>group.empty.length || group.unresolved.length)},null,2));
