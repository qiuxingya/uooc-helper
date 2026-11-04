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

test('保存期间改值保留新草稿并阻止重复提交',async()=>{const {page}=await setup();try{await page.evaluate(()=>{const old=chrome.runtime.sendMessage;window.saves=[];chrome.runtime.sendMessage=m=>{if(m.type==='settingsSave'){saves.push(m);return new Promise(r=>window.finishSave=()=>r({result:{settings:m.settings,syncWarning:false}}));}return old(m);};});await page.locator('#delay').fill('4');await page.locator('button[type=submit]').click();await page.waitForFunction(()=>window.saves.length===1);assert.equal(await page.locator('button[type=submit]').isDisabled(),true);await page.locator('#delay').fill('5');await page.evaluate(()=>finishSave());await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('还有未保存'));assert.equal(await page.locator('#delay').inputValue(),'5');assert.equal(await page.evaluate(()=>saves.length),1);assert.ok(await page.evaluate(()=>Object.hasOwn(saves[0],'model')));}finally{await page.close();}});
test('保存失败保留输入，重试后区分同步失败',async()=>{const {page}=await setup();try{await page.evaluate(()=>{const old=chrome.runtime.sendMessage;window.failed=true;chrome.runtime.sendMessage=async m=>m.type==='settingsSave'?(failed?{error:'模拟写入失败'}:{result:{settings:m.settings,syncWarning:true}}):old(m);});await page.locator('#delay').fill('6');await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='error');assert.equal(await page.locator('#delay').inputValue(),'6');await page.evaluate(()=>failed=false);await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('本机已保存，同步失败'));assert.equal(await page.locator('button[type=submit]').isDisabled(),false);}finally{await page.close();}});
test('未保存密钥定位连接分类，不影响其他操作按钮状态',async()=>{const {page}=await setup();try{await page.addScriptTag({content:fs.readFileSync('options-layout.js','utf8')});await page.locator('#tab-account').click();await page.locator('#apiKey').fill('demo-draft');await page.locator('#tab-common').click();await page.locator('button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#group-account').hidden);assert.equal(await page.locator('#apiKey').inputValue(),'demo-draft');assert.equal(await page.evaluate(()=>document.activeElement.id),'saveKey');}finally{await page.close();}});

test('未保存修改与密钥触发离开保护，保存成功后取消普通设置保护',async()=>{const {page}=await setup();try{const prevented=()=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});dispatchEvent(event);return event.defaultPrevented;});assert.equal(await prevented(),false);await page.locator('#delay').fill('4');assert.equal(await prevented(),true);await page.locator('button[type=submit]').click();await page.waitForFunction(()=>document.getElementById('status').dataset.state==='saved');assert.equal(await prevented(),false);await page.locator('#apiKey').fill('unsaved-demo');assert.equal(await prevented(),true);}finally{await page.close();}});

test('导入设置不把尚未保存的模型草稿标为已保存',async()=>{const {page,env}=await setup({model:'old-model'});try{await page.locator('#model').fill('unsaved-model');const file={format:'uooc-settings',version:1,settings:{rate:1.5}};await page.locator('#importFile').setInputFiles({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});await page.locator('#importPreview').waitFor({state:'visible'});await page.locator('#applyImport').click();await page.waitForFunction(()=>document.getElementById('utilityResult').textContent.includes('已导入'));assert.equal(env.local.model,'old-model');assert.equal(await page.locator('#model').inputValue(),'unsaved-model');assert.equal(await page.locator('#status').getAttribute('data-state'),'dirty');}finally{await page.close();}});
