const {test}=require('node:test'),assert=require('node:assert/strict');const {environment}=require('./vault-env.cjs');
const save={apiKey:'test-secret-never-real'};
async function create(env){const r=await env.send('keySave',save);assert.ok(!r.error,r.error);return r;}
test('automatic encryption needs no password and exposes neither plaintext nor device key',async()=>{
 const env=environment();await create(env);assert.equal(env.local.keyVault.version,2);assert.equal(env.local.apiKey,undefined);assert.deepEqual(env.session,{});assert.ok(!JSON.stringify(env.local).includes(save.apiKey));assert.equal(env.deviceState.key.extractable,false);assert.equal((await env.send('keyStatus')).result.state,'saved');
 const old=structuredClone(env.local.keyVault);await create(env);assert.notEqual(env.local.keyVault.iv,old.iv);await env.solve();assert.equal(env.calls[0].headers.Authorization,'Bearer '+save.apiKey);
});
test('old plaintext migrates without typing and failed verification preserves original',async()=>{
 const env=environment({apiKey:'legacy-original'});env.corruptNextRead();assert.match((await env.send('keySave')).error,/校验失败/);assert.equal(env.local.apiKey,'legacy-original');assert.equal(env.local.keyVault,undefined);
 assert.equal((await env.send('keySave')).result.state,'saved');assert.equal(env.local.apiKey,undefined);await env.solve();assert.equal(env.calls[0].headers.Authorization,'Bearer legacy-original');
});
test('password-encrypted old vault is preserved until user pastes a replacement',async()=>{
 const old={version:1,salt:'old',iv:'old',ciphertext:'old'};const env=environment({keyVault:old},{unlockedKey:'old-session'});
 assert.equal((await env.send('keyStatus')).result.state,'passwordLegacy');await assert.rejects(env.solve(),/重新粘贴/);assert.match((await env.send('keySave')).error,/重新粘贴/);assert.deepEqual(env.local.keyVault,old);
 await create(env);assert.equal(env.local.keyVault.version,2);assert.equal(env.session.unlockedKey,undefined);assert.equal(await env.send('keyUnlock',{password:'old'}),undefined);
});
test('worker and browser restarts automatically decrypt with persisted device key',async()=>{
 const env=environment();await create(env);const restarted=environment(env.local,{},undefined,env.deviceState);await restarted.solve();assert.equal(restarted.calls.length,1);
 const lost=environment(env.local);await assert.rejects(lost.solve(),/本机加密密钥缺失/);assert.equal(lost.calls.length,0);await create(lost);await lost.solve();assert.equal(lost.calls.length,1);
});
test('damaged vault does not send request and can be replaced or deleted',async()=>{
 const env=environment();await create(env);env.local.keyVault.ciphertext='invalid';await assert.rejects(env.solve(),/损坏/);assert.equal(env.calls.length,0);await create(env);await env.solve();assert.equal(env.calls.length,1);assert.equal((await env.send('keyDelete')).result.state,'empty');assert.deepEqual(env.local,{});
});
test('deletion aborts request and discards late transport results',async()=>{
 let finish;const env=environment({}, {},async()=>new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>({choices:[{message:{content:'OK'}}]})})));
 await create(env);const pending=env.send('testConnection',{model:'test'});while(!finish)await new Promise(r=>setTimeout(r,5));await env.send('keyDelete');assert.equal(env.calls[0].signal.aborted,true);finish();assert.match((await pending).error,/取消|删除/);
});
test('connection uses draft model and key without saving',async()=>{
 const env=environment({model:'saved'});const r=await env.send('testConnection',{apiKey:'draft',model:'draft-model'});assert.equal(r.result.model,'draft-model');assert.equal(env.local.model,'saved');assert.equal(env.local.keyVault,undefined);assert.equal(JSON.parse(env.calls[0].body).max_tokens,16);assert.ok(!env.calls[0].body.includes('draft-model-secret'));
});
for(const [status,message] of [[401,/无效/],[402,/余额不足/],[429,/频繁/],[404,/模型不可用/],[503,/503/]])test('safe connection error '+status,async()=>{
 const env=environment({}, {},async()=>({ok:false,status,json:async()=>({error:{message:'secret'}})}));const r=await env.send('testConnection',{apiKey:'draft-secret',model:'test'});assert.match(r.error,message);assert.ok(!r.error.includes('secret'));
});
test('safe network and timeout errors',async()=>{
 const env=environment({}, {},async()=>{throw new TypeError('secret');});assert.match((await env.send('testConnection',{apiKey:'draft-secret',model:'test'})).error,/网络/);
 const timeout=environment({}, {},async(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('detail')))));timeout.context.setTimeout=(fn,ms)=>setTimeout(fn,ms===25000?10:ms);assert.match((await timeout.send('testConnection',{apiKey:'draft-secret',model:'test'})).error,/25秒/);
});
test('key operations restricted to own options page and password operations removed',async()=>{
 const env=environment({apiKey:'original'});for(const type of ['keySave','keyDelete','keyStatus','testConnection'])for(const who of [{id:'test',url:'https://www.uooc.net.cn/',tab:{id:1}},{id:'other',url:'chrome-extension://test/options.html'},{id:'test',url:'chrome-extension://test/popup.html'}])assert.equal(await env.send(type,save,who),undefined);
 for(const type of ['keyUnlock','keyLock'])assert.equal(await env.send(type),undefined);assert.equal(env.local.apiKey,'original');
});
