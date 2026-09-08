const { createClient } = require("@supabase/supabase-js");
function dayDiff(a,b){return Math.round((new Date(`${b}T00:00:00Z`)-new Date(`${a}T00:00:00Z`))/86400000)}
function currentStreak(p){if(!p?.last_study_date)return 0;const today=new Date().toISOString().slice(0,10);const d=dayDiff(p.last_study_date,today);return d>1?0:Number(p.streak||0)}
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const url=process.env.SUPABASE_URL;
  const anonKey=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
  const secretKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anonKey||!secretKey)return res.status(503).json({error:'Supabase is not configured on the server.'});
  if(!token)return res.status(401).json({error:'Missing access token.'});
  const auth=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await auth.auth.getUser(token);
  if(authError||!authData.user)return res.status(401).json({error:'Invalid session.'});
  const admin=createClient(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:me,error:meError}=await admin.from('profiles').select('role,status').eq('id',authData.user.id).single();
  if(meError||me?.role!=='admin'||me?.status!=='active')return res.status(403).json({error:'Administrator access required.'});
  const [profiles,courses,sets,questions,textbooks,shares,progress,requests]=await Promise.all([
   admin.from('profiles').select('id,name,username,email,role,status,created_at').order('created_at',{ascending:true}),
   admin.from('courses').select('id',{count:'exact',head:true}),
   admin.from('study_sets').select('id',{count:'exact',head:true}),
   admin.from('questions').select('id',{count:'exact',head:true}),
   admin.from('textbooks').select('id,size_bytes',{count:'exact'}),
   admin.from('study_set_shares').select('id',{count:'exact',head:true}),
   admin.from('progress').select('user_id,streak,best_streak,questions_answered,last_study_date,xp'),
   admin.from('access_requests').select('id',{count:'exact',head:true}).eq('status','pending')
  ]);
  for(const r of [profiles,courses,sets,questions,textbooks,shares,progress,requests])if(r.error)throw r.error;
  const byUser=new Map((progress.data||[]).map(p=>[p.user_id,p]));
  const users=(profiles.data||[]).map(u=>{const p=byUser.get(u.id)||{};return {...u,streak:currentStreak(p),bestStreak:Number(p.best_streak||0),questionsAnswered:Number(p.questions_answered||0),xp:Number(p.xp||0),lastStudyDate:p.last_study_date||null}});
  const textbookBytes=(textbooks.data||[]).reduce((s,b)=>s+Number(b.size_bytes||0),0);
  return res.status(200).json({totals:{accounts:users.length,active:users.filter(u=>u.status==='active').length,pendingRequests:requests.count||0,courses:courses.count||0,studySets:sets.count||0,questions:questions.count||0,textbooks:textbooks.count||0,sharedSets:shares.count||0,questionsAnswered:users.reduce((s,u)=>s+u.questionsAnswered,0),activeStreaks:users.filter(u=>u.streak>0).length,totalXp:users.reduce((s,u)=>s+u.xp,0),textbookBytes},users});
 }catch(e){return res.status(500).json({error:e.message||'Could not load admin statistics.'})}
};
