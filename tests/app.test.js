const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function app(saved){
 const elements=new Map(),intervals=new Map(),timeouts=new Map(),storage=new Map();let id=0,now=1000;
 if(saved)storage.set('studyhelper_v6_demo',JSON.stringify(saved));
 const el=name=>{if(!elements.has(name))elements.set(name,{innerHTML:'',style:{},classList:{add(){},remove(){},contains(){return false}},dataset:{}});return elements.get(name)};
 const answers=[0,1,2,3].map(i=>({...el('answer'+i),dataset:{answer:String(i)}}));
 const context=vm.createContext({console,structuredClone,StudyAdaptive:require('../adaptive'),alert(){},confirm:()=>true,
 Date:class extends Date{static now(){return now}},
 document:{getElementById:el,querySelectorAll:selector=>selector==='.answer'?answers:[],querySelector:()=>null,addEventListener(){}},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 setInterval:f=>{intervals.set(++id,f);return id},clearInterval:i=>intervals.delete(i),
 setTimeout:f=>{timeouts.set(++id,f);return id},clearTimeout:i=>timeouts.delete(i)});
 let src=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 src=src.replace(/bootAuth\(\);\s*$/,'');vm.runInContext(src,context);
 return {run:code=>vm.runInContext(code,context),el,answers,intervals,timeouts,storage,advance:ms=>{now+=ms;for(const f of [...intervals.values()])f()}};
}
test('legacy backup loads under unchanged storage key and round-trips unknown fields',()=>{
 const a=app({courses:[],sets:[],books:[],progress:{xp:123,concepts:{Custom:0}},custom:'retained'});
 a.run('save()');const stored=JSON.parse(a.storage.get('studyhelper_v6_demo'));
 assert.equal(stored.progress.xp,123);assert.equal(stored.progress.concepts.Custom,0);assert.equal(stored.custom,'retained');
});
test('normalization preserves identifiers and course filtering excludes other courses',()=>{
 const a=app();assert.equal(a.run('getQuestions(null,null,"math210").length'),2);
 assert.equal(a.run('getQuestions(null,null,"math210").every(q=>normalizeQuestion(q).courseId==="math210")'),true);
});
test('missing legacy IDs are assigned once and saved without changing question content',()=>{
 const a=app();const text=a.run('state.sets[0].questions[0].q');
 const id=a.run('getQuestions()[0].id');a.run('save()');
 assert.equal(a.run('getQuestions()[0].id'),id);
 const saved=JSON.parse(a.storage.get('studyhelper_v6_demo'));
 assert.equal(saved.sets[0].questions[0].id,id);assert.equal(saved.sets[0].questions[0].q,text);
});
test('graded answers update only the scoped course concept',()=>{
 const a=app();a.run('state.sets=[{id:"s1",courseId:"cs220",questions:[{id:"q",q:"One",concept:"Same",answers:["Yes","No"],correct:0}]},{id:"s2",courseId:"math210",questions:[{id:"q",q:"Two",concept:"Same",answers:["Yes","No"],correct:0}]}];state.progress.concepts={Same:50};quiz("s1")');
 a.answers[0].onclick();assert.equal(a.run('state.courses[0].mastery'),52);assert.equal(a.run('state.courses[1].mastery'),50);
});
test('practice is untimed, answers count once, and canceled callbacks cannot grade',()=>{
 const a=app();a.run('quiz()');assert.equal(a.intervals.size,0);
 const before=a.run('state.progress.questionsAnswered');
 const click=a.answers[0].onclick;click();click();assert.equal(a.run('state.progress.questionsAnswered'),before+1);
 a.run('closeModal()');click();assert.equal(a.run('state.progress.questionsAnswered'),before+1);
 assert.equal(a.run('activeGameSession'),null);
});
test('game timers catch up after delay and clean up on close and replacement',()=>{
 const a=app();a.run('startGameSession(getQuestions(),"Quest Rush")');assert.equal(a.intervals.size,1);
 a.advance(61000);assert.equal(a.intervals.size,0);assert.match(a.el('modalContent').innerHTML,/Time is up/);
 a.run('startGameSession(getQuestions(),"Campus Clash")');a.advance(74000);assert.equal(a.intervals.size,1);
 a.advance(1000);assert.equal(a.intervals.size,0);assert.match(a.el('modalContent').innerHTML,/arena timer ran out/);
 a.run('startGameSession(getQuestions(),"Quest Rush");startGameSession(getQuestions(),"Campus Clash")');
 assert.equal(a.intervals.size,1);a.run('closeModal()');assert.equal(a.intervals.size,0);
});
test('Boss Battle keeps its lives and has no countdown',()=>{
 const a=app();a.run('startGameSession(getQuestions(),"Boss Battle")');assert.equal(a.intervals.size,0);
 assert.match(a.el('modalContent').innerHTML,/3 lives/);
});
test('navigation saves locally without enqueueing identical cloud content',()=>{
 const a=app();a.run('authMode="cloud";authClient={};sessionUser={id:"u1"};save()');
 assert.equal(a.timeouts.size,1);a.timeouts.clear();a.run('state.view="practice";save()');assert.equal(a.timeouts.size,0);
 a.run('state.progress.xp++;save()');assert.equal(a.timeouts.size,1);
});
