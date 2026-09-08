const { createClient } = require('@supabase/supabase-js');

function validId(v){return typeof v==='string'&&v.length>0&&v.length<=120}

module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const url=process.env.SUPABASE_URL;
    const anonKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
    const secretKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!anonKey||!secretKey) return res.status(503).json({error:'Supabase cloud storage is not configured.'});
    if(!token) return res.status(401).json({error:'Missing access token.'});
    const authClient=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:authData,error:authError}=await authClient.auth.getUser(token);
    if(authError||!authData.user) return res.status(401).json({error:'Invalid session.'});
    const admin=createClient(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:me,error:meError}=await admin.from('profiles').select('id,status').eq('id',authData.user.id).single();
    if(meError||!me||me.status!=='active') return res.status(403).json({error:'Active StudyHelper account required.'});
    const body=req.body||{};
    const courses=Array.isArray(body.courses)?body.courses:[];
    const sets=Array.isArray(body.sets)?body.sets:[];
    const progress=body.progress||{};
    if(courses.some(c=>!validId(c.id))||sets.some(s=>!validId(s.id))) return res.status(400).json({error:'Invalid study data identifiers.'});

    const courseRows=courses.map(c=>({id:c.id,owner_id:authData.user.id,name:String(c.name||'').slice(0,200),code:String(c.code||'').slice(0,60),mastery:Number(c.mastery||0),items:Number(c.items||0),weak:String(c.weak||'').slice(0,500)}));
    const setRows=sets.map(s=>({id:s.id,owner_id:authData.user.id,course_id:String(s.courseId||''),title:String(s.title||'').slice(0,200)}));
    const questionRows=[];
    for(const s of sets){for(const q of (Array.isArray(s.questions)?s.questions:[])){questionRows.push({id:validId(q.id)?q.id:`q_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,owner_id:authData.user.id,set_id:s.id,question:String(q.q||'').slice(0,4000),answers:Array.isArray(q.answers)?q.answers.slice(0,6).map(x=>String(x||'').slice(0,1000)):[],correct:Array.isArray(q.correct)?q.correct.map(Number):Number(q.correct||0),type:q.type==='multiple'?'multiple':'single',explanation:String(q.explain||'').slice(0,4000),concept:String(q.concept||'').slice(0,200),difficulty:['easy','medium','hard'].includes(q.difficulty)?q.difficulty:'medium'});}}

    const {data:oldCourses}=await admin.from('courses').select('id').eq('owner_id',authData.user.id);
    const {data:oldSets}=await admin.from('study_sets').select('id').eq('owner_id',authData.user.id);
    const {data:oldQuestions}=await admin.from('questions').select('id').eq('owner_id',authData.user.id);
    const keepCourses=new Set(courseRows.map(x=>x.id));
    const keepSets=new Set(setRows.map(x=>x.id));
    const keepQuestions=new Set(questionRows.map(x=>x.id));
    if(oldQuestions?.length){const stale=oldQuestions.map(x=>x.id).filter(id=>!keepQuestions.has(id));if(stale.length){const {error}=await admin.from('questions').delete().eq('owner_id',authData.user.id).in('id',stale);if(error)throw error}}
    if(oldSets?.length){const stale=oldSets.map(x=>x.id).filter(id=>!keepSets.has(id));if(stale.length){const {error}=await admin.from('study_sets').delete().eq('owner_id',authData.user.id).in('id',stale);if(error)throw error}}
    if(oldCourses?.length){const stale=oldCourses.map(x=>x.id).filter(id=>!keepCourses.has(id));if(stale.length){const {error}=await admin.from('courses').delete().eq('owner_id',authData.user.id).in('id',stale);if(error)throw error}}
    if(courseRows.length){const {error}=await admin.from('courses').upsert(courseRows,{onConflict:'id'});if(error)throw error}
    if(setRows.length){const {error}=await admin.from('study_sets').upsert(setRows,{onConflict:'id'});if(error)throw error}
    if(questionRows.length){const {error}=await admin.from('questions').upsert(questionRows,{onConflict:'id'});if(error)throw error}
    const progressRow={user_id:authData.user.id,streak:Number(progress.streak||0),xp:Number(progress.xp||0),mastery:Number(progress.mastery||0),questions_answered:Number(progress.questionsAnswered||0),best_streak:Number(progress.bestStreak||0),concepts:progress.concepts&&typeof progress.concepts==='object'?progress.concepts:{},updated_at:new Date().toISOString()};
    const {error:progressError}=await admin.from('progress').upsert(progressRow,{onConflict:'user_id'});if(progressError)throw progressError;
    return res.status(200).json({ok:true});
  }catch(error){return res.status(500).json({error:error.message||'Cloud sync failed.'})}
};
