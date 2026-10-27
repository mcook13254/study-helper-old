const { createClient } = require('@supabase/supabase-js');
module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const expectedKey=process.env.STUDYHELPER_SETUP_KEY,url=process.env.SUPABASE_URL,serviceKey=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!expectedKey||!url||!serviceKey) return res.status(503).json({error:'First-time setup is not configured on the server.'});
  const {setupKey,name,email,password}=req.body||{};
  const rawUsername=req.body?.username;
  if(!setupKey||setupKey!==expectedKey)return res.status(401).json({error:'Invalid setup key.'});
  if(!name||!rawUsername||!email||!password)return res.status(400).json({error:'Name, username, email, and password are required.'});
  const username=String(rawUsername).trim().replace(/^@/,'').toLowerCase(); if(!/^[a-z0-9_]{3,24}$/.test(username))return res.status(400).json({error:'Username must be 3-24 letters, numbers, or underscores.'}); if(password.length<8)return res.status(400).json({error:'Password must be at least 8 characters.'});
  try{
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:list,error:listError}=await admin.auth.admin.listUsers({page:1,perPage:1});if(listError)throw listError;
    if((list?.users?.length||0)>0)return res.status(409).json({error:'Initial administrator setup has already been completed.'});
    const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name,username:String(username).trim().replace(/^@/,'').toLowerCase()}});if(createError)return res.status(400).json({error:createError.message});
    const {error:profileError}=await admin.from('profiles').upsert({id:created.user.id,name,username:String(username).trim().replace(/^@/,'').toLowerCase(),email,role:'admin',status:'active'});if(profileError){await admin.auth.admin.deleteUser(created.user.id);return res.status(500).json({error:profileError.message})}
    return res.status(200).json({ok:true,user:{id:created.user.id,name,username:String(username).trim().replace(/^@/,'').toLowerCase(),email,role:'admin',status:'active'}});
  }catch(e){return res.status(500).json({error:e.message||'Unexpected error.'})}
};
