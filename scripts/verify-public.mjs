// Check Git-tracked public files without displaying detected secret or personal values.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
assert.ok(files.length>1,'Stage the intended public files before verification.');
const forbidden=/^(?:personal-data|artifacts|dist|node_modules|\.codex|\.agents)\/|(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|crx)$/i;
const secret=/(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const binary=new Set(['.png','.jpg','.jpeg','.gif','.ico','.zip']);
const context=vm.createContext({});
for(const file of ['field-rules.js','resume-schema.js','profile.js']) vm.runInContext(readFileSync(resolve(root,'smart-autofill/data',file),'utf8'),context);
const saf=context.SmartAutofill;
const sample=saf.parseImport(readFileSync(resolve(root,'examples/profile.demo.json'),'utf8'));
assert.equal(sample.basic.email,'student@example.invalid');
assert.equal(saf.getFieldResolution(sample,'school').value,'示例大学');
let sensitive=[];
const localProfile=resolve(root,'personal-data/profile-import.json');
if(existsSync(localProfile)) {
  const profile=saf.parseImport(readFileSync(localProfile,'utf8'));
  sensitive=[profile.basic.name,profile.basic.phone,profile.basic.email,profile.basic.idCard,profile.basic.wechatId,profile.basic.qqNumber,profile.basic.emergencyContact.name,profile.basic.emergencyContact.phone,
    ...profile.family.records.flatMap(record=>[record.name,record.phone])].filter(value=>value?.trim().length>=2 && !['无','不适用'].includes(value.trim()));
}
for(const file of files) {
  assert.ok(!forbidden.test(file),`Private path is tracked: ${file}`);
  const absolute=resolve(root,file);
  assert.ok(existsSync(absolute),`Tracked file missing: ${file}`);
  if(binary.has(extname(file).toLowerCase())) continue;
  const text=readFileSync(absolute,'utf8');
  assert.ok(!secret.test(text),`Credential pattern detected in ${file}`);
  assert.ok(!sensitive.some(value=>text.includes(value)),`Private identity value detected in ${file}`);
  if(['.js','.mjs'].includes(extname(file))) execFileSync(process.execPath,['--check',absolute],{stdio:'pipe'});
  if(extname(file)==='.md') {
    const links=[...text.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g),...text.matchAll(/<img[^>]+src="([^"]+)"/g)];
    for(const match of links) {
      const link=match[1];
      if(/^(?:https?:|mailto:|#)/.test(link)) continue;
      const target=decodeURIComponent(link.split('#')[0]);
      assert.ok(existsSync(resolve(dirname(absolute),target)),`Broken local link in ${file}: ${target}`);
    }
  }
}
console.log(JSON.stringify({trackedFiles:files.length,secretPatterns:'passed',privatePaths:'excluded',localIdentityScan:sensitive.length?'passed':'not available in this checkout',sampleImport:'passed',syntax:'passed',localLinks:'passed'}));
