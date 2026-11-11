const {test}=require('node:test'),assert=require('node:assert/strict');
const {environment,A,B,score,course,list}=require('./grades-env.cjs');
function setup(failed=true){
 const now=Date.now(),saved={...score(70),updatedAt:now-20000};
 return environment({gradeCache:{version:1,accounts:{[A]:{courses:{
  900:{...course('900'),seenAt:now,snapshot:saved,lastError:null},
  100:{...course('100'),seenAt:now,snapshot:saved,lastError:failed?'PAGE_TIMEOUT':null}
 }}}}},{gradeAccount:{hash:A}});
}
test('优课集中重试仅扫描失败课程，保留成功快照及网站顺序',async()=>{
 const e=setup(),previous=structuredClone(e.local.gradeCache.accounts[A].courses[900].snapshot);
 await e.send('gradesStart',{retryFailed:true});
 await list(e,[course('900'),course('100')]);
 assert.deepEqual(Array.from(e.session.gradeJob.targets),['100']);
 const current=await e.send('gradesGet');
 assert.equal(current.job.currentCourse.name,course('100').name);
 assert.equal(current.job.total,1);
 await e.reply(score(90));
 assert.equal(e.session.gradeJob.phase,'account');
 await e.reply({account:A});
 const result=await e.send('gradesGet');
 assert.equal(result.job.status,'done');assert.equal(result.job.currentCourse,null);
 assert.deepEqual(e.local.gradeCache.accounts[A].courses[900].snapshot,previous);
 assert.equal(e.local.gradeCache.accounts[A].courses[100].lastError,null);
 assert.equal(e.local.gradeCache.accounts[A].courses[900].order,0);
 assert.equal(e.local.gradeCache.accounts[A].courses[100].order,1);
});
test('优课无失败课程不创建标签页，非法组合和未确认账号均被拒绝',async()=>{
 const e=setup(false);
 assert.equal((await e.send('gradesStart',{retryFailed:true})).code,'NO_FAILED_COURSES');
 assert.equal(e.tabs.size,0);assert.equal(e.session.gradeAccount.hash,A);
 await assert.rejects(e.send('gradesStart',{retryFailed:true,cycleId:'100'}),/重试参数/);
 await assert.rejects(e.send('gradesStart',{retryFailed:'true'}),/重试参数/);
 delete e.session.gradeAccount;
 await assert.rejects(e.send('gradesStart',{retryFailed:true}),error=>error.code==='LOGIN_REQUIRED');
 assert.equal(e.tabs.size,0);
});
test('优课重试目标在读取列表前绑定账号，切换账号不公布数据',async()=>{
 const e=setup(),prior=structuredClone(e.local.gradeCache);
 await e.send('gradesStart',{retryFailed:true});
 await e.reply({account:B,courses:[course('100')],next:false,pageKey:'other'});
 const result=await e.send('gradesGet');
 assert.equal(result.verified,false);assert.equal(result.job.errorCode,'ACCOUNT_CHANGED');
 assert.deepEqual(e.local.gradeCache,prior);
});
test('优课失败课程已退选时跳过成绩读取，仍执行最终账号核对',async()=>{
 const e=setup();
 await e.send('gradesStart',{retryFailed:true});
 await list(e,[course('900')]);
 assert.equal(e.session.gradeJob.phase,'account');
 assert.equal(e.session.gradeJob.targets.length,0);
 await e.reply({account:A});
 assert.equal((await e.send('gradesGet')).courses.length,1);
 assert.equal(e.local.gradeCache.accounts[A].courses[100],undefined);
});
test('优课重试在服务休眠后超时仍保留旧成绩，继续账号核对',async()=>{
 const old=setup();
 await old.send('gradesStart',{retryFailed:true});await list(old,[course('900'),course('100')]);
 old.session.gradeJob.pending.deadline=Date.now()-1;
 const e=environment(old.local,old.session),id=e.session.gradeJob.tabId;
 e.tabs.set(id,{documentId:'restored'});
 await e.api.restore();
 assert.equal(e.session.gradeJob.phase,'account');
 await e.reply({account:A});
 const result=await e.send('gradesGet');
 assert.equal(result.job.failed,1);
 assert.equal(result.courses.find(c=>c.cycleId==='100').snapshot.current.value,70);
 assert.equal(result.courses.find(c=>c.cycleId==='100').lastError,'PAGE_TIMEOUT');
});
test('优课正常队列兼容旧调用，运行中返回实时失败数',async()=>{
 const e=environment();
 await e.send('gradesStart');
 await list(e,[course('301'),course('302')]);
 await e.reply(null,'PAGE_TIMEOUT');
 const result=await e.send('gradesGet');
 assert.equal(result.job.done,1);assert.equal(result.job.failed,1);
 assert.equal(result.job.currentCourse.cycleId,'302');
 await e.send('gradesCancel');
 assert.equal((await e.send('gradesGet')).job.errorCode,'CANCELLED');
});
test('取消优课重试保留上轮确认结果，暂存的成绩不会提前写入',async()=>{
 const e=setup(),prior=structuredClone(e.local.gradeCache);
 await e.send('gradesStart',{retryFailed:true});await list(e,[course('900'),course('100')]);
 await e.reply(score(99));
 assert.equal(e.session.gradeJob.phase,'account');
 await e.send('gradesCancel');
 assert.deepEqual(e.local.gradeCache,prior);
 assert.equal((await e.send('gradesGet')).job.status,'cancelled');
});
