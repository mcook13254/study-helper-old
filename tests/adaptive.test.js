const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../adaptive');
const q={id:'q1',q:'Example',courseId:'c1',setId:'s1',concept:'Shared'};
test('adds review history without changing any legacy progress or content',()=>{
  const p={xp:800,questionsAnswered:20,concepts:{Shared:0},custom:{retained:true}};
  const before=JSON.stringify(p);
  A.record(p,q,true,1000);
  const {adaptive,...legacy}=p;
  assert.equal(JSON.stringify(legacy),before);
  assert.equal(A.mastery(p,q),2);
  assert.equal(adaptive.questions[A.key(q)].dueAt,86401000);
});
test('same question IDs and concept names are isolated by course and set',()=>{
  const p={concepts:{Shared:50}};
  A.record(p,q,false,1000);
  assert.equal(A.mastery(p,q),49);
  assert.equal(A.mastery(p,{...q,courseId:'c2'}),50);
  assert.equal(A.mastery(p,{...q,setId:'s2'}),50);
});
test('initial scoped baselines stay independent when the legacy aggregate changes',()=>{
 const p={concepts:{Shared:50}},other={...q,setId:'s2',courseId:'c2'};
 A.prepare(p,[q,other]);A.record(p,q,true,0);p.concepts.Shared=52;
 assert.equal(A.mastery(p,q),52);assert.equal(A.mastery(p,other),50);
});
test('correct streak expands spacing, caps at 30 days; a miss resets spacing',()=>{
  const p={concepts:{}};
  for(let i=0;i<9;i++)A.record(p,q,true,1000);
  assert.equal(p.adaptive.questions[A.key(q)].intervalDays,30);
  A.record(p,q,false,2000);
  assert.equal(p.adaptive.questions[A.key(q)].dueAt,602000);
  assert.equal(p.adaptive.questions[A.key(q)].streak,0);
});
test('due and unseen questions outrank recently mastered ones without duplicates',()=>{
  const p={concepts:{}};const unseen={...q,id:'new'},due={...q,id:'due'};
  A.record(p,q,true,1000000);A.record(p,due,false,0);
  const pool=[q,unseen,due],copy=JSON.stringify(pool);
  const chosen=A.select(pool,p,2,1000000,()=>.5);
  assert.deepEqual(chosen,[due,unseen]);assert.equal(JSON.stringify(pool),copy);
});
test('mastery aggregation uses separate set concepts and preserves unknown course data',()=>{
 const p={concepts:{Shared:50}},other={...q,courseId:'c2',setId:'s2'};
 A.record(p,q,false,0);
 const result=A.summarize([{id:'c1',extra:42},{id:'c2'}],[q,other],p);
 assert.equal(result[0].mastery,49);assert.equal(result[1].mastery,50);assert.equal(result[0].extra,42);
});
