(() => {
 const defaults={delay:3,rate:2,timerMinutes:0,sound:true,autoSubmit:false,questionSelector:'',stemSelector:'',nextSelector:''};
 const rates=[1,1.25,1.5,1.75,2],selectors=['questionSelector','stemSelector','nextSelector'];
 function validate(value,strict=true){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('设置必须为 JSON 对象');
  if(strict&&Object.keys(value).some(k=>!Object.hasOwn(defaults,k)))throw Error('包含不支持的设置字段');
  const result={...defaults};
  for(const k of Object.keys(defaults))if(Object.hasOwn(value,k))result[k]=value[k];
  if(typeof result.delay!=='number'||!Number.isFinite(result.delay)||result.delay<1||result.delay>15)throw Error('逐题停顿应为 1–15 秒');
  if(!rates.includes(result.rate))throw Error('倍速应为 1、1.25、1.5、1.75 或 2');
  if(!Number.isInteger(result.timerMinutes)||result.timerMinutes<0||result.timerMinutes>240)throw Error('定时应为关闭或 1–240 分钟');
  if(typeof result.autoSubmit!=='boolean')throw Error('自动提交开关格式错误');
  if(typeof result.sound!=='boolean')throw Error('声音开关格式错误');
  for(const k of selectors)if(typeof result[k]!=='string'||result[k].length>500)throw Error('页面选择器格式错误');
  return result;
 }
 function parse(text){
  if(new TextEncoder().encode(text).length>65536)throw Error('备份文件不能超过 64 KB');
  let data;try{data=JSON.parse(text);}catch{throw Error('不是有效 JSON 文件');}
  if(!data||data.format!=='uooc-settings'||data.version!==1||Object.keys(data).some(k=>!['format','version','settings'].includes(k)))throw Error('不支持的备份格式或版本');
  return validate(data.settings);
 }
 function selectorCheck(settings){for(const k of selectors)if(settings[k])try{document.querySelector(settings[k]);}catch{throw Error('CSS 选择器格式错误');}}
 const labels={delay:'逐题停顿（秒）',rate:'播放倍速',timerMinutes:'定时停止（分钟，0为关闭）',sound:'异常声音提醒',autoSubmit:'自动提交测验（正式交卷）',questionSelector:'题目容器',stemSelector:'题干选择器',nextSelector:'下一节选择器'};
 globalThis.UoocSettings={defaults,rates,selectors,labels,validate,parse,selectorCheck,backup:settings=>({format:'uooc-settings',version:1,settings:validate(settings,false)})};
})();
