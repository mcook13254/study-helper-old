const test=require('node:test');const assert=require('node:assert/strict');
const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
test('cloud sync preserves review data, uses upserts and leaves omitted adaptive data untouched',async()=>{
 const writes=[];
 const admin={from(table){const chain={select(){return chain},eq(){return chain},in(){return Promise.resolve({data:[{id:'s',course_id:'c'}]})},single(){return Promise.resolve({data:{id:'u',status:'active'}})},upsert(row){writes.push({table,row});return Promise.resolve({})}};return chain}};
 const createClient=(url,key)=>key==='secret'?admin:{auth:{getUser:async()=>({data:{user:{id:'u'}}})}};
 const context={module:{exports:{}},require:()=>({createClient}),process:{env:{SUPABASE_URL:'url',SUPABASE_ANON_KEY:'anon',SUPABASE_SECRET_KEY:'secret'}},Date,console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server/handlers/data-sync.js'),'utf8'),context);
 const adaptive={version:1,questions:{key:{attempts:3,dueAt:1000}},concepts:{key:42}};
 let status=0,body;const res={status(n){status=n;return this},json(v){body=v;return this}};
 await context.module.exports({method:'POST',headers:{authorization:'Bearer token'},body:{courses:[{id:'c'}],sets:[{id:'s',questions:[{id:'q',q:'Preserved',answers:['A','B'],correct:[0,1],type:'multiple'}]}],progress:{xp:99,adaptive}}},res);
 assert.equal(status,200,JSON.stringify(body));assert.deepEqual(writes.find(x=>x.table==='progress').row.adaptive,adaptive);
 assert.equal(writes.find(x=>x.table==='study_sets').row[0].course_id,'c');
 assert.equal(writes.find(x=>x.table==='questions').row[0].id,'q');
 writes.length=0;
 await context.module.exports({method:'POST',headers:{authorization:'Bearer token'},body:{progress:{xp:99}}},res);
 assert.equal(status,200);assert.equal('adaptive' in writes.find(x=>x.table==='progress').row,false);
});

