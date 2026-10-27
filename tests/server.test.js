const test=require('node:test');const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const path=require('node:path');
test('local server serves the application and adaptive module',async()=>{
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'31789'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(new Error('Server exited '+code)))});
  const index=await fetch('http://localhost:31789');assert.equal(index.status,200);assert.match(await index.text(),/adaptive.js/);
  const adaptive=await fetch('http://localhost:31789/adaptive.js');assert.equal(adaptive.status,200);assert.match(await adaptive.text(),/StudyAdaptive/);
 }finally{child.kill()}
});
