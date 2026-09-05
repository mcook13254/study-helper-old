const { createClient } = require('@supabase/supabase-js');

async function context(req){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const url=process.env.SUPABASE_URL;
  const anonKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  const secretKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anonKey||!secretKey)return {status:503,error:'Supabase is not configured on the server.'};
  if(!token)return {status:401,error:'Missing access token.'};
  const client=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  if(error||!data.user)return {status:401,error:'Invalid session.'};
  const admin=createClient(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:profile}=await admin.from('profiles').select('id,name,username,status').eq('id',data.user.id).single();
  if(!profile||profile.status!=='active')return {status:403,error:'Active StudyHelper account required.'};
  return {admin,user:data.user,profile};
}

module.exports=async function handler(req,res){
  const ctx=await context(req); if(ctx.error)return res.status(ctx.status).json({error:ctx.error});
  const {admin,user,profile}=ctx;
  try{
    if(req.method==='GET'){
      const setId=String(req.query?.setId||'');
      if(!setId)return res.status(400).json({error:'A study set is required.'});
      const {data:set,error:setError}=await admin.from('study_sets').select('id,owner_id,visibility,title,source_creator_name').eq('id',setId).single();
      if(setError||!set)return res.status(404).json({error:'Study set not found.'});
      if(set.owner_id!==user.id)return res.status(403).json({error:'You can only manage sharing for your own study sets.'});
      const {data:shares,error}=await admin.from('study_set_shares').select('id,shared_with_user_id,created_at').eq('set_id',setId).order('created_at',{ascending:true});
      if(error)throw error;
      const ids=(shares||[]).map(s=>s.shared_with_user_id).filter(Boolean);
      let recipients=[];
      if(ids.length){const {data:profiles}=await admin.from('profiles').select('id,name,username').in('id',ids);recipients=profiles||[];}
      return res.status(200).json({set,shares:recipients.map(p=>({id:(shares||[]).find(s=>s.shared_with_user_id===p.id)?.id,userId:p.id,name:p.name,username:p.username}))});
    }
    if(req.method!=='POST'&&req.method!=='DELETE')return res.status(405).json({error:'Method not allowed'});
    const body=req.body||{}; const setId=String(body.setId||''); if(!setId)return res.status(400).json({error:'A study set is required.'});
    const {data:set,error:setError}=await admin.from('study_sets').select('id,owner_id').eq('id',setId).single();
    if(setError||!set)return res.status(404).json({error:'Study set not found.'});
    if(set.owner_id!==user.id)return res.status(403).json({error:'You can only share your own study sets.'});
    if(req.method==='DELETE'){
      const shareId=String(body.shareId||'');
      const sharedWithUserId=String(body.sharedWithUserId||'');
      let query=admin.from('study_set_shares').delete().eq('set_id',setId).eq('owner_id',user.id);
      if(shareId)query=query.eq('id',shareId); else if(sharedWithUserId)query=query.eq('shared_with_user_id',sharedWithUserId); else return res.status(400).json({error:'A share identifier is required.'});
      const {error}=await query; if(error)throw error;
      return res.status(200).json({ok:true});
    }
    const action=body.action;
    if(action==='visibility'){
      const visibility=String(body.visibility||'private'); if(!['private','shared','public'].includes(visibility))return res.status(400).json({error:'Invalid visibility.'});
      const {error:updateError}=await admin.from('study_sets').update({visibility,updated_at:new Date().toISOString()}).eq('id',setId).eq('owner_id',user.id); if(updateError)throw updateError;
      return res.status(200).json({ok:true,visibility});
    }
    if(action==='share-user'){
      const username=String(body.username||'').trim().replace(/^@/,'').toLowerCase(); if(!/^[a-z0-9_]{3,24}$/.test(username))return res.status(400).json({error:'Enter a valid StudyHelper username.'});
      if(username===String(profile.username||'').toLowerCase())return res.status(400).json({error:'You already own this study set.'});
      const {data:recipient}=await admin.from('profiles').select('id,name,username,email,status').ilike('username',username).maybeSingle();
      if(!recipient)return res.status(404).json({error:'No active StudyHelper account was found for that username.'});
      if(recipient.status!=='active')return res.status(400).json({error:'That account is not active.'});
      const {data:existing,error:existingError}=await admin.from('study_set_shares').select('id').eq('set_id',setId).eq('shared_with_user_id',recipient.id).maybeSingle(); if(existingError)throw existingError; if(!existing){const {error}=await admin.from('study_set_shares').insert({set_id:setId,owner_id:user.id,shared_with_user_id:recipient.id}); if(error)throw error;}
      await admin.from('study_sets').update({visibility:'shared',updated_at:new Date().toISOString()}).eq('id',setId);
      return res.status(200).json({ok:true,user:{id:recipient.id,name:recipient.name,username:recipient.username}});
    }
    return res.status(400).json({error:'Unknown sharing action.'});
  }catch(e){return res.status(500).json({error:e.message||'Sharing operation failed.'})}
};