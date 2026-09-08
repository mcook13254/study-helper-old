const { createClient } = require('@supabase/supabase-js');

async function context(req) {
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const url=process.env.SUPABASE_URL;
  const anonKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  const secretKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anonKey||!secretKey)return {error:'Supabase is not configured on the server.',status:503};
  if(!token)return {error:'Missing access token.',status:401};
  const client=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await client.auth.getUser(token);
  if(authError||!authData.user)return {error:'Invalid session.',status:401};
  const admin=createClient(url,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:me,error:meError}=await admin.from('profiles').select('id,status,username').eq('id',authData.user.id).single();
  if(meError||!me||me.status!=='active')return {error:'Active StudyHelper account required.',status:403};
  return {admin,user:authData.user,profile:me};
}

module.exports=async function handler(req,res){
  const ctx=await context(req); if(ctx.error)return res.status(ctx.status).json({error:ctx.error});
  const {admin,user}=ctx;
  try{
    if(req.method==='GET'){
      const mode=req.query?.mode||'library';
      if(mode==='library'){
        const {data:shares,error}=await admin.from('study_set_shares').select('id,set_id,owner_id,created_at').eq('recipient_id',user.id).order('created_at',{ascending:false});
        if(error)throw error;
        const result=[];
        for(const share of (shares||[])){
          const {data:set}=await admin.from('study_sets').select('id,title').eq('id',share.set_id).eq('owner_id',share.owner_id).maybeSingle();
          if(!set)continue;
          const [{data:owner},{data:questions}]=await Promise.all([
            admin.from('profiles').select('username,name').eq('id',share.owner_id).maybeSingle(),
            admin.from('questions').select('id').eq('set_id',set.id).eq('owner_id',share.owner_id)
          ]);
          result.push({shareId:share.id,setId:set.id,title:set.title,ownerUsername:owner?.username||'',ownerName:owner?.name||'',questionCount:(questions||[]).length,createdAt:share.created_at});
        }
        return res.status(200).json({sharedSets:result});
      }
      if(mode==='owned'){
        const {data:shares,error}=await admin.from('study_set_shares').select('id,set_id,recipient_id,created_at').eq('owner_id',user.id).order('created_at',{ascending:false});
        if(error)throw error;
        const result=[];
        for(const share of (shares||[])){
          const [{data:set},{data:recipient}]=await Promise.all([
            admin.from('study_sets').select('id,title').eq('id',share.set_id).eq('owner_id',user.id).maybeSingle(),
            admin.from('profiles').select('username,name').eq('id',share.recipient_id).maybeSingle()
          ]);
          if(!set||!recipient)continue;
          result.push({shareId:share.id,setId:set.id,title:set.title,recipientUsername:recipient.username||'',recipientName:recipient.name||'',createdAt:share.created_at});
        }
        return res.status(200).json({ownedShares:result});
      }
      return res.status(400).json({error:'Unsupported sharing request.'});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    const {action}=req.body||{};
    if(action==='share'){
      const setId=String(req.body.setId||'');
      const username=String(req.body.username||'').trim().replace(/^@/,'').toLowerCase();
      if(!setId||!/^[a-z0-9_]{3,24}$/.test(username))return res.status(400).json({error:'Invalid study set or username.'});
      const {data:set,error:setError}=await admin.from('study_sets').select('id,title,owner_id').eq('id',setId).eq('owner_id',user.id).single();
      if(setError||!set)return res.status(404).json({error:'Study set not found.'});
      const {data:recipient,error:recipientError}=await admin.from('profiles').select('id,username,name,status').ilike('username',username).maybeSingle();
      if(recipientError)throw recipientError;
      if(!recipient)return res.status(404).json({error:`No StudyHelper user was found for @${username}.`});
      if(recipient.status!=='active')return res.status(400).json({error:'That account is not active.'});
      if(recipient.id===user.id)return res.status(400).json({error:'You cannot share a study set with yourself.'});
      const {data:existing}=await admin.from('study_set_shares').select('id').eq('set_id',setId).eq('recipient_id',recipient.id).maybeSingle();
      if(existing)return res.status(400).json({error:`This set is already shared with @${recipient.username}.`});
      const {error}=await admin.from('study_set_shares').insert({set_id:setId,owner_id:user.id,recipient_id:recipient.id});
      if(error)throw error;
      return res.status(200).json({ok:true,username:recipient.username,name:recipient.name});
    }
    if(action==='unshare'){
      const shareId=String(req.body.shareId||'');
      const {error}=await admin.from('study_set_shares').delete().eq('id',shareId).eq('owner_id',user.id);
      if(error)throw error;
      return res.status(200).json({ok:true});
    }
    if(action==='copy'){
      const setId=String(req.body.setId||'');
      const {data:share}=await admin.from('study_set_shares').select('set_id,owner_id,recipient_id').eq('set_id',setId).eq('recipient_id',user.id).maybeSingle();
      if(!share)return res.status(404).json({error:'This study set is not shared with your account.'});
      const {data:source}=await admin.from('study_sets').select('id,title,course_id').eq('id',setId).eq('owner_id',share.owner_id).single();
      if(!source)return res.status(404).json({error:'The original study set is no longer available.'});
      const newSetId=`copy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
      const {error:setError}=await admin.from('study_sets').insert({id:newSetId,owner_id:user.id,course_id:'',title:`${source.title} (Copy)`});
      if(setError)throw setError;
      const {data:qs,error:qError}=await admin.from('questions').select('*').eq('set_id',setId).eq('owner_id',share.owner_id).order('created_at',{ascending:true});
      if(qError)throw qError;
      if(qs?.length){
        const rows=qs.map(q=>({id:`copy_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}_${q.id.slice(0,6)}`,owner_id:user.id,set_id:newSetId,question:q.question,answers:q.answers,correct:q.correct,type:q.type,explanation:q.explanation,concept:q.concept,difficulty:q.difficulty}));
        const {error}=await admin.from('questions').insert(rows);if(error)throw error;
      }
      return res.status(200).json({ok:true,setId:newSetId,title:`${source.title} (Copy)`});
    }
    return res.status(400).json({error:'Unknown sharing action.'});
  }catch(error){return res.status(500).json({error:error.message||'Sharing request failed.'})}
};
