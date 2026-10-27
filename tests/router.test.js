const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const endpoints=['config','setup-status','setup-first-admin','admin-create-user','admin-dashboard','admin-manage-user','admin-requests','data-sync','library','set-sharing'];
function router(stub){
  const context={module:{exports:{}},require:stub};
  vm.runInNewContext(fs.readFileSync(path.join(root,'api/router.js'),'utf8'),context);
  return context.module.exports;
}
test('release exposes exactly one Vercel function, with all ten handlers bundled',()=>{
  assert.deepEqual(fs.readdirSync(path.join(root,'api')),['router.js']);
  const loaded=[];router(name=>{loaded.push(name);assert.ok(fs.existsSync(path.join(root,'api',name+'.js')));return ()=>{}});
  assert.equal(loaded.length,10);
});
test('every original endpoint retains method, body, headers and sharing query',async()=>{
  const calls=[];
  const dispatch=router(name=>(req,res)=>{calls.push({name,req,res});return 'handled'});
  for(const endpoint of endpoints){
    for(const method of ['GET','POST','DELETE']){
      const req={method,headers:{authorization:'Bearer token'},body:{sample:true},query:{endpoint,setId:'set-123'}};
      const res={};assert.equal(await dispatch(req,res),'handled');
      assert.equal(calls.at(-1).name,'../server/handlers/'+endpoint);
      assert.equal(calls.at(-1).req,req);assert.equal(calls.at(-1).req.query.setId,'set-123');
    }
  }
});
test('unknown, repeated and prototype endpoints return 404',async()=>{
  const dispatch=router(()=>()=>{throw Error('Must not dispatch')});
  for(const endpoint of [undefined,'','missing','../config','constructor','__proto__',['config','library']]){
    let code;const res={status(n){code=n;return this},json(value){return value}};
    await dispatch({query:{endpoint}},res);assert.equal(code,404);
  }
});
test('deployment rewrite keeps endpoint URLs and exposes only frontend assets',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  function rewrite(url){for(const r of config.routes){const match=new RegExp('^'+r.src+'$').exec(url);if(match)return r.dest.replace(/\$(\d+)/g,(_,i)=>match[Number(i)])}}
  for(const endpoint of endpoints)assert.equal(rewrite('/api/'+endpoint),'/api/router?endpoint='+endpoint);
  for(const asset of ['app.js','adaptive.js','styles.css'])assert.equal(rewrite('/'+asset),'/'+asset);
  assert.equal(rewrite('/server/handlers/config.js'),'/index.html');
  assert.equal(rewrite('/settings'),'/index.html');
});
