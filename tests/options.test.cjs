const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {environment}=require('./vault-env.cjs');
const {chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,channel:'msedge'});});after(async()=>{await browser?.close();});
async function setup(saved={}){
 const env=environment(saved,{},undefined,{},true),page=await browser.newPage();page.on('dialog',d=>d.accept());
 await page.exposeFunction('backgroundMessage',msg=>env.send(msg.type,Object.fromEntries(Object.entries(msg).filter(([k])=>k!=='type'))));
 await page.exposeFunction('getSettings',()=>env.local);
 await page.exposeFunction('setSettings',data=>Object.assign(env.local,data));
 await page.setContent(fs.readFileSync('options.html','utf8').replace(/<script.*?<\/script>/g,''));
 await page.evaluate(()=>{window.synced={};window.chrome={runtime:{sendMessage:msg=>window.backgroundMessage(msg)},storage:{local:{get:keys=>window.getSettings().then(data=>Object.fromEntries(keys.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]))),set:data=>window.setSettings(data)},sync:{set:async data=>window.synced=data}}};});
 await page.addScriptTag({content:fs.readFileSync('settings.js','utf8')});await page.addScriptTag({content:fs.readFileSync('options.js','utf8')});await page.locator('details.advanced').evaluate(e=>e.open=true);await page.waitForFunction(()=>!document.querySelector('#keyState').textContent.includes('正在'));
 return {page,env};
}
test('password-free encrypted setup and separate settings save',async()=>{
 const {page,env}=await setup({model:'example-model',delay:5});try{
 await page.locator('#apiKey').fill('test-only-key');await page.locator('#saveKey').click();await page.waitForFunction(()=>document.querySelector('#keyState').textContent==='已保存 · 免密码');
 assert.equal(await page.locator('#apiKey').inputValue(),'');assert.equal(env.local.apiKey,undefined);assert.equal(env.local.keyVault.version,2);assert.equal(await page.locator('#currentPassword,#newPassword,#unlockKey,#lockKey').count(),0);
 await page.locator('#questionSelector').fill('.ti');await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已保存'));
 assert.equal(env.local.delay,5);assert.equal(env.local.questionSelector,'.ti');assert.ok(!JSON.stringify(await page.evaluate(()=>window.synced)).includes('test-only-key'));
 }finally{await page.close();}
});
test('legacy plaintext migration and deletion need no password',async()=>{
 const {page,env}=await setup({apiKey:'legacy-key'});try{assert.match(await page.locator('#keyState').innerText(),/旧版明文/);await page.locator('#saveKey').click();await page.waitForFunction(()=>document.querySelector('#keyState').textContent==='已保存 · 免密码');assert.equal(env.local.apiKey,undefined);await env.solve();assert.equal(env.calls[0].headers.Authorization,'Bearer legacy-key');await page.locator('#clear').click();await page.waitForFunction(()=>document.querySelector('#keyState').textContent==='尚未配置');assert.equal(env.local.keyVault,undefined);}finally{await page.close();}
});
test('old password vault prompts re-entry and accepts replacement without password',async()=>{
 const {page,env}=await setup({keyVault:{version:1,ciphertext:'old',salt:'old',iv:'old'}});try{assert.match(await page.locator('#keyHelp').innerText(),/重新粘贴/);await page.locator('#apiKey').fill('replacement-key');await page.locator('#saveKey').click();await page.waitForFunction(()=>document.querySelector('#keyState').textContent==='已保存 · 免密码');assert.equal(env.local.keyVault.version,2);}finally{await page.close();}
});
test('invalid selectors and unsaved credentials never overwrite settings',async()=>{
 const {page,env}=await setup({model:'old-model'});try{await page.locator('#questionSelector').fill('[');await page.locator('button[type=submit]').click();assert.match(await page.locator('#status').innerText(),/选择器格式错误/);assert.equal(env.local.questionSelector,undefined);await page.locator('#apiKey').fill('unsaved');await page.locator('button[type=submit]').click();assert.match(await page.locator('#status').innerText(),/尚未保存/);assert.equal(env.local.apiKey,undefined);}finally{await page.close();}
});
test('draft connection test sends one request and does not save settings or credentials',async()=>{
 const {page,env}=await setup({model:'saved-model'});try{await page.locator('#apiKey').fill('draft-secret');await page.locator('#model').fill('draft-model');await page.locator('#testConnection').click();await page.waitForFunction(()=>document.querySelector('#testResult').textContent.includes('连接成功'));assert.equal(env.calls.length,1);assert.equal(env.local.model,'saved-model');assert.equal(env.local.apiKey,undefined);assert.equal(env.local.keyVault,undefined);const link=page.locator('#getApiKey');assert.equal(await link.getAttribute('href'),'https://platform.deepseek.com/api_keys');assert.equal(await link.getAttribute('target'),'_blank');}finally{await page.close();}
});
test('import previews changes, applies only after confirmation and preserves API key',async()=>{
 const {page,env}=await setup({apiKey:'legacy-keep',rate:2});try{
 const data={format:'uooc-settings',version:1,settings:{delay:4,rate:1.25,timerMinutes:45,sound:false,questionSelector:'.ti',stemSelector:'legend',nextSelector:''}};
 await page.locator('#importFile').setInputFiles({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.locator('#importPreview').waitFor({state:'visible'});assert.equal(env.local.rate,2);assert.match(await page.locator('#importChanges').innerText(),/1.25/);
 await page.locator('#applyImport').click();await page.waitForFunction(()=>document.querySelector('#utilityResult').textContent.includes('已导入'));assert.equal(env.local.rate,1.25);assert.equal(env.local.timerMinutes,45);assert.equal(env.local.apiKey,'legacy-keep');assert.equal(await page.locator('#sound').isChecked(),false);
 }finally{await page.close();}
});
test('invalid import rejects atomically, clears pending preview and export omits sensitive data',async()=>{
 const {page,env}=await setup({apiKey:'legacy-secret',rate:2});try{
 const valid={format:'uooc-settings',version:1,settings:{rate:1.5}};await page.locator('#importFile').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(valid))});await page.locator('#importPreview').waitFor({state:'visible'});
 const bad={format:'uooc-settings',version:1,settings:{rate:1,apiKey:'injected'}};await page.locator('#importFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await page.waitForFunction(()=>document.querySelector('#utilityResult').textContent.includes('不支持'));assert.equal(await page.locator('#importPreview').isVisible(),false);assert.equal(env.local.rate,2);assert.equal(env.local.apiKey,'legacy-secret');
 await page.evaluate(()=>{window.downloads=[];URL.createObjectURL=blob=>{window.downloads.push(blob.text());return 'blob:preview';};HTMLAnchorElement.prototype.click=function(){};});await page.locator('#exportSettings').click();await page.waitForFunction(()=>window.downloads.length===1);const text=await page.evaluate(()=>window.downloads[0]);assert.ok(!text.includes('secret'));assert.ok(!text.includes('apiKey'));assert.equal(JSON.parse(text).settings.rate,2);
 }finally{await page.close();}
});
test('auto-submit preference saves as boolean and imports default off for old backups',async()=>{
 const {page,env}=await setup();try{assert.equal(await page.locator('#autoSubmit').isChecked(),false);await page.locator('#autoSubmit').check();await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('已保存'));assert.equal(env.local.autoSubmit,true);assert.equal(env.synced.settings.autoSubmit,true);
 const file={format:'uooc-settings',version:1,settings:{rate:1.5}};await page.locator('#importFile').setInputFiles({name:'old-settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});await page.locator('#importPreview').waitFor({state:'visible'});assert.match(await page.locator('#importChanges').innerText(),/自动提交/);await page.locator('#applyImport').click();await page.waitForFunction(()=>document.querySelector('#utilityResult').textContent.includes('已导入'));assert.equal(env.local.autoSubmit,false);assert.equal(await page.locator('#autoSubmit').isChecked(),false);
 }finally{await page.close();}
});
test('login switch requests only UOOC permission, handles denial and enables only after grant',async()=>{
 const {page}=await setup();try{await page.evaluate(()=>{window.loginRequests=[];window.loginCalls=[];window.allowLogin=false;chrome.permissions={request:async request=>{loginRequests.push(request);return allowLogin;}};const previous=chrome.runtime.sendMessage;chrome.runtime.sendMessage=async m=>{if(m.type.startsWith('login')){loginCalls.push(m);return {result:{enabled:true,state:'valid',checkedAt:1}};}return previous(m);};});await page.locator('#keepLogin').click();await page.waitForFunction(()=>document.querySelector('#loginResult').textContent.includes('未授权'));assert.equal(await page.locator('#keepLogin').isChecked(),false);assert.equal(await page.evaluate(()=>loginCalls.length),0);await page.evaluate(()=>window.allowLogin=true);await page.locator('#keepLogin').check();await page.waitForFunction(()=>document.querySelector('#loginResult').textContent.includes('登录有效'));const calls=await page.evaluate(()=>loginCalls);assert.deepEqual(calls,[{type:'loginToggle',enabled:true}]);const request=await page.evaluate(()=>loginRequests[0]);assert.deepEqual(request.permissions,['cookies']);assert.deepEqual(request.origins,['https://www.uooc.net.cn/*','https://uooc.net.cn/*']);}finally{await page.close();}
});
