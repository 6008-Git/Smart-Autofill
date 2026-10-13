import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const source=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)),'../smart-autofill/content/content.js'),'utf8');
function harness() {
  function emitter() {
    const handlers=new Map();
    return {
      addEventListener(type,fn,options={}) {handlers.set(type,[...(handlers.get(type)||[]),{fn,signal:options.signal}]);},
      emit(type,target,extra={}) {for(const handler of handlers.get(type)||[]) if(!handler.signal?.aborted) handler.fn({target,isTrusted:true,...extra});}
    };
  }
  const document=emitter();const window=emitter();
  const requests=[];const shown=[];const changed=new Set();let visible=false;
  const field={editable:true,isConnected:true};document.activeElement=field;
  const saf={
    emptyProfile:()=>({}),isEditableElement:node=>node?.editable,menuContains:()=>false,menuIsVisible:()=>visible,
    hideMenu:()=>{visible=false;},positionMenu:()=>{},focusMenu:()=>{},
    collectFieldInfo:()=>({}),detectField:()=>[],
    readProfile:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),
    showMenu:(_element,_candidates,profile,error)=>{shown.push({profile,error});visible=true;}
  };
  const chrome={storage:{onChanged:{addListener:fn=>changed.add(fn),removeListener:fn=>changed.delete(fn)}}};
  vm.runInNewContext(source,{document,window,SmartAutofill:saf,chrome,AbortController,performance:{now:()=>1000}});
  return {saf,requests,shown,document,field,click:()=>document.emit('click',field),
    key:(extra={})=>window.emit('keydown',document.activeElement,{key:'z',code:'KeyZ',altKey:true,preventDefault:()=>{},stopPropagation:()=>{},...extra}),
    change:()=>{for(const fn of changed) fn({profile:{}},'local');}};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};

test('focus reads fresh data every time instead of retaining a startup snapshot',async()=>{
  const h=harness();assert.equal(h.requests.length,0);
  h.click();h.requests[0].resolve({revision:'first'});await flush();
  h.click();h.requests[1].resolve({revision:'updated'});await flush();
  assert.equal(h.shown.at(-1).profile.revision,'updated');
});

test('late old storage response cannot overwrite an import or the new menu',async()=>{
  const h=harness();h.click();h.change();assert.equal(h.requests.length,2);
  h.requests[1].resolve({revision:'imported'});await flush();
  h.requests[0].resolve({revision:'old'});await flush();
  assert.equal(h.shown.length,1);assert.equal(h.shown[0].profile.revision,'imported');
});

test('invalidated context shows a read failure and disposal stops old listeners',async()=>{
  const h=harness();h.click();h.requests[0].reject(new Error('Extension context invalidated.'));await flush();
  assert.equal(h.shown[0].error,'invalidated');
  h.saf.disposeContent();h.click();h.change();assert.equal(h.requests.length,1);
});

test('Alt+Z opens a freshly read menu on script-focused input without earlier user focus',async()=>{
  const h=harness();h.key();assert.equal(h.requests.length,1);
  h.requests[0].resolve({revision:'shortcut'});await flush();
  assert.equal(h.shown[0].profile.revision,'shortcut');
  h.saf.disposeContent();h.key();assert.equal(h.requests.length,1);
});

test('shortcut rejects synthetic events, modified keys, repeats, IME and excluded controls',()=>{
  const h=harness();
  for(const extra of [{isTrusted:false},{ctrlKey:true},{metaKey:true},{shiftKey:true},{repeat:true},{isComposing:true}]) h.key(extra);
  assert.equal(h.requests.length,0);
  h.document.activeElement={editable:false};h.key();assert.equal(h.requests.length,0);
});

test('click and shortcut resolve the actual focused input in an open shadow root',()=>{
  const h=harness();
  const host={shadowRoot:{activeElement:h.field}};h.document.activeElement=host;
  h.document.emit('click',host,{composedPath:()=>[h.field,host]});
  assert.equal(h.requests.length,1);
  h.key();assert.equal(h.requests.length,2);
});
