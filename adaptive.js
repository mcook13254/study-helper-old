(function(root){
  'use strict';
  const DAY=86400000;
  const key=q=>JSON.stringify([q.courseId||'',q.setId||'',q.id||q.q]);
  const conceptKey=q=>JSON.stringify([q.courseId||'',q.setId||'',q.concept||'General']);
  const empty=()=>({version:1,questions:{},concepts:{}});
  function data(progress){return progress.adaptive||empty()}
  function mastery(progress,q){
    const value=data(progress).concepts[conceptKey(q)];
    return Number.isFinite(value)?value:(progress.concepts?.[q.concept||'General']??50);
  }
  function record(progress,q,correct,now=Date.now()){
    const a=progress.adaptive||(progress.adaptive=empty());
    const id=key(q), old=a.questions[id]||{}, streak=correct?(old.streak||0)+1:0;
    const intervalDays=correct?Math.min(30,streak===1?1:Math.max(1,(old.intervalDays||1)*2)):0;
    a.questions[id]={...old,attempts:(old.attempts||0)+1,correct:(old.correct||0)+(correct?1:0),streak,intervalDays,lastSeen:now,dueAt:now+(correct?intervalDays*DAY:10*60000),lastCorrect:correct};
    a.concepts[conceptKey(q)]=Math.max(0,Math.min(100,mastery(progress,q)+(correct?2:-1)));
  }
  function prepare(progress,questions){
    const a=progress.adaptive||(progress.adaptive=empty());
    for(const q of questions){const k=conceptKey(q);if(!Number.isFinite(a.concepts[k]))a.concepts[k]=mastery(progress,q)}
  }
  function select(questions,progress,limit=5,now=Date.now(),random=Math.random){
    const a=data(progress);
    return questions.map(q=>{
      const s=a.questions[key(q)];
      const due=s&&s.dueAt<=now;
      const score=(due?100+Math.min(30,(now-s.dueAt)/DAY):!s?80:0)+(100-mastery(progress,q))*.35+(s?.lastCorrect===false?20:0);
      return {q,score,tie:random()};
    }).sort((a,b)=>b.score-a.score||a.tie-b.tie).slice(0,limit).map(x=>x.q);
  }
  function summarize(courses,questions,progress){
    const groups=new Map(courses.map(c=>[c.id,[]]));
    for(const q of questions)groups.get(q.courseId)?.push(q);
    return courses.map(c=>{
      const qs=groups.get(c.id), concepts=new Map();
      for(const q of qs)concepts.set(conceptKey(q),{name:q.concept||'General',value:mastery(progress,q)});
      const vals=[...concepts.values()];
      return {...c,items:qs.length,mastery:vals.length?Math.round(vals.reduce((n,x)=>n+x.value,0)/vals.length):c.mastery,
        weak:vals.length?vals.reduce((a,b)=>a.value<=b.value?a:b).name:c.weak};
    });
  }
  const api={key,conceptKey,empty,mastery,record,prepare,select,summarize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StudyAdaptive=api;
})(typeof globalThis!=='undefined'?globalThis:this);
