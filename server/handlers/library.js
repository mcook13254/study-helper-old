const { createClient } = require('@supabase/supabase-js');
function authContext(req){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const url=process.env.SUPABASE_URL, anonKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY, secretKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anonKey||!secretKey)return {error:'Supabase is not configured on the server.',status:503}; if(!token)return {error:'Missing access token.',status:401};
  const client=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}}); return {url,secretKey,token,client};
}
async function ctx(req){const c=authContext(req);if(c.error)return c;const {data,error}=await c.client.auth.getUser(c.token);if(error||!data.user)return {error:'Invalid session.',status:401};const admin=createClient(c.url,c.secretKey,{auth:{persistSession:false,autoRefreshToken:false}});const {data:p}=await admin.from('profiles').select('id,name,email,status').eq('id',data.user.id).single();if(!p||p.status!=='active')return {error:'Active StudyHelper account required.',status:403};return {admin,user:data.user,profile:p};}
module.exports=async function handler(req,res){const c=await ctx(req);if(c.error)return res.status(c.status).json({error:c.error});const {admin,user}=c;try{
  if(req.method==='GET'){
    const [setsRes, sharesRes, libRes]=await Promise.all([
      admin.from('study_sets').select('id,title,owner_id,visibility,source_set_id,source_creator_name,created_at').or(`visibility.eq.public,owner_id.eq.${user.id}`).order('created_at',{ascending:false}),
      admin.from('study_set_shares').select('set_id').eq('shared_with_user_id',user.id),
      admin.from('study_sets').select('id,title,owner_id,visibility,source_set_id,source_creator_name,created_at').eq('owner_id',user.id).not('source_set_id','is',null).order('created_at',{ascending:false})
    ]);
    for(const r of [setsRes,sharesRes,libRes])if(r.error)throw r.error;
    const sharedIds=new Set((sharesRes.data||[]).map(x=>x.set_id));
    const extraIds=[...sharedIds]; let extra=[]; if(extraIds.length){const r=await admin.from('study_sets').select('id,title,owner_id,visibility,source_set_id,source_creator_name,created_at').in('id',extraIds);if(r.error)throw r.error;extra=r.data||[];}
    const unique=new Map();for(const x of [...(setsRes.data||[]),...extra]){if(x.owner_id!==user.id)unique.set(x.id,{...x,access:x.visibility==='public'?'Public':'Shared with you'});}
    return res.status(200).json({available:[...unique.values()],library:libRes.data||[]});
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const {action,setId}=req.body||{}; if(action!=='copy'||!setId)return res.status(400).json({error:'Invalid library request.'});
  const {data:set,error:setError}=await admin.from('study_sets').select('*').eq('id',setId).single(); if(setError||!set)return res.status(404).json({error:'Study set not found.'});
  const [shareCheck, questionRes]=await Promise.all([
    admin.from('study_set_shares').select('id').eq('set_id',setId).eq('shared_with_user_id',user.id).maybeSingle(),
    admin.from('questions').select('*').eq('set_id',setId).order('created_at',{ascending:true})
  ]); if(questionRes.error)throw questionRes.error;
  const allowed=set.visibility==='public'||set.owner_id===user.id||Boolean(shareCheck.data); if(!allowed)return res.status(403).json({error:'This study set is not shared with you.'});
  if(set.owner_id===user.id)return res.status(400).json({error:'That set is already yours.'});
  const newSetId=`set_${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
  const copySet={id:newSetId,owner_id:user.id,course_id:'',title:set.title,source_set_id:set.id,source_owner_id:set.owner_id,source_creator_name:set.source_creator_name||'StudyHelper user',visibility:'private'};
  const {error:setInsertError}=await admin.from('study_sets').insert(copySet);if(setInsertError)throw setInsertError;
  const rows=(questionRes.data||[]).map((q,i)=>({id:`q_${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2,6)}`,owner_id:user.id,set_id:newSetId,question:q.question,answers:q.answers,correct:q.correct,type:q.type,explanation:q.explanation,concept:q.concept,difficulty:q.difficulty}));
  if(rows.length){const {error}=await admin.from('questions').insert(rows);if(error){await admin.from('study_sets').delete().eq('id',newSetId).eq('owner_id',user.id);throw error}}
  return res.status(200).json({ok:true,set:{id:newSetId,title:set.title,source_creator_name:set.source_creator_name||'StudyHelper user',questions:rows.map(q=>({id:q.id,q:q.question,answers:q.answers,correct:q.correct,type:q.type,explain:q.explanation,concept:q.concept,difficulty:q.difficulty})),courseId:''}});
}catch(e){return res.status(500).json({error:e.message||'Library operation failed.'})}};