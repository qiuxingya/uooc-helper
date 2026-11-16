const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{environment}=require('./polymas-env.cjs');
const target={courseId:'courseA',classId:'classA',termId:20271,cycleId:'courseA:classA:20271',name:'模拟智能体课程'};
const setting=(visible=true,archived=false)=>({courseId:'courseA',classId:'classA',isViewScore:visible,isArchive:archived});
const score=(n=0)=>({courseId:'courseA',classId:'classA',userId:'private-user-id',attendanceScore:0,usualScore:n,homeworkScore:0,examScore:0,totalScore:n,finalScore:null,attendance:10,usual:60,homework:10,exam:20,assessmentScoreStudentList:null,updateTime:'2026-11-16'});
const reply=data=>({ok:true,status:200,json:async()=>({code:200,data})});
function setup(){const e=environment();e.jar.push(e.cookie());e.mock={visible:true,archived:false,score:0,account:'fixture-student',fail:false};e.context.responder=async(raw,options)=>{
 const u=new URL(raw);if(u.pathname.endsWith('get-current-user-detail'))return reply({userNid:e.mock.account,authType:0,schoolInfo:{nid:'fixture-school'}});
 if(u.pathname.endsWith('queryStudentCourse')){const body=JSON.parse(options.body);assert.deepEqual(body,{keyword:'',term:'',schoolId:'fixture-school',status:2,page:1,size:16});return reply({list:[{courseId:'courseA',courseName:'模拟智能体课程',courseType:'agent'},{courseId:'legacy',courseName:'其他模式课程',courseType:'shareCourse'}],total:2});}
 if(u.pathname.endsWith('/term/list'))return reply([{term:20271,termName:'2026年秋冬学期',isCurrent:true}]);
 if(u.pathname.endsWith('/classList'))return reply([{classId:'classA',className:'模拟班级',classCode:'fixture',classType:0}]);
 if(u.pathname.endsWith('getCourseSetting')){if(e.mock.fail)throw Error('private-network-error');if(e.mock.hold)return new Promise(resolve=>e.release=()=>resolve(reply(setting(e.mock.visible,e.mock.archived))));return reply(setting(e.mock.visible,e.mock.archived));}
 if(u.pathname.endsWith('getCourseScore'))return reply(score(e.mock.score));throw Error('Unexpected endpoint '+u.pathname);
 };vm.runInContext(fs.readFileSync('polymas-grades.js','utf8'),e.context);const api=e.context.PolymasGrades;
 const call=(type,data={},role='grades')=>api.handle({type,...data},{},role);
 const wait=async()=>{for(let i=0;i<2000;i++){if(e.session.pmGradeJob?.status!=='running'){await new Promise(r=>setTimeout(r,0));return;}await new Promise(r=>setTimeout(r,1));}throw Error('任务未结束');};
 const run=async(data={})=>{await call('pmGradesStart',data);await api.restore();await wait();return call('pmGradesGet');};return {...e,get release(){return e.release;},api,call,wait,run};}
test('未公布时不请求分数，课程按班级及学期隔离，过滤非智能体课程',async()=>{
 const e=setup();e.mock.visible=false;const r=await e.run();assert.equal(r.job.status,'done');assert.equal(r.verified,true);assert.equal(r.courses.length,1);assert.equal(r.courses[0].cycleId,target.cycleId);assert.equal(r.courses[0].snapshot.current.state,'unpublished');assert.equal(e.calls.filter(c=>c.url.includes('getCourseScore')).length,0);assert.ok(!JSON.stringify(e.local).includes('private-user-id'));assert.ok(!JSON.stringify(e.local).includes('fixture-private-session'));
});
test('公开 0 分与未公布不同，只有归档且公开才显示总评',async()=>{
 const e=setup();let r=await e.run();assert.equal(r.courses[0].snapshot.current.value,0);assert.equal(r.courses[0].snapshot.final.state,'unpublished');e.mock.score=88;e.mock.archived=true;r=await e.run();assert.equal(r.courses[0].snapshot.final.value,88);assert.equal(r.courses[0].snapshot.rows.length,4);assert.equal(r.courses[0].snapshot.progress.value,null);
});
test('公布状态不明确或课程标识不匹配不读取展示分数',()=>{
 const e=setup();assert.throws(()=>e.api.snapshot({...setting(),isViewScore:undefined},score(),target));assert.throws(()=>e.api.snapshot({...setting(),classId:'other'},score(),target));assert.throws(()=>e.api.snapshot(setting(),{...score(),courseId:'other'},target));assert.throws(()=>e.api.snapshot(setting(),{...score(),totalScore:NaN},target));
});
test('失败刷新保留旧快照，集中重试只更新失败课程',async()=>{
 const e=setup();await e.run();const original=e.local.pmGradeCache.accounts[Object.keys(e.local.pmGradeCache.accounts)[0]].courses[target.cycleId].snapshot.updatedAt;e.mock.fail=true;let r=await e.run();assert.equal(r.courses[0].lastError,'NETWORK');assert.equal(r.courses[0].snapshot.updatedAt,original);e.mock.fail=false;e.mock.score=66;r=await e.run({retryFailed:true});assert.equal(r.courses[0].lastError,null);assert.equal(r.courses[0].snapshot.current.value,66);const count=e.calls.length;const noRetry=await e.call('pmGradesStart',{retryFailed:true});assert.equal(noRetry.code,'NO_FAILED_COURSES');assert.equal(e.calls.length,count);
});
test('取消在途读取后不保存迟到结果，重复启动被拒绝',async()=>{
 const e=setup();e.mock.hold=true;await e.call('pmGradesStart');await e.api.restore();while(!e.release)await new Promise(r=>setTimeout(r,1));await assert.rejects(e.call('pmGradesStart'),/正在刷新/);await e.call('pmGradesCancel');e.release();await new Promise(r=>setTimeout(r,5));assert.equal(e.session.pmGradeJob.status,'cancelled');assert.equal((await e.call('pmGradesGet')).verified,false);assert.equal(Object.keys(e.local.pmGradeCache.accounts).length,0);
});
test('结束核对发现换号时隐藏缓存，Cookie 改变后原账号快照不可读',async()=>{
 const e=setup();await e.run();e.jar[0].value='new-private-session';assert.equal((await e.call('pmGradesGet')).verified,false);e.mock.hold=true;await e.call('pmGradesStart');await e.api.restore();while(!e.release)await new Promise(r=>setTimeout(r,1));e.mock.account='new-student';e.release();await e.wait();assert.equal(e.session.pmGradeJob.error,'ACCOUNT_CHANGED');assert.equal((await e.call('pmGradesGet')).verified,false);
});
test('30 天旧快照清理；课程脚本不能扫描或清空',async()=>{
 const e=setup();await e.run();for(const type of ['pmGradesStart','pmGradesGet','pmGradesCancel','pmGradesClear'])await assert.rejects(e.call(type,{},'course'),/扩展页面/);const a=Object.keys(e.local.pmGradeCache.accounts)[0];e.local.pmGradeCache.accounts[a].courses[target.cycleId].seenAt=Date.now()-31*86400000;await e.api.restore();assert.equal((await e.call('pmGradesGet')).courses.length,0);
});
test('后台重建后从持久化的成绩阶段恢复，并完成最终账号核对',async()=>{
 const e=setup();await e.call('pmGradesStart');
 const auth=await e.context.PolymasAPI.profile();Object.assign(e.session.pmGradeJob,{phase:'score',account:auth.account,stamp:auth.stamp,schoolNid:auth.schoolNid,targets:[target],allTargets:[target],found:1});
 vm.runInContext(fs.readFileSync('polymas-grades.js','utf8'),e.context);await e.context.PolymasGrades.restore();await e.wait();assert.equal(e.session.pmGradeJob.status,'done');assert.equal((await e.call('pmGradesGet')).courses[0].snapshot.current.value,0);
});
