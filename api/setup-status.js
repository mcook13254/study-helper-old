const { createClient } = require('@supabase/supabase-js');
module.exports = async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const url=process.env.SUPABASE_URL, serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!serviceKey) return res.status(200).json({setupAvailable:false});
  try{const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await admin.auth.admin.listUsers({page:1,perPage:1});if(error)throw error;return res.status(200).json({setupAvailable:(data?.users?.length||0)===0})}catch(e){return res.status(503).json({setupAvailable:false})}
};
