const KEY_PREFIX='studyhelper_v6_';
let authReady=false;
let authMode='cloud';
let authClient=null;
let sessionUser=null;
let setupAvailable=false;
function storageKey(){return KEY_PREFIX+(sessionUser?.id||'signed_out')}

const DB_NAME='studyquest_files';
const DB_STORE='textbooks';
const seed={
  courses:[
    {id:'cs220',name:'Data Structures',code:'CS 220',mastery:74,items:24,weak:'Recursion, graph traversal'},
    {id:'math210',name:'Discrete Mathematics',code:'MATH 210',mastery:61,items:19,weak:'Proof techniques'},
    {id:'psy101',name:'Psychology',code:'PSY 101',mastery:88,items:31,weak:'Memory models'}
  ],
  sets:[
    {id:'set1',courseId:'cs220',title:'Data Structures Essentials',questions:[
      {q:'Which structure uses LIFO order?',answers:['Queue','Stack','Heap','Graph'],correct:1,explain:'A stack is last-in, first-out (LIFO).',concept:'Stacks'},
      {q:'What is the average-case lookup complexity of a well-designed hash table?',answers:['O(1)','O(log n)','O(n)','O(n log n)'],correct:0,explain:'Hashing aims for constant-time average lookup when collisions are controlled.',concept:'Hash Tables'},
      {q:'Which traversal visits a node before its descendants?',answers:['Postorder','Preorder','Inorder','Breadth-first'],correct:1,explain:'Preorder processes the current node before recursively visiting descendants.',concept:'Tree Traversal'},
      {q:'What does Big-O primarily describe?',answers:['Exact runtime','Asymptotic growth','Memory address','Compiler version'],correct:1,explain:'Big-O describes an upper bound on how resource usage grows as input size increases.',concept:'Big-O'}
    ]},
    {id:'set2',courseId:'math210',title:'Induction & Proofs',questions:[
      {q:'What is the first step of a standard proof by induction?',answers:['Inductive hypothesis','Base case','Contradiction','Counterexample'],correct:1,explain:'You establish that the statement is true for the initial value.',concept:'Induction'},
      {q:'In the inductive step, what do you assume?',answers:['The conclusion is false','The statement holds for k','All numbers are prime','Nothing'],correct:1,explain:'The inductive hypothesis assumes the statement holds for an arbitrary k.',concept:'Induction'}
    ]}
  ],
  books:[],
  requests:[],
  progress:{streak:4,xp:1840,mastery:74,questionsAnswered:128,bestStreak:9,concepts:{'Big-O':92,'Stacks':84,'Tree Traversal':76,'Hash Tables':61,'Induction':58}},
  settings:{name:'Mic',avatar:'M',bio:'College student building a stronger study routine',major:'',school:'',userId:'user_mic'},
  users:[{id:'user_mic',name:'Mic',email:'mic@studyhelper.local',role:'admin',status:'active',created:'Local prototype'}],
  sharedSets:[],
  view:'dashboard'
};
let state=load();
const view=document.getElementById('view'), title=document.getElementById('page-title');
function load(){try{const saved=JSON.parse(localStorage.getItem(storageKey())||'{}');return {...structuredClone(seed),...saved,settings:{...structuredClone(seed.settings),...(saved.settings||{})},progress:{...structuredClone(seed.progress),...(saved.progress||{}),concepts:{...structuredClone(seed.progress.concepts),...((saved.progress||{}).concepts||{})}},users:Array.isArray(saved.users)?saved.users:structuredClone(seed.users),view:saved.view||'dashboard'}}catch{return structuredClone(seed)}}
function save(){
  const clean={...state,books:state.books.map(({data,...b})=>b)};
  localStorage.setItem(storageKey(),JSON.stringify(clean));
  if(authMode==='cloud'&&authClient&&sessionUser) queueCloudSync();
}
function localSavedState(){
  try{const raw=localStorage.getItem(storageKey());return raw?JSON.parse(raw):null}catch{return null}
}
function blankUserState(){
  return {courses:[],sets:[],books:[],requests:[],progress:{streak:0,xp:0,mastery:0,questionsAnswered:0,bestStreak:0,concepts:{}},settings:{name:sessionUser?.name||'Student',avatar:initials(sessionUser?.name||'Student'),bio:'',major:'',school:'',email:sessionUser?.email||'',userId:sessionUser?.id||''},users:[],sharedSets:[],view:'dashboard'}
}
let cloudSyncTimer=null;
let cloudSyncInFlight=false;
let cloudSyncPending=false;
function cloudSnapshot(){
  return {
    courses:state.courses,
    sets:state.sets,
    progress:state.progress
  };
}
function queueCloudSync(){
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(()=>syncCloudState(),350);
}
async function syncCloudState(){
  if(authMode!=='cloud'||!authClient||!sessionUser)return;
  if(cloudSyncInFlight){cloudSyncPending=true;return}
  cloudSyncInFlight=true;
  try{
    const session=(await authClient.auth.getSession()).data.session;
    const token=session?.access_token;
    if(!token)return;
    const r=await fetch('/api/data-sync',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(cloudSnapshot())});
    if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||`Cloud sync failed (${r.status}).`)}
  }catch(e){console.warn('StudyHelper cloud sync:',e.message||e)}
  finally{cloudSyncInFlight=false;if(cloudSyncPending){cloudSyncPending=false;queueCloudSync()}}
}
async function loadCloudState(){
  if(authMode!=='cloud'||!authClient||!sessionUser)return false;
  const [coursesRes,setsRes,questionsRes,progressRes]=await Promise.all([
    authClient.from('courses').select('*').order('created_at',{ascending:true}),
    authClient.from('study_sets').select('*').order('created_at',{ascending:true}),
    authClient.from('questions').select('*').order('created_at',{ascending:true}),
    authClient.from('progress').select('*').eq('user_id',sessionUser.id).maybeSingle()
  ]);
  for(const r of [coursesRes,setsRes,questionsRes,progressRes])if(r.error)throw r.error;
  const courses=coursesRes.data||[];
  const sets=(setsRes.data||[]).map(x=>({...x,questions:[]}));
  const bySet=new Map(sets.map(x=>[x.id,x]));
  for(const q of (questionsRes.data||[])){
    const set=bySet.get(q.set_id); if(!set)continue;
    set.questions.push({id:q.id,q:q.question,answers:q.answers||[],correct:q.correct,type:q.type||'single',explain:q.explanation||'',concept:q.concept||'',difficulty:q.difficulty||'medium'});
  }
  const cloudBooks=await loadCloudBooks();
  state={...blankUserState(),courses:courses.map(c=>({id:c.id,name:c.name,code:c.code,mastery:c.mastery||0,items:c.items||0,weak:c.weak||'Build a study set'})),sets,books:cloudBooks,progress:progressRes.data?{streak:progressRes.data.streak||0,xp:progressRes.data.xp||0,mastery:progressRes.data.mastery||0,questionsAnswered:progressRes.data.questions_answered||0,bestStreak:progressRes.data.best_streak||0,concepts:progressRes.data.concepts||{}}:blankUserState().progress,settings:{...blankUserState().settings,name:sessionUser.name,username:sessionUser.username||'',email:sessionUser.email,userId:sessionUser.id,avatar:sessionUser.avatar||initials(sessionUser.name),major:sessionUser.major||'',school:sessionUser.school||'',bio:sessionUser.bio||''},users:state.users,sharedSets:state.sharedSets||[],view:'dashboard'};
  const hasCloudData=courses.length>0||sets.length>0||(questionsRes.data||[]).length>0||Boolean(progressRes.data);
  return hasCloudData;
}
async function migrateLocalDataToCloud(local){
  if(!local||!local.courses&&!local.sets&&!local.progress)return false;
  state={...blankUserState(),...local,books:[],settings:{...blankUserState().settings,...(local.settings||{}),name:sessionUser.name,email:sessionUser.email,userId:sessionUser.id},users:state.users,view:'dashboard'};
  save();
  await syncCloudState();
  return true;
}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function putBookFile(id,blob){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(blob,id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
async function getBookFile(id){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly');const r=tx.objectStore(DB_STORE).get(id);r.onsuccess=()=>{db.close();resolve(r.result||null)};r.onerror=()=>{db.close();reject(r.error)}})}
async function deleteBookFile(id){if(!id)return;try{const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}catch{}}
function uid(prefix='id'){return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function courseById(id){return state.courses.find(c=>c.id===id)}
function setAuthChrome(locked){document.body.classList.toggle('auth-locked',locked)}
function authScreen(){
  const setupBlock=setupAvailable?`<div class="auth-setup-card"><div class="eyebrow">FIRST-TIME SETUP</div><h3>Set up the administrator</h3><p class="muted">This appears only while the Supabase project has no users.</p><button class="secondary" id="setupAdmin">Create first administrator</button></div>`:'';
  return `<div class="auth-screen"><div class="auth-card"><div class="brand"><div class="brand-mark">SH</div><div><div class="brand-name">StudyHelper</div><div class="brand-sub">College study + games</div></div></div><div style="margin-top:26px"><div class="eyebrow">SECURE STUDY SPACE</div><h2>Sign in to StudyHelper</h2><p class="muted">Your courses, textbooks, progress, and profile stay behind your account.</p><div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com"></div><div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="current-password" placeholder="Your password"></div><button class="primary" id="authSubmit" style="width:100%">Sign in</button><div class="auth-secondary"><button class="ghost" id="requestAccessToggle">Request access</button></div><div id="authError"></div>${setupBlock}<div class="auth-note">There is no public account creation. New users must be approved by an administrator.</div></div></div></div>`
}
async function openFirstAdminSetup(){
  showModal(`<div class="eyebrow">FIRST-TIME SETUP</div><h2>Create the first administrator</h2><p class="muted">This can only succeed when the Supabase project has no existing users. The setup key is configured in Vercel and is never stored in the browser.</p><label class="form-label">Setup key</label><input id="setupKey" type="password" autocomplete="off" placeholder="Vercel STUDYHELPER_SETUP_KEY"><label class="form-label">Administrator name</label><input id="setupName" maxlength="60" placeholder="Your name"><label class="form-label">Email</label><input id="setupEmail" type="email" maxlength="160" placeholder="admin@example.com"><label class="form-label">Password</label><input id="setupPassword" type="password" autocomplete="new-password" minlength="8" placeholder="At least 8 characters"><label class="form-label">Confirm password</label><input id="setupPassword2" type="password" autocomplete="new-password" minlength="8" placeholder="Repeat password"><div id="setupError"></div><div class="modal-actions"><button class="ghost" id="cancelSetup">Cancel</button><button class="primary" id="createFirstAdmin">Create administrator</button></div>`);
  document.getElementById('cancelSetup').onclick=closeModal;
  document.getElementById('createFirstAdmin').onclick=async()=>{
    const key=document.getElementById('setupKey').value.trim(),name=document.getElementById('setupName').value.trim(),email=document.getElementById('setupEmail').value.trim(),password=document.getElementById('setupPassword').value,password2=document.getElementById('setupPassword2').value,err=document.getElementById('setupError');
    err.innerHTML='';
    if(!key||!name||!email||!password){err.innerHTML='<div class="auth-error">All fields are required.</div>';return}
    if(password.length<8){err.innerHTML='<div class="auth-error">Password must be at least 8 characters.</div>';return}
    if(password!==password2){err.innerHTML='<div class="auth-error">Passwords do not match.</div>';return}
    try{
      const r=await fetch('/api/setup-first-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({setupKey:key,name,email,password})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||'Could not create the administrator.');
      closeModal(); setupAvailable=false; renderAuthOnly(); showModal(`<div class="score">✓</div><h2>Administrator created</h2><p class="muted">Your administrator account is ready. Sign in with the email and password you just created.</p><button class="primary" id="setupDone">Back to sign in</button>`); document.getElementById('setupDone').onclick=closeModal;
    }catch(e){err.innerHTML='<div class="auth-error">'+esc(e.message||'Could not create the administrator.')+'</div>'}
  };
}
function bindAuth(){
  const requestBtn=document.getElementById('requestAccessToggle'); if(requestBtn)requestBtn.onclick=()=>showAccessRequest();
  const setup=document.getElementById('setupAdmin'); if(setup)setup.onclick=openFirstAdminSetup;
  const submit=document.getElementById('authSubmit'); if(submit)submit.onclick=async()=>{const email=document.getElementById('authEmail').value.trim(),password=document.getElementById('authPassword').value,err=document.getElementById('authError');err.innerHTML='';if(!email||!password){err.innerHTML='<div class="auth-error">Please enter your email and password.</div>';return}try{if(!authClient)throw new Error('Cloud authentication is not configured. Please contact the StudyHelper administrator.');const {data,error}=await authClient.auth.signInWithPassword({email,password});if(error)throw error;await finishCloudSession(data.session)}catch(e){err.innerHTML='<div class="auth-error">'+esc(e.message||'Unable to sign in.')+'</div>'}};
}
function renderAuthOnly(message=''){authReady=false;sessionUser=null;state=structuredClone(seed);setAuthChrome(true);if(title)title.textContent='Sign in';if(view){view.innerHTML=authScreen();if(message){const e=document.getElementById('authError');if(e)e.innerHTML='<div class="auth-error">'+esc(message)+'</div>'}}closeModal();bindAuth()}
async function refreshSetupAvailability(){setupAvailable=false;try{const r=await fetch('/api/setup-status',{cache:'no-store'});if(r.ok){const d=await r.json();setupAvailable=Boolean(d.setupAvailable)}}catch{}return setupAvailable}

function showAccessRequest(){showModal(`<div class="eyebrow">REQUEST ACCESS</div><h2>Ask to join StudyHelper</h2><p class="muted">An administrator must approve your request before an account can be created. You do not set a password here.</p><label class="form-label">Name</label><input id="requestName" maxlength="60" placeholder="Your name"><label class="form-label">Email</label><input id="requestEmail" type="email" maxlength="160" placeholder="you@example.com"><label class="form-label">Major / program <span class="muted">(optional)</span></label><input id="requestMajor" maxlength="100" placeholder="e.g. Computer Science"><label class="form-label">Why are you requesting access? <span class="muted">(optional)</span></label><textarea id="requestMessage" rows="4" maxlength="500" placeholder="Class, study group, or reason for using StudyHelper"></textarea><div id="requestError"></div><div class="modal-actions"><button class="ghost" id="cancelRequest">Cancel</button><button class="primary" id="sendRequest">Submit request</button></div>`);document.getElementById('cancelRequest').onclick=closeModal;document.getElementById('sendRequest').onclick=submitAccessRequest}
async function submitAccessRequest(){const name=document.getElementById('requestName').value.trim(),email=document.getElementById('requestEmail').value.trim(),major=document.getElementById('requestMajor').value.trim(),message=document.getElementById('requestMessage').value.trim(),err=document.getElementById('requestError');err.innerHTML='';if(!name||!email){err.innerHTML='<div class="auth-error">Name and email are required.</div>';return}if(authMode!=='cloud'||!authClient){err.innerHTML='<div class="auth-error">Cloud authentication is unavailable right now.</div>';return}try{const {error}=await authClient.from('access_requests').insert({name,email,major,message,status:'pending'});if(error){if(error.code==='23505')throw new Error('There is already a pending request for that email.');throw error}closeModal();showModal(`<div class="score">✓</div><h2>Request submitted</h2><p class="muted">An administrator will review your request. Once approved, you will be able to sign in.</p><button class="primary" id="requestDone">Back to sign in</button>`);document.getElementById('requestDone').onclick=closeModal}catch(e){err.innerHTML='<div class="auth-error">'+esc(e.message||'Could not submit request.')+'</div>'}}
async function finishCloudSession(session){
  sessionUser={id:session.user.id,name:session.user.user_metadata?.name||session.user.email?.split('@')[0]||'Student',email:session.user.email||'',role:'student',status:'active'};
  const {data:profile}=await authClient.from('profiles').select('*').eq('id',session.user.id).single();
  if(profile)sessionUser={...sessionUser,...profile};
  if(sessionUser.status==='disabled'){await authClient.auth.signOut();throw new Error('This StudyHelper account is disabled.');}
  const existingLocal=localSavedState();
  const hasCloud=await loadCloudState();
  if(!hasCloud&&existingLocal&&((existingLocal.courses||[]).length||(existingLocal.sets||[]).length||(existingLocal.progress?.questionsAnswered||0)>0)){
    showModal(`<div class="eyebrow">MOVE YOUR STUDY DATA</div><h2>Bring your existing StudyHelper data with you?</h2><p class="muted">Your browser has study data from the prototype, but your cloud account does not have any yet. We can copy your courses, study sets, questions, and progress into your Supabase account. Textbook PDF files are not copied in this migration.</p><div class="modal-actions"><button class="ghost" id="keepCloudEmpty">Start fresh</button><button class="primary" id="migrateLocal">Move my data</button></div>`);
    document.getElementById('keepCloudEmpty').onclick=()=>{closeModal();finishCloudUi()};
    document.getElementById('migrateLocal').onclick=async()=>{const b=document.getElementById('migrateLocal');b.disabled=true;b.textContent='Moving data...';try{await migrateLocalDataToCloud(existingLocal);closeModal();finishCloudUi()}catch(e){b.disabled=false;b.textContent='Move my data';alert(e.message||'Could not migrate your data.')}};
    return;
  }
  finishCloudUi();
}
function finishCloudUi(){
  state.settings={...state.settings,name:sessionUser.name,email:sessionUser.email,userId:sessionUser.id};
  if(sessionUser.role==='admin'){
    authClient.from('profiles').select('id,name,email,role,status,created_at').order('created_at',{ascending:true}).then(({data})=>{if(data){state.users=data.map(u=>({...u,created:u.created_at||''}));save();render()}});
  }else{
    state.users=[{id:sessionUser.id,name:sessionUser.name,email:sessionUser.email,role:sessionUser.role,status:sessionUser.status,created:sessionUser.created_at||''}];
  }
  authReady=true;setAuthChrome(false);bindIdleActivity();armIdleTimeout();render();
}

async function bootAuth(){
  setAuthChrome(true);
  await refreshSetupAvailability();
  try{const res=await fetch('/api/config',{cache:'no-store'});if(!res.ok)throw new Error('Cloud authentication service returned HTTP '+res.status+'.');const cfg=await res.json();if(cfg.configured&&window.supabase){authMode='cloud';authClient=window.supabase.createClient(cfg.url,cfg.publishableKey||cfg.anonKey);const {data}=await authClient.auth.getSession();if(data.session){await finishCloudSession(data.session);return}renderAuthOnly();return}}catch(e){renderAuthOnly();const err=document.getElementById('authError');if(err)err.innerHTML='<div class="auth-error">'+esc(e.message||'Cloud authentication is not configured.')+'</div>';return}
  renderAuthOnly();
}
const IDLE_TIMEOUT_MS=15*60*1000;
let idleTimer=null;
let idleWarningTimer=null;
let idleEventsBound=false;
function clearIdleTimers(){
  if(idleTimer){clearTimeout(idleTimer);idleTimer=null;}
  if(idleWarningTimer){clearTimeout(idleWarningTimer);idleWarningTimer=null;}
}
function armIdleTimeout(){
  clearIdleTimers();
  if(authMode!=='cloud'||!authReady||!sessionUser)return;
  idleTimer=setTimeout(async()=>{
    idleTimer=null;
    if(authMode==='cloud'&&authClient&&sessionUser){
      try{await authClient.auth.signOut()}catch{}
    }
    try{sessionStorage.clear()}catch{}
    sessionUser=null;
    authReady=false;
    closeModal();
    renderAuthOnly('Your session ended after 15 minutes of inactivity. Please sign in again.');
  },IDLE_TIMEOUT_MS);
}
function noteActivity(){
  if(!authReady||!sessionUser)return;
  armIdleTimeout();
}
function bindIdleActivity(){
  if(idleEventsBound)return;
  idleEventsBound=true;
  ['click','keydown','mousemove','mousedown','touchstart','scroll'].forEach(evt=>window.addEventListener(evt,noteActivity,{passive:true}));
}
async function logout(){
  clearIdleTimers();
  try{if(authMode==='cloud'&&authClient)await authClient.auth.signOut()}catch{}
  try{sessionStorage.clear()}catch{}
  sessionUser=null;authReady=false;closeModal();renderAuthOnly();
}
function render(){if(!authReady){renderAuthOnly();return}setAuthChrome(false);const pages={dashboard:dashboard,courses:coursesView,library:libraryView,textbooks:textbooksView,games:gamesView,practice:practiceView,progress:progressView,profile:profileView,settings:settingsView,admin:adminView};title.textContent=state.view[0].toUpperCase()+state.view.slice(1);view.innerHTML=(pages[state.view]||dashboard)();bind();updateNav()}
function updateNav(){document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===state.view))}
function dashboard(){const p=state.progress;return `<div class="content"><div class="hero"><div><div class="eyebrow" style="color:#b9b4ff">WELCOME BACK</div><h2>Turn class material into a game you can master.</h2><p>StudyHelper connects your courses, textbooks, practice sessions, and games so your weakest concepts rise to the top.</p></div><div class="hero-actions"><button class="primary" data-action="practice">Start practice</button><button class="ghost" data-action="game">Play a game</button></div></div><div class="grid grid-4 stats"><div class="stat"><div class="label">Current streak</div><div class="value">${p.streak} days</div></div><div class="stat"><div class="label">XP earned</div><div class="value">${p.xp.toLocaleString()}</div></div><div class="stat"><div class="label">Overall mastery</div><div class="value">${p.mastery}%</div></div><div class="stat"><div class="label">Questions answered</div><div class="value">${p.questionsAnswered}</div></div></div><div class="section"><div class="section-head"><h3>Your courses</h3><button class="secondary" data-action="courses">View all</button></div><div class="grid grid-3">${state.courses.map(courseCard).join('')}</div></div><div class="section"><div class="section-head"><h3>Continue studying</h3><span class="muted">Weak areas first</span></div><div class="grid grid-2">${Object.entries(p.concepts).sort((a,b)=>a[1]-b[1]).slice(0,4).map(([name,val])=>`<div class="card"><div class="row"><strong>${esc(name)}</strong><span class="pill orange">${val}%</span></div><div class="muted">Suggested next: ${val<65?'Review + apply':val<80?'Practice':'Challenge'}</div><div class="progress"><span style="width:${val}%"></span></div><button class="secondary" data-concept="${esc(name)}">Practice concept</button></div>`).join('')}</div></div></div>`}
function courseCard(c){return `<div class="card course-card"><div class="row"><div class="course-icon">${esc(c.code.slice(0,2))}</div><span class="pill">${c.mastery}% mastery</span></div><div><strong>${esc(c.name)}</strong><div class="muted">${esc(c.code)} - ${c.items} study items</div></div><div class="progress"><span style="width:${c.mastery}%"></span></div><div class="muted">Needs work: ${esc(c.weak||'Build a study set')}</div><div class="card-actions"><button class="primary" data-course="${c.id}" data-mode="practice">Practice</button><button class="ghost" data-course="${c.id}" data-mode="game">Game</button></div></div>`}
function coursesView(){return `<div class="content"><div class="row"><div><p class="muted">Build a course-specific knowledge base.</p></div><button class="primary" data-action="new-course">+ New course</button></div><div class="grid grid-3" style="margin-top:18px">${state.courses.map(courseCard).join('')}</div><div class="section card"><div class="section-head"><h3>Your study sets</h3><button class="secondary" data-action="new-set">+ New set</button></div>${state.sets.map(s=>`<div class="book-row"><div class="book-icon">Q</div><div class="meta"><strong>${esc(s.title)}</strong><div class="muted">${esc(courseById(s.courseId)?.name||'Unassigned')} - ${s.questions.length} questions</div></div><button class="secondary" data-set="${s.id}">Practice</button><button class="ghost" data-edit-set="${s.id}">Edit</button><button class="ghost" data-share-set="${s.id}">Share</button></div>`).join('')||'<div class="empty-state">No study sets yet.</div>'}</div></div>`}
function libraryView(){return `<div class="content"><div class="hero"><div><div class="eyebrow" style="color:#b9b4ff">LIBRARY</div><h2>All of your study sets in one place.</h2><p>Your own sets, copies from friends, and sets shared directly with you.</p></div><button class="primary" data-action="new-set">+ New set</button></div><div class="section card"><div class="section-head"><h3>My study sets</h3><span class="muted">${state.sets.length} sets</span></div>${state.sets.map(s=>`<div class="book-row"><div class="book-icon">Q</div><div class="meta"><strong>${esc(s.title)}</strong><div class="muted">${esc(courseById(s.courseId)?.name||'Unassigned')} · ${s.questions.length} questions</div></div><button class="secondary" data-set="${s.id}">Practice</button><button class="ghost" data-edit-set="${s.id}">Edit</button><button class="ghost" data-share-set="${s.id}">Share</button></div>`).join('')||'<div class="empty-state">You have not created a study set yet.</div>'}</div><div class="section card"><div class="section-head"><h3>Shared with me</h3><span class="muted">${state.sharedSets.length} available</span></div>${state.sharedSets.length?state.sharedSets.map(s=>`<div class="book-row"><div class="book-icon">SH</div><div class="meta"><strong>${esc(s.title)}</strong><div class="muted">From @${esc(s.ownerUsername||'user')} · ${s.questionCount||0} questions</div></div><button class="secondary" data-copy-share="${esc(s.shareId)}">Add to my Library</button></div>`).join(''):'<div class="empty-state"><strong>No shared sets yet</strong><p class="muted">When a friend shares a set with you, it will appear here.</p></div>'}</div></div>`}
function textbooksView(){const cloud=authMode==='cloud'&&authClient&&sessionUser;return `<div class="content"><div class="hero" style="background:linear-gradient(135deg,#1c2435,#25364d)"><div><div class="eyebrow" style="color:#b7cadf">TEXTBOOK LIBRARY</div><h2>Keep your books next to your study games.</h2><p>${cloud?'Your PDFs are stored privately in your StudyHelper cloud library and follow your account across devices.':'Sign in to store PDFs in your private StudyHelper cloud library.'}</p></div><div class="hero-actions"><button class="primary" data-action="upload">Upload textbook</button></div></div><div class="section"><div class="dropzone"><strong>Drop a PDF here</strong><div class="muted">or choose a PDF from your computer</div><label for="bookInput">Choose PDF</label><input id="bookInput" type="file" accept="application/pdf,.pdf" /></div><div class="book-list">${state.books.length?state.books.map((b,i)=>`<div class="book-row"><div class="book-icon">PDF</div><div class="meta"><strong>${esc(b.name)}</strong><div class="muted">${esc(b.size||'')} - ${esc(b.when||'')} ${b.cloud?'· Cloud':''}</div></div><button class="secondary" data-book="${i}">Open</button><button class="ghost" data-remove-book="${i}">Remove</button></div>`).join(''):`<div class="empty card"><strong>No textbooks yet</strong><div class="muted">Upload a PDF to build your library.</div></div>`}</div></div><div class="section"><div class="notice"><strong>Storage:</strong> ${cloud?'Cloud textbooks use a private Supabase Storage bucket with account-level access controls.':'Textbooks are stored privately in your StudyHelper cloud library.'}</div></div></div>`}
function gamesView(){const modes=[
  {id:'Quest Rush',icon:'⚡',tag:'SPEED',title:'Quest Rush',desc:'60-second solo sprint. Build a streak to multiply your XP.',rules:['60-second timer','3 points for each correct answer','Streak bonus every 3 answers'],action:'Start sprint'},
  {id:'Campus Clash',icon:'🏫',tag:'VERSUS',title:'Campus Clash',desc:'Turn your study set into a competitive room with simulated rivals now and real multiplayer later.',rules:['8-round match','Score changes each round','Comeback bonus for answering late'],action:'Enter arena'},
  {id:'Boss Battle',icon:'👾',tag:'BOSS',title:'Boss Battle',desc:'Hard application questions where every mistake costs a life.',rules:['3 lives','Application-focused prompts','Beat the boss before time runs out'],action:'Fight boss'}
];return `<div class="content"><div class="card game-banner"><div class="row"><div><div class="eyebrow">GAME AREA</div><h2 style="margin:5px 0">Choose your challenge</h2><div class="muted">Different rules, different skills. Pick the way you want to learn.</div></div><button class="primary" data-action="host">Host Campus Clash</button></div></div><div class="grid grid-3" style="margin-top:18px">${modes.map(g=>`<div class="card game-card"><div class="game-icon game-icon-large">${g.icon}</div><div class="row"><strong>${g.title}</strong><span class="pill">${g.tag}</span></div><div class="muted">${g.desc}</div><div class="game-rules">${g.rules.map(r=>`<div>• ${r}</div>`).join('')}</div><div class="card-actions"><button class="primary" data-game-mode="${g.id}">${g.action}</button><button class="ghost" data-action="course-pick">Choose content</button></div></div>`).join('')}</div><div class="section grid grid-2"><div class="card"><div class="eyebrow">JOIN A FRIEND</div><h3>Enter a game code</h3><div style="display:flex;gap:8px;margin-top:12px"><input id="joinCode" maxlength="6" placeholder="e.g. 482731" style="flex:1;padding:12px;border:1px solid var(--line);border-radius:12px"/><button class="primary" id="joinBtn">Join game</button></div><div class="muted" style="margin-top:10px">Cloud multiplayer will plug into this same room flow later.</div></div><div class="card"><div class="eyebrow">HOW TO WIN</div><h3>Play to learn</h3><p class="muted">Games reward recall, accuracy, speed, and application rather than button mashing. Your results update the same mastery system used by Practice.</p></div></div></div>`}

function practiceView(){const weak=Object.entries(state.progress.concepts).sort((a,b)=>a[1]-b[1]).slice(0,5);return `<div class="content"><div class="hero"><div><div class="eyebrow" style="color:#b9b4ff">FOCUS SESSION</div><h2>Practice weak areas first.</h2><p>Questions are selected from your saved study sets, with lower-mastery concepts prioritized.</p></div><div class="hero-actions"><button class="primary" data-action="quiz">Start 5-question round</button><button class="ghost" data-action="new-set">Build questions</button></div></div><div class="section"><div class="grid grid-3">${[['Recall','Definitions and core facts'],['Apply','Use concepts in new scenarios'],['Explain','Show why an answer is correct']].map(x=>`<div class="card"><strong>${x[0]}</strong><div class="muted">${x[1]}</div></div>`).join('')}</div></div><div class="section card"><div class="section-head"><h3>Current weak concepts</h3><span class="muted">${weak.length} prioritized</span></div>${weak.map(([n,v])=>`<div class="book-row"><div class="meta"><strong>${esc(n)}</strong><div class="progress"><span style="width:${v}%"></span></div></div><span class="pill orange">${v}%</span></div>`).join('')}</div></div>`}
function progressView(){const p=state.progress;return `<div class="content"><div class="grid grid-3"><div class="stat"><div class="label">Overall mastery</div><div class="value">${p.mastery}%</div></div><div class="stat"><div class="label">This week</div><div class="value">+11%</div></div><div class="stat"><div class="label">Best streak</div><div class="value">${p.bestStreak} days</div></div></div><div class="section card"><div class="section-head"><h3>Concept mastery</h3><span class="muted">Updated after every session</span></div><table class="table"><thead><tr><th>Concept</th><th>Mastery</th><th>Next action</th></tr></thead><tbody>${Object.entries(p.concepts).sort((a,b)=>a[1]-b[1]).map(([name,val])=>`<tr><td><strong>${esc(name)}</strong></td><td>${val}%</td><td><button class="secondary" data-concept="${esc(name)}">Practice</button></td></tr>`).join('')}</tbody></table></div></div>`}

async function loadSharedSets(){
  if(authMode!=='cloud'||!authClient||!sessionUser)return [];
  const token=(await authClient.auth.getSession()).data.session?.access_token;
  if(!token)return [];
  const r=await fetch('/api/sharing?mode=library',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||`Could not load shared study sets (${r.status}).`);
  return Array.isArray(d.sharedSets)?d.sharedSets:[];
}
async function loadOwnedShares(){
  if(authMode!=='cloud'||!authClient||!sessionUser)return [];
  const token=(await authClient.auth.getSession()).data.session?.access_token; if(!token)return [];
  const r=await fetch('/api/sharing?mode=owned',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||`Could not load shared users (${r.status}).`);
  return Array.isArray(d.ownedShares)?d.ownedShares:[];
}
async function shareStudySet(setId){
  if(authMode!=='cloud'){showModal('<h2>Cloud account required</h2><p class="muted">Username sharing is available after signing in to your cloud StudyHelper account.</p>');return}
  const set=state.sets.find(s=>s.id===setId);if(!set)return;
  showModal(`<div class="eyebrow">SHARE STUDY SET</div><h2>${esc(set.title)}</h2><p class="muted">Enter your friend's StudyHelper username. Their email address is never needed for sharing.</p><label class="form-label">Friend username</label><input id="shareUsername" maxlength="24" placeholder="e.g. alex_123"><div class="hint">Use the username shown on your friend's profile.</div><div id="shareResults" style="margin-top:12px"><div class="muted">Loading current shares...</div></div><div id="shareError"></div><div class="modal-actions"><button class="ghost" id="cancelShare">Cancel</button><button class="primary" id="confirmShare">Share set</button></div>`);
  document.getElementById('cancelShare').onclick=closeModal;
  loadOwnedShares().then(items=>{
    const mine=items.filter(x=>x.setId===setId);
    const results=document.getElementById('shareResults');
    if(!results)return;
    if(!mine.length){
      results.innerHTML='<div class="muted">Not shared with anyone yet.</div>';
      return;
    }
    results.innerHTML='<div class="eyebrow">CURRENT ACCESS</div>' + mine.map(x=>{
      return '<div class="book-row"><div class="meta"><strong>@'+esc(x.recipientUsername)+'</strong><div class="muted">'+esc(x.recipientName||'')+'</div></div><button class="ghost" data-unshare-id="'+esc(x.shareId)+'">Remove</button></div>';
    }).join('');
    results.querySelectorAll('[data-unshare-id]').forEach(b=>b.onclick=async()=>{
      try{await unshareStudySet(b.dataset.unshareId);closeModal();await shareStudySet(setId)}catch(e){alert(e.message||'Could not remove sharing.');}
    });
  }).catch(()=>{const results=document.getElementById('shareResults');if(results)results.innerHTML='<div class="muted">No current shares loaded.</div>';});

  document.getElementById('confirmShare').onclick=async()=>{
    const username=document.getElementById('shareUsername').value.trim().replace(/^@/,'').toLowerCase(),err=document.getElementById('shareError'),btn=document.getElementById('confirmShare');err.innerHTML='';
    if(!/^[a-z0-9_]{3,24}$/.test(username)){err.innerHTML='<div class="auth-error">Enter a valid StudyHelper username.</div>';return}
    btn.disabled=true;btn.textContent='Sharing...';
    try{const token=(await authClient.auth.getSession()).data.session?.access_token;const r=await fetch('/api/sharing',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action:'share',setId,username})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not share this study set.');closeModal();showModal(`<div class="score">✓</div><h2>Study set shared</h2><p class="muted"><strong>${esc(set.title)}</strong> is now available to @${esc(d.username||username)}.</p><button class="primary" id="shareDone">Done</button>`);document.getElementById('shareDone').onclick=closeModal;}
    catch(e){err.innerHTML='<div class="auth-error">'+esc(e.message||'Could not share this study set.')+'</div>';btn.disabled=false;btn.textContent='Share set'}
  };
}
async function unshareStudySet(shareId){
  if(!confirm('Remove this person\'s access to the study set?'))return;
  try{const token=(await authClient.auth.getSession()).data.session?.access_token;const r=await fetch('/api/sharing',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action:'unshare',shareId})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not remove access.');state.sharedSets=await loadSharedSets();render();}
  catch(e){alert(e.message||'Could not remove access.')}
}
async function addSharedToLibrary(share){
  try{const token=(await authClient.auth.getSession()).data.session?.access_token;const r=await fetch('/api/sharing',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action:'copy',setId:share.setId})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not copy this study set.');await loadCloudState();state.sharedSets=await loadSharedSets();render();showModal(`<h2>Added to your Library</h2><p class="muted">A private copy of <strong>${esc(share.title)}</strong> is now yours to edit.</p><button class="primary" id="copyDone">Done</button>`);document.getElementById('copyDone').onclick=closeModal;}
  catch(e){alert(e.message||'Could not copy this study set.')}
}
function currentUser(){return sessionUser||state.users.find(u=>u.id===state.settings.userId)||state.users[0]||{id:'local',name:state.settings.name,email:'',role:'student',status:'active'}}
function isAdmin(){return currentUser().role==='admin'&&currentUser().status!=='disabled'}
function settingsView(){return `<div class="content"><div class="hero"><div><div class="eyebrow" style="color:#b9b4ff">SETTINGS & DATA</div><h2>Control your StudyHelper data.</h2><p>Manage your progress, backups, account, and privacy.</p></div><button class="primary" data-action="export-data">Export backup</button></div><div class="section grid grid-2"><div class="card"><div class="eyebrow">SAFE RESET</div><h3>Reset study progress</h3><p class="muted">Keeps your courses, study sets, textbooks, and profile. Clears XP, streaks, question counts, and concept mastery.</p><button class="secondary" data-action="reset-progress">Reset progress</button></div><div class="card"><div class="eyebrow">BACKUP</div><h3>Restore a backup</h3><p class="muted">Import a StudyHelper JSON backup created on this device.</p><label for="backupInput" class="secondary" style="display:inline-block;cursor:pointer">Choose backup</label><input id="backupInput" type="file" accept="application/json,.json" style="display:none"></div><div class="card"><div class="eyebrow">CLOUD DATA</div><h3>Your data follows your account</h3><p class="muted">Courses, study sets, questions, progress, and cloud textbooks are tied to your signed-in account. Private textbooks use Supabase Storage with row-level security.</p></div><div class="card"><div class="eyebrow">DANGER ZONE</div><h3>Delete study data</h3><p class="muted">Deletes courses, study sets, progress, and profile data. Cloud textbook files are removed from cloud storage separately.</p><button class="ghost" data-action="delete-data" style="color:#b42318">Delete all study data</button></div><div class="card"><div class="eyebrow">ACCOUNT</div><h3>Current account</h3><p class="muted"><strong>${esc(currentUser().name)}</strong><br>${esc(currentUser().email||'Local account')} · ${esc(currentUser().role)}</p><button class="secondary" data-action="edit-profile">Edit profile</button></div></div><div class="section"><div class="notice"><strong>Privacy:</strong> textbook PDFs are stored in a private cloud bucket when cloud mode is enabled. They are not public URLs.</div></div></div>`}
function adminView(){if(!isAdmin())return `<div class="content"><div class="card"><h2>Admin access required</h2><p class="muted">Your current account does not have administrator access.</p></div></div>`;const active=state.users.filter(u=>u.status!=='disabled').length;const pending=(state.requests||[]).filter(r=>r.status==='pending');return `<div class="content"><div class="hero"><div><div class="eyebrow" style="color:#ffcf8a">ADMIN CONSOLE</div><h2>Manage StudyHelper accounts.</h2><p>Only administrators can create accounts, approve requests, change roles, disable access, or delete users.</p></div><button class="primary" data-action="new-user">+ Add account</button></div><div class="grid grid-4 stats"><div class="stat"><div class="label">Accounts</div><div class="value">${state.users.length}</div></div><div class="stat"><div class="label">Active</div><div class="value">${active}</div></div><div class="stat"><div class="label">Pending requests</div><div class="value">${pending.length}</div></div><div class="stat"><div class="label">Study sets</div><div class="value">${state.sets.length}</div></div></div><div class="section card"><div class="section-head"><h3>Access requests</h3><button class="secondary" data-action="refresh-requests">Refresh</button></div>${pending.length?`<div class="book-list">${pending.map(r=>`<div class="book-row"><div class="avatar">${esc(initials(r.name).slice(0,3))}</div><div class="meta"><strong>${esc(r.name)}</strong><div class="muted">${esc(r.email)}${r.major?' · '+esc(r.major):''}</div><div class="muted" style="margin-top:4px">${esc(r.message||'No message')} · ${new Date(r.created_at||r.created).toLocaleString()}</div></div><button class="secondary" data-request-approve="${r.id}">Approve</button><button class="ghost" data-request-deny="${r.id}" style="color:#b42318">Deny</button></div>`).join('')}</div>`:'<div class="empty-state"><strong>No pending requests</strong><p class="muted">New requests will appear here for review.</p></div>'}</div><div class="section card"><div class="section-head"><h3>Accounts</h3><span class="muted">Admin-controlled</span></div><div class="book-list">${state.users.map(u=>`<div class="book-row"><div class="avatar">${esc(initials(u.name).slice(0,3))}</div><div class="meta"><strong>${esc(u.name)}</strong><div class="muted">${esc(u.email||'No email')} · ${esc(u.role)} · ${esc(u.status)}</div></div>${u.id!==state.settings.userId?`<button class="secondary" data-user-role="${u.id}">${u.role==='admin'?'Make student':'Make admin'}</button><button class="ghost" data-user-status="${u.id}">${u.status==='disabled'?'Enable':'Disable'}</button><button class="ghost" data-user-delete="${u.id}" style="color:#b42318">Delete</button>`:`<span class="pill">Current account</span>`}</div>`).join('')}</div></div><div class="section grid grid-2"><div class="card"><div class="eyebrow">CONTENT TOTALS</div><div class="grid grid-2" style="margin-top:14px"><div><div class="label">Courses</div><strong>${state.courses.length}</strong></div><div><div class="label">Questions</div><strong>${getQuestions().length}</strong></div><div><div class="label">Textbooks</div><strong>${state.books.length}</strong></div><div><div class="label">XP</div><strong>${state.progress.xp.toLocaleString()}</strong></div></div></div><div class="card"><div class="eyebrow">ADMIN SAFETY</div><p class="muted">Cloud mode uses server-authorized administrator checks. The Supabase service-role key never reaches the browser.</p></div></div></div>`}
async function showNewUser(){if(!isAdmin())return;showModal(`<div class="eyebrow">NEW ACCOUNT</div><h2>Add a StudyHelper account</h2><label class="form-label">Display name</label><input id="userName" maxlength="40" placeholder="Student name"><label class="form-label">Email</label><input id="userEmail" maxlength="120" placeholder="student@example.com" type="email"><label class="form-label">Temporary password</label><input id="userPassword" minlength="8" type="password" placeholder="At least 8 characters"><label class="form-label">Role</label><select id="userRole"><option value="student">Student</option><option value="admin">Administrator</option></select><div class="notice" style="margin-top:12px"><strong>Secure cloud account</strong><br>The password is sent only to the protected Vercel server function and Supabase Auth.</div><div id="newUserError"></div><div class="modal-actions"><button class="ghost" id="cancelUser">Cancel</button><button class="primary" id="saveUser">Create account</button></div>`);document.getElementById('cancelUser').onclick=closeModal;document.getElementById('saveUser').onclick=async()=>{const name=document.getElementById('userName').value.trim(),email=document.getElementById('userEmail').value.trim(),password=document.getElementById('userPassword').value,role=document.getElementById('userRole').value,err=document.getElementById('newUserError');err.innerHTML='';if(!name||!email||!password){err.innerHTML='<div class="auth-error">Name, email, and password are required.</div>';return}if(password.length<8){err.innerHTML='<div class="auth-error">Password must be at least 8 characters.</div>';return}try{const token=(await authClient.auth.getSession()).data.session?.access_token;if(!token)throw new Error('Your session has expired. Please sign in again.');const r=await fetch('/api/admin-create-user',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({name,email,password,role})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Could not create account.');state.users.push(data.user);save();closeModal();render()}catch(e){err.innerHTML='<div class="auth-error">'+esc(e.message||'Could not create account.')+'</div>'}}}
function getQuestions(setId=null,concept=null){let qs=[];state.sets.forEach(s=>s.questions.forEach(q=>qs.push({...q,setId:s.id,setTitle:s.title})));if(setId)qs=qs.filter(q=>q.setId===setId);if(concept)qs=qs.filter(q=>q.concept.toLowerCase()===concept.toLowerCase());return qs}
function quiz(setId=null,mode='Recall',concept=null,type='multiple'){let qs=getQuestions(setId,concept);if(!qs.length){showModal('<h2>No questions yet</h2><p class="muted">Create a study set and add questions before starting a round.</p><button class="primary" id="goSets">Create study set</button>');document.getElementById('goSets').onclick=()=>{closeModal();showNewSet()};return}qs.sort((a,b)=>(state.progress.concepts[a.concept]||50)-(state.progress.concepts[b.concept]||50));qs=qs.slice(0,6);startGameSession(qs,mode,type)}
function startGameSession(qs,mode,type='multiple'){
  const g={i:0,score:0,streak:0,lives:3,started:Date.now(),timeLeft:mode==='Quest Rush'?60:mode==='Campus Clash'?75:90,round:0,answered:0};
  const finish=(message)=>{state.progress.mastery=Math.round(Object.values(state.progress.concepts).reduce((a,b)=>a+b,0)/Math.max(1,Object.keys(state.progress.concepts).length));save();showModal(`<div class="score">${g.score}</div><h2>${esc(message)}</h2><p class="muted">${g.answered} answered • ${Math.max(0,g.score)} XP earned. Your mastery was updated.</p><button class="primary" id="done">Continue studying</button>`);document.getElementById('done').onclick=()=>{closeModal();state.view='progress';render()}};
  const answer=(selected,q,isMulti=false)=>{const expected=(Array.isArray(q.correct)?q.correct:[Number(q.correct)]).map(Number).sort((a,b)=>a-b),chosen=(isMulti?selected:[selected]).map(Number).sort((a,b)=>a-b);if(isMulti&&!chosen.length){alert('Select at least one answer.');return}const correct=chosen.length===expected.length&&chosen.every((v,i)=>v===expected[i]);g.round++;g.answered++;const key=q.concept||q.setTitle;state.progress.questionsAnswered++;let gained=0;if(correct){g.streak++;gained=mode==='Quest Rush'?(g.streak>=3?50:30):mode==='Campus Clash'?(20+Math.min(30,g.round*2)):(30+g.streak*5);g.score+=gained;state.progress.xp+=gained;state.progress.concepts[key]=Math.min(100,(state.progress.concepts[key]||50)+2)}else{g.streak=0;state.progress.concepts[key]=Math.max(0,(state.progress.concepts[key]||50)-1);if(mode==='Boss Battle')g.lives--}save();const answerText=expected.map(i=>q.answers[i]).filter(Boolean).map(esc).join(', ');showModal(`<div class="score">${correct?`+${gained} XP`:'Keep going'}</div><h2>${correct?'Correct!':'Not quite.'}</h2><p class="muted">Correct answer${expected.length>1?'s':''}: <strong>${answerText}</strong></p><p class="muted">${esc(q.explain||'Review this concept and try it again later.')}</p><button class="primary" id="nextQ">${mode==='Boss Battle'&&g.lives<=0?'End fight':g.i+1<qs.length?'Next':'Finish'}</button>`);document.getElementById('nextQ').onclick=()=>{if(mode==='Boss Battle'&&g.lives<=0)finish('The boss wins this round.');else{g.i++;renderQ()}}};
  const renderQ=()=>{if(g.i>=qs.length){finish(mode==='Quest Rush'?'Sprint complete!':mode==='Boss Battle'?'Boss defeated!':'Match complete!');return}const q=normalizeQuestion(qs[g.i]);const pct=mode==='Boss Battle'?Math.round((g.lives/3)*100):Math.max(8,100-Math.floor((Date.now()-g.started)/1000/g.timeLeft*100));const labels={'Quest Rush':'⚡ Speed sprint','Campus Clash':'🏫 Arena round','Boss Battle':'👾 Boss fight'};let answers=q.answers.map((a,j)=>({text:a,index:j}));if(type==='scramble')answers=answers.sort(()=>Math.random()-.5);const isMulti=q.type==='multiple'||Array.isArray(q.correct)&&q.correct.length>1;showModal(`<div class="game-status"><div><div class="eyebrow">${labels[mode]}</div><strong>${mode==='Boss Battle'?`❤️ ${g.lives} lives`:`Round ${g.i+1} of ${qs.length}`}</strong></div><div class="game-meter"><span style="width:${pct}%"></span></div></div><div class="game-question"><div class="pill">${esc(q.concept||'Concept')} · ${esc(q.difficulty||'medium')}</div><h2>${esc(q.q)}</h2><div class="muted">${isMulti?'Select every correct answer before submitting.':mode==='Quest Rush'?'Answer quickly for bonus points.':mode==='Campus Clash'?'Correct answers increase your lead.':'Choose carefully. A miss costs a life.'}</div></div><div class="answer-grid">${answers.map(a=>isMulti?`<label class="answer multi-answer"><input type="checkbox" data-answer="${a.index}"> <span>${esc(a.text)}</span></label>`:`<button class="answer" data-answer="${a.index}">${esc(a.text)}</button>`).join('')}</div>${isMulti?'<button class="primary submit-multi" id="submitMulti">Submit answer</button>':''}${mode==='Campus Clash'?`<div class="rival-line"><span>Rival A: ${Math.max(8,g.round*7+12)} pts</span><span>Rival B: ${Math.max(5,g.round*5+9)} pts</span></div>`:''}`);if(isMulti)document.getElementById('submitMulti').onclick=()=>{const selected=[...document.querySelectorAll('.multi-answer input:checked')].map(x=>Number(x.dataset.answer));answer(selected,q,true)};else document.querySelectorAll('.answer').forEach(b=>b.onclick=()=>answer(Number(b.dataset.answer),q,false));if(mode==='Quest Rush')setTimeout(()=>{if(!document.getElementById('modal').classList.contains('hidden')&&g.i<qs.length){g.i=qs.length;finish('Time is up!')}},g.timeLeft*1000)};
  renderQ();
}
function profileView(){const p=state.settings;return `<div class="content"><div class="hero"><div><div class="eyebrow" style="color:#b9b4ff">YOUR PROFILE</div><h2>Make StudyHelper feel like your study space.</h2><p>Edit your name, avatar, and optional academic details. Your profile is saved to your account in cloud mode, or locally in demo mode.</p></div><button class="primary" data-action="edit-profile">Edit profile</button></div><div class="section grid grid-2"><div class="card"><div class="row"><div class="avatar avatar-large">${esc(p.avatar||initials(p.name))}</div><div style="flex:1"><h3 style="margin:0">${esc(p.name)}</h3><div class="muted">${esc(p.major||'College student')}</div></div></div><p class="muted" style="margin-top:18px">${esc(p.bio||'Add a short bio from Edit profile.')}</p></div><div class="card"><div class="eyebrow">PROFILE STATS</div><div class="grid grid-2" style="margin-top:14px"><div><div class="label">XP</div><strong>${state.progress.xp.toLocaleString()}</strong></div><div><div class="label">Best streak</div><strong>${state.progress.bestStreak} days</strong></div><div><div class="label">Questions</div><strong>${state.progress.questionsAnswered}</strong></div><div><div class="label">Mastery</div><strong>${state.progress.mastery}%</strong></div></div></div></div></div>`}
function initials(name='User'){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'U'}
function showProfileEditor(){const p=state.settings;showModal(`<div class="eyebrow">PROFILE SETTINGS</div><h2>Edit your profile</h2><label class="form-label">Display name</label><input id="profileName" value="${esc(p.name)}" maxlength="40"><label class="form-label">StudyHelper username</label><input id="profileUsername" maxlength="24" placeholder="e.g. mic_123"><div class="hint">3–24 letters, numbers, or underscores. Friends use this to find you.</div><label class="form-label">Avatar letters</label><input id="profileAvatar" value="${esc(p.avatar||initials(p.name))}" maxlength="3"><div class="hint">Use 1–3 letters, or leave it blank to generate initials from your name.</div><label class="form-label">Major / program <span class="muted">(optional)</span></label><input id="profileMajor" value="${esc(p.major||'')}" maxlength="80" placeholder="e.g. Computer Science"><label class="form-label">School <span class="muted">(optional)</span></label><input id="profileSchool" value="${esc(p.school||'')}" maxlength="100" placeholder="College or university"><label class="form-label">Bio <span class="muted">(optional)</span></label><textarea id="profileBio" rows="4" maxlength="240" placeholder="A short description about your study goals.">${esc(p.bio||'')}</textarea><div class="modal-actions"><button class="ghost" id="cancelProfile">Cancel</button><button class="primary" id="saveProfile">Save changes</button></div>`);document.getElementById('cancelProfile').onclick=closeModal;document.getElementById('profileUsername').value=p.username||'';document.getElementById('saveProfile').onclick=async()=>{const name=document.getElementById('profileName').value.trim()||'Student';const username=document.getElementById('profileUsername').value.trim().replace(/^@/,'').toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(username)){alert('Username must be 3–24 letters, numbers, or underscores.');return}let av=document.getElementById('profileAvatar').value.trim().replace(/[^a-zA-Z0-9]/g,'').slice(0,3).toUpperCase();if(!av)av=initials(name);state.settings={...state.settings,name,username,avatar:av,major:document.getElementById('profileMajor').value.trim(),school:document.getElementById('profileSchool').value.trim(),bio:document.getElementById('profileBio').value.trim()};const me=currentUser();if(me){me.name=name;me.email=me.email||'local@studyhelper';}save();if(authMode==='cloud'&&authClient&&sessionUser){authClient.from('profiles').update({name,username,avatar:av,major:state.settings.major,school:state.settings.school,bio:state.settings.bio,updated_at:new Date().toISOString()}).eq('id',sessionUser.id).then(()=>{})};closeModal();render();}};

function showModal(html){document.getElementById('modalContent').innerHTML=html;document.getElementById('modal').classList.remove('hidden')}
function closeModal(){document.getElementById('modal').classList.add('hidden')}
function showNewCourse(){showModal(`<div class="eyebrow">NEW COURSE</div><h2>Create a course</h2><input id="courseName" placeholder="Course name" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;margin:14px 0 8px"><input id="courseCode" placeholder="Course code (e.g. CS 220)" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:12px"><button class="primary" style="margin-top:12px" id="createCourse">Create course</button>`);document.getElementById('createCourse').onclick=()=>{const n=document.getElementById('courseName').value.trim(),c=document.getElementById('courseCode').value.trim()||'COURSE';if(!n)return;state.courses.push({id:uid('course'),name:n,code:c,mastery:0,items:0,weak:'No study data yet'});save();closeModal();render()}}
function showNewSetChoice(){
  showModal(`<div class="eyebrow">NEW STUDY SET</div><h2>How do you want to add your questions?</h2><p class="muted">Choose the workflow that fits your material. You can always edit an imported set afterward.</p><div class="grid grid-2" style="margin-top:18px"><button class="card import-choice" id="manualSetChoice" style="text-align:left"><div class="eyebrow">MANUAL</div><h3>Create manually</h3><p class="muted">Build questions one at a time with single or multiple correct answers.</p></button><button class="card import-choice" id="importSetChoice" style="text-align:left"><div class="eyebrow">TXT IMPORT</div><h3>Import a .txt file</h3><p class="muted">Bring in a batch of questions and answers, then review them before saving.</p></button></div>`);
  document.getElementById('manualSetChoice').onclick=()=>{closeModal();showNewSet()};
  document.getElementById('importSetChoice').onclick=()=>{closeModal();showImportSet()};
}
function parseTxtStudySet(text){
  const blocks=text.replace(/\r/g,'').split(/\n\s*\n|^---+\s*$/m).map(x=>x.trim()).filter(Boolean);
  const questions=[];
  for(const block of blocks){
    const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);
    let q='',answers=[],correctRaw='',explain='',concept='',difficulty='medium';
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      let m=line.match(/^(?:Q|Question)\s*:\s*(.*)$/i); if(m){q=m[1].trim();continue;}
      m=line.match(/^(?:[A-F]|\d+)[\.:]\s*(.*)$/i); if(m){answers.push(m[1].trim());continue;}
      m=line.match(/^(?:A|Answer|Choice|Option)\s*(?:[A-F]|\d+)?\s*:\s*(.*)$/i); if(m){answers.push(m[1].trim());continue;}
      m=line.match(/^(?:Correct|Correct Answers?)\s*:\s*(.*)$/i); if(m){correctRaw=m[1].trim();continue;}
      m=line.match(/^(?:Explanation|Explain)\s*:\s*(.*)$/i); if(m){explain=m[1].trim();continue;}
      m=line.match(/^(?:Concept|Topic)\s*:\s*(.*)$/i); if(m){concept=m[1].trim();continue;}
      m=line.match(/^Difficulty\s*:\s*(easy|medium|hard)\s*$/i); if(m){difficulty=m[1].toLowerCase();continue;}
      if(!q && answers.length===0){q=line;continue;}
      if(answers.length<6 && !/^\w+\s*:/.test(line)){answers.push(line);}
    }
    if(!q||answers.length<2)continue;
    let correct=[];
    if(correctRaw){
      const tokens=correctRaw.split(/\s*[,;|]\s*/).filter(Boolean);
      correct=tokens.map(t=>{const letter=t.match(/^[A-F]$/i);if(letter)return letter[0].toUpperCase().charCodeAt(0)-65;const n=Number(t);if(Number.isInteger(n))return n>=1?n-1:n;const idx=answers.findIndex(a=>a.toLowerCase()===t.toLowerCase());return idx}).filter(n=>Number.isInteger(n)&&n>=0&&n<answers.length);
    } else correct=[0];
    correct=[...new Set(correct)].sort((a,b)=>a-b);
    if(!correct.length)continue;
    questions.push({q,answers:answers.slice(0,6),correct:correct.length>1?correct:correct[0],type:correct.length>1?'multiple':'single',explain,concept:concept||'Imported',difficulty});
  }
  return questions;
}
function showImportSet(){
  if(!state.courses.length){
    showModal('<h2>Create a course first</h2><p class="muted">TXT imports need a course so the questions know where they belong.</p><button class="primary" id="goCreateCourse">Create course</button>');
    document.getElementById('goCreateCourse').onclick=()=>{closeModal();showNewCourse()};
    return;
  }
  showModal(`<div class="eyebrow">IMPORT QUESTIONS</div><h2>Import a TXT study set</h2><p class="muted">Put one question in each block. The importer understands labels such as <strong>Question:</strong>, <strong>A:</strong>, <strong>Correct:</strong>, <strong>Concept:</strong>, <strong>Difficulty:</strong>, and <strong>Explanation:</strong>.</p><pre class="import-example">Question: What does LIFO mean?\nA: Last in, first out\nA: First in, first out\nA: Random access\nCorrect: A\nConcept: Stacks\nDifficulty: easy\nExplanation: A stack removes the most recently added item.\n\nQuestion: Which are linear data structures?\nA: Stack\nA: Queue\nA: Graph\nCorrect: A,B\nConcept: Data structures</pre><div class="editor-toolbar"><div><label class="form-label">Course</label><select id="importCourse">${state.courses.map(c=>`<option value="${esc(c.id)}">${esc(c.code)} - ${esc(c.name)}</option>`).join('')}</select></div><div><label class="form-label">Set title</label><input id="importTitle" placeholder="e.g. Chapter 5 Review"></div></div><label class="form-label" style="margin-top:14px">TXT file</label><input id="txtFile" type="file" accept="text/plain,.txt"><div id="importPreview" class="import-preview"></div><div id="importError"></div><div class="modal-actions"><button class="ghost" id="cancelImport">Cancel</button><button class="primary" id="saveImported" disabled>Import study set</button></div>`);
  document.getElementById('cancelImport').onclick=closeModal;
  const fileInput=document.getElementById('txtFile');
  const preview=document.getElementById('importPreview');
  const saveBtn=document.getElementById('saveImported');
  let parsed=[];
  fileInput.onchange=async()=>{
    const file=fileInput.files?.[0];
    if(!file){parsed=[];saveBtn.disabled=true;preview.innerHTML='';return;}
    if(!file.name.toLowerCase().endsWith('.txt')){parsed=[];saveBtn.disabled=true;preview.innerHTML='<div class="auth-error">Please choose a .txt file.</div>';return;}
    const text=await file.text();
    parsed=parseTxtStudySet(text);
    saveBtn.disabled=parsed.length===0;
    preview.innerHTML=parsed.length?`<div class="notice"><strong>${parsed.length} questions recognized.</strong> Review the preview, then import the set.</div><div class="import-preview-list">${parsed.slice(0,12).map((q,i)=>`<div class="card"><strong>${i+1}. ${esc(q.q)}</strong><div class="muted">${q.answers.length} choices · ${q.type==='multiple'?'Multiple correct answers':'Single correct answer'} · ${esc(q.concept)}</div></div>`).join('')}${parsed.length>12?`<div class="muted">Showing the first 12 of ${parsed.length} questions.</div>`:''}</div>`:'<div class="auth-error">No valid questions were found. Check the example format above.</div>';
  };
  saveBtn.onclick=()=>{
    const title=document.getElementById('importTitle').value.trim();
    const courseId=document.getElementById('importCourse').value;
    const err=document.getElementById('importError');
    err.innerHTML='';
    if(!title||!courseId){err.innerHTML='<div class="auth-error">Choose a course and set title.</div>';return;}
    if(!parsed.length){err.innerHTML='<div class="auth-error">Choose a valid TXT file with at least one question.</div>';return;}
    const s={id:uid('set'),courseId,title,questions:parsed};
    state.sets.unshift(s);
    const c=courseById(courseId);
    if(c){c.items+=parsed.length;c.weak=parsed[0].concept||'Build a study set';}
    save();closeModal();state.view='courses';render();
  };
}
function normalizeQuestion(q={}) {
  const rawCorrect = Array.isArray(q.correct) ? q.correct : [Number.isInteger(q.correct) ? q.correct : 0];
  const type = q.type || (rawCorrect.length > 1 ? 'multiple' : 'single');
  return {q:q.q||'',answers:[...(q.answers||['','','',''])].slice(0,6),correct:type==='multiple'?rawCorrect.map(Number):Number(rawCorrect[0]||0),type,explain:q.explain||'',concept:q.concept||'',difficulty:q.difficulty||'medium'};
}
function showNewSet(existingId=null){
  const existing=existingId?state.sets.find(s=>s.id===existingId):null;
  const courseOptions=state.courses.map(c=>`<option value="${c.id}" ${existing?.courseId===c.id?'selected':''}>${esc(c.code)} - ${esc(c.name)}</option>`).join('');
  showModal(`<div class="eyebrow">${existing?'EDIT STUDY SET':'NEW STUDY SET'}</div><h2>${existing?'Edit your questions':'Create your study set'}</h2><p class="muted">Build each question without the editor jumping around. Use <strong>Multiple correct answers</strong> when more than one choice should be selected.</p><div class="editor-toolbar"><div><label class="form-label">Course</label><select id="setCourse">${courseOptions}</select></div><div style="flex:1"><label class="form-label">Set title</label><input id="setTitle" value="${esc(existing?.title||'')}" placeholder="e.g. Chapter 4 Review"></div></div><div class="editor-help">Tip: you can add all your questions first, then mark correct answers and add explanations. Your work stays in place while you edit.</div><div id="questionEditor" class="question-editor-list"></div><div class="modal-actions editor-actions"><button class="secondary" id="addQuestion">+ Add question</button><button class="primary" id="saveSet">${existing?'Save changes':'Save study set'}</button></div>${existing?`<button class="ghost danger-button" id="deleteSet">Delete entire study set</button>`:''}`);

  const rows=existing?existing.questions.map(normalizeQuestion):[];
  const editor=document.getElementById('questionEditor');
  const makeRow=(input={})=>normalizeQuestion({...input,answers:Array.isArray(input.answers)&&input.answers.length?input.answers.slice(0,6):['','','','']});

  function choiceMarkup(row,idx){
    const multiple=row.type==='multiple';
    const correct=multiple?(Array.isArray(row.correct)?row.correct:[]):[Number(row.correct)];
    return row.answers.map((a,j)=>`<label class="correct-option"><input type="${multiple?'checkbox':'radio'}" ${multiple?'':'name="correct-'+idx+'"'} class="correct-control" data-index="${j}" ${correct.includes(j)?'checked':''}><span><b>${String.fromCharCode(65+j)}.</b> ${esc(a||'Answer '+(j+1))}</span></label>`).join('');
  }

  function renderCard(row,idx){
    const wrap=document.createElement('article');
    wrap.className='card question-editor-card';
    wrap.dataset.index=idx;
    wrap.innerHTML=`<div class="row question-card-head"><div><strong>Question ${idx+1}</strong><span class="question-state">${row.type==='multiple'?'Multiple answers':'Single answer'}</span></div><div class="question-card-actions"><button type="button" class="ghost duplicate-question">Duplicate</button><button type="button" class="ghost danger-outline remove-question">Remove</button></div></div>
      <label class="form-label">Question</label>
      <textarea class="q-input" rows="3" placeholder="Ask a clear question..."></textarea>
      <label class="form-label">Question type</label>
      <select class="type-input"><option value="single">One correct answer</option><option value="multiple">Multiple correct answers</option></select>
      <div class="hint">For multiple-answer questions, check every choice that should be correct.</div>
      <label class="form-label">Answer choices</label>
      <div class="answer-editor-grid"></div>
      <label class="form-label correct-label">Correct answer</label>
      <div class="correct-answer-list"></div>
      <label class="form-label">Concept / topic</label>
      <input class="concept-input" placeholder="e.g. recursion">
      <label class="form-label">Explanation <span class="muted">(optional)</span></label>
      <textarea class="explain-input" rows="2" placeholder="Explain why the answer is correct."></textarea>
      <div class="editor-two-col"><div><label class="form-label">Difficulty</label><select class="difficulty-input"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div><div class="answer-count-note">4 answer choices · up to 6 supported</div></div>`;

    const q=wrap.querySelector('.q-input'); q.value=row.q||'';
    const type=wrap.querySelector('.type-input'); type.value=row.type||'single';
    const concept=wrap.querySelector('.concept-input'); concept.value=row.concept||'';
    const explain=wrap.querySelector('.explain-input'); explain.value=row.explain||'';
    const diff=wrap.querySelector('.difficulty-input'); diff.value=row.difficulty||'medium';
    const answers=wrap.querySelector('.answer-editor-grid');
    answers.innerHTML=row.answers.map((a,j)=>`<div class="answer-editor-row"><span class="choice-letter">${String.fromCharCode(65+j)}</span><input class="answer-input" data-answer-index="${j}" placeholder="Answer ${j+1}"></div>`).join('');
    answers.querySelectorAll('.answer-input').forEach((el,j)=>el.value=row.answers[j]||'');

    function refreshCorrect(){
      const multi=type.value==='multiple';
      wrap.querySelector('.question-state').textContent=multi?'Multiple answers':'Single answer';
      wrap.querySelector('.correct-label').textContent=multi?'Correct answers':'Correct answer';
      wrap.querySelector('.correct-answer-list').innerHTML=choiceMarkup(row,idx);
      wrap.querySelectorAll('.correct-control').forEach(c=>c.addEventListener('change',()=>{
        const n=Number(c.dataset.index);
        if(multi){
          if(!Array.isArray(row.correct)) row.correct=[];
          if(c.checked&&!row.correct.includes(n)) row.correct.push(n);
          if(!c.checked) row.correct=row.correct.filter(v=>v!==n);
          row.correct.sort((a,b)=>a-b);
        }else row.correct=n;
      }));
    }
    refreshCorrect();

    q.addEventListener('input',()=>row.q=q.value);
    concept.addEventListener('input',()=>row.concept=concept.value);
    explain.addEventListener('input',()=>row.explain=explain.value);
    diff.addEventListener('change',()=>row.difficulty=diff.value);
    type.addEventListener('change',()=>{
      if(type.value==='multiple') row.correct=Array.isArray(row.correct)?row.correct:[Number(row.correct||0)];
      else row.correct=Array.isArray(row.correct)?Number(row.correct[0]||0):Number(row.correct||0);
      row.type=type.value;
      refreshCorrect();
    });
    answers.querySelectorAll('.answer-input').forEach(el=>el.addEventListener('input',()=>{row.answers[Number(el.dataset.answerIndex)]=el.value;refreshCorrect()}));
    wrap.querySelector('.remove-question').onclick=()=>{
      const pos=rows.indexOf(row); if(pos<0)return;
      rows.splice(pos,1); renderAll();
      setTimeout(()=>{const last=document.querySelector('.question-editor-card:last-child'); last?.scrollIntoView({behavior:'smooth',block:'center'})},20);
    };
    wrap.querySelector('.duplicate-question').onclick=()=>{
      const pos=rows.indexOf(row); const clone=makeRow({...row,id:uid('q'),answers:[...row.answers],correct:Array.isArray(row.correct)?[...row.correct]:row.correct});
      rows.splice(pos+1,0,clone); renderAll();
      setTimeout(()=>document.querySelectorAll('.question-editor-card')[pos+1]?.scrollIntoView({behavior:'smooth',block:'center'}),20);
    };
    return wrap;
  }

  function renderAll(){
    editor.innerHTML='';
    if(!rows.length){editor.innerHTML='<div class="empty editor-empty"><strong>No questions yet.</strong><p class="muted">Click <b>+ Add question</b> to start building your set.</p></div>';return;}
    rows.forEach((row,idx)=>editor.appendChild(renderCard(row,idx)));
  }

  document.getElementById('addQuestion').onclick=()=>{
    rows.push(makeRow({type:'single'})); renderAll();
    setTimeout(()=>document.querySelector('.question-editor-card:last-child')?.scrollIntoView({behavior:'smooth',block:'start'}),20);
  };

  document.getElementById('saveSet').onclick=()=>{
    const title=document.getElementById('setTitle').value.trim(),courseId=document.getElementById('setCourse').value;
    if(!title||!courseId||!rows.length){alert('Please add a title, choose a course, and add at least one question.');return}
    for(let i=0;i<rows.length;i++){
      const r=rows[i],answers=r.answers.map(a=>String(a||'').trim()),filled=answers.map((a,j)=>a?j:null).filter(j=>j!==null);
      r.q=String(r.q||'').trim(); r.concept=String(r.concept||'').trim(); r.explain=String(r.explain||'').trim(); r.answers=answers;
      if(!r.q){alert(`Question ${i+1} needs a question.`);return}
      if(filled.length<2){alert(`Question ${i+1} needs at least two answer choices.`);return}
      const correct=Array.isArray(r.correct)?r.correct:[Number(r.correct)];
      if(r.type==='multiple'){
        r.correct=correct.filter(j=>answers[j]);
        if(!r.correct.length){alert(`Question ${i+1} needs at least one correct answer.`);return}
      }else{
        r.correct=Number(r.correct); if(!filled.includes(r.correct)){alert(`Question ${i+1} needs a correct answer.`);return}
      }
      if(!r.concept){alert(`Question ${i+1} needs a concept/topic.`);return}
    }
    if(existing){
      const oldCourse=courseById(existing.courseId),newCourse=courseById(courseId);
      if(oldCourse&&oldCourse.id!==courseId)oldCourse.items=Math.max(0,oldCourse.items-existing.questions.length);
      existing.courseId=courseId; existing.title=title; existing.questions=rows;
      if(newCourse)newCourse.items=state.sets.filter(s=>s.courseId===courseId).reduce((n,s)=>n+(s.id===existing.id?0:s.questions.length),0)+rows.length;
      if(newCourse)newCourse.weak=rows[0]?.concept||'Build a study set';
    }else{
      const s={id:uid('set'),courseId,title,questions:rows}; state.sets.unshift(s);
      const c=courseById(courseId); if(c){c.items+=rows.length;c.weak=rows[0]?.concept||'Build a study set'}
    }
    save(); closeModal(); state.view='courses'; render();
  };

  const del=document.getElementById('deleteSet');
  if(del)del.onclick=()=>{if(confirm('Delete this study set and all of its questions?')){state.sets=state.sets.filter(s=>s.id!==existing.id);const c=courseById(existing.courseId);if(c)c.items=Math.max(0,c.items-existing.questions.length);save();closeModal();render()}};
  renderAll();
}
async function loadCloudBooks(){
  if(authMode!=='cloud'||!authClient||!sessionUser)return [];
  const {data,error}=await authClient.from('textbooks').select('*').order('created_at',{ascending:false});
  if(error)throw error;
  return (data||[]).map(b=>({id:b.id,name:b.name,size:b.size_bytes?((b.size_bytes/1024/1024).toFixed(1)+' MB'):'',when:new Date(b.created_at).toLocaleDateString(),cloud:true,path:b.storage_path,courseId:b.course_id||''}));
}
async function uploadCloudBook(file){
  if(authMode!=='cloud'||!authClient||!sessionUser)throw new Error('Cloud account required.');
  if(file.type!=='application/pdf')throw new Error('Please choose a PDF textbook.');
  if(file.size>100*1024*1024)throw new Error('This upload is larger than the 100 MB StudyHelper cloud limit.');
  const safe=file.name.replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,180)||'textbook.pdf';
  const path=`${sessionUser.id}/${crypto.randomUUID()}-${safe}`;
  const {error:uploadError}=await authClient.storage.from('textbooks').upload(path,file,{contentType:'application/pdf',upsert:false});
  if(uploadError)throw uploadError;
  const row={owner_id:sessionUser.id,name:file.name,storage_path:path,size_bytes:file.size,mime_type:'application/pdf'};
  const {data,error}=await authClient.from('textbooks').insert(row).select('*').single();
  if(error){await authClient.storage.from('textbooks').remove([path]);throw error;}
  return {id:data.id,name:data.name,size:(data.size_bytes/1024/1024).toFixed(1)+' MB',when:new Date(data.created_at).toLocaleDateString(),cloud:true,path:data.storage_path,courseId:data.course_id||''};
}
async function deleteCloudBook(book){if(!book?.cloud||!authClient)return;if(book.path)await authClient.storage.from('textbooks').remove([book.path]);if(book.id)await authClient.from('textbooks').delete().eq('id',book.id);}

async function openTextbook(i){const b=state.books[i];if(!b)return;let url=null;let cleanup=()=>{};if(b.cloud&&authMode==='cloud'&&authClient){const {data,error}=await authClient.storage.from('textbooks').createSignedUrl(b.path,3600);if(error||!data?.signedUrl){showModal(`<h2>${esc(b.name)}</h2><p class="muted">We could not create a private reading link. Please try again.</p>`);return}url=data.signedUrl;cleanup=()=>{};}else{const blob=b.data?dataUrlToBlob(b.data):await getBookFile(b.fileId);if(!blob){showModal(`<h2>${esc(b.name)}</h2><p class="muted">The saved PDF file is unavailable in this browser. Please upload it again.</p>`);return}url=URL.createObjectURL(blob);cleanup=()=>URL.revokeObjectURL(url)}showModal(`<div class="row"><div><div class="eyebrow">TEXTBOOK READER</div><h2 style="margin:5px 0">${esc(b.name)}</h2><div class="muted">${b.cloud?'Private cloud copy':'Local browser copy'}</div></div><button class="secondary" id="bookPractice">Study from questions</button></div><div style="height:65vh;margin-top:12px;border:1px solid var(--line);border-radius:12px;overflow:hidden"><iframe title="Textbook reader" src="${url}" style="width:100%;height:100%;border:0"></iframe></div>`);document.getElementById('bookPractice').onclick=()=>{cleanup();closeModal();state.view='practice';render();quiz()};document.getElementById('closeModal').onclick=()=>{cleanup();closeModal()}}
function dataUrlToBlob(dataUrl){try{const [head,b64]=dataUrl.split(',');const bin=atob(b64);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new Blob([bytes],{type:(head.match(/data:([^;]+)/)||[])[1]||'application/pdf'})}catch{return null}}
async function saveBook(file){if(authMode==='cloud'&&authClient&&sessionUser){try{showModal('<div class="eyebrow">UPLOADING</div><h2>Adding textbook to your cloud library…</h2><p class="muted">The file stays private to your StudyHelper account.</p>');const book=await uploadCloudBook(file);state.books.unshift(book);closeModal();render();showModal(`<h2>Textbook added</h2><p class="muted"><strong>${esc(file.name)}</strong> is now in your private cloud library.</p><button class="primary" id="openNow">Open textbook</button>`);document.getElementById('openNow').onclick=()=>openTextbook(0)}catch(e){showModal(`<h2>Could not upload textbook</h2><p class="muted">${esc(e.message||'The cloud upload failed.')}</p>`)}return}if(file.type!=='application/pdf'){showModal('<h2>PDF only</h2><p class="muted">Please choose a PDF textbook.</p>');return}if(file.size>200*1024*1024){showModal('<h2>File is too large</h2><p class="muted">For local demo mode, please use a PDF smaller than 200 MB.</p>');return}const id=uid('bookfile');try{await putBookFile(id,file);state.books.unshift({id:uid('book'),fileId:id,name:file.name,size:(file.size/1024/1024).toFixed(1)+' MB',when:new Date().toLocaleDateString(),cloud:false});save();render();showModal(`<h2>Textbook added</h2><p class="muted"><strong>${esc(file.name)}</strong> is saved in this browser.</p><button class="primary" id="openNow">Open textbook</button>`);document.getElementById('openNow').onclick=()=>openTextbook(0)}catch{showModal('<h2>Could not save textbook</h2><p class="muted">Your browser did not allow local file storage.</p>')}}
function host(){const code=String(Math.floor(100000+Math.random()*900000));showModal(`<div class="eyebrow">HOST A GAME</div><h2>Campus Clash lobby</h2><p class="muted">Share this code with your classmates.</p><div class="card" style="margin-top:14px;text-align:center"><strong>Room code</strong><div style="font-size:38px;font-weight:800;letter-spacing:.12em;margin:8px 0">${code}</div><div class="muted">Waiting for players...</div></div><button class="primary" style="margin-top:14px" id="startHosted">Start demo round</button>`);document.getElementById('startHosted').onclick=()=>{closeModal();startGameSession(getQuestions(), 'Campus Clash')}}

function resetProgress(){state.progress={streak:0,xp:0,mastery:0,questionsAnswered:0,bestStreak:0,concepts:{}};state.courses=state.courses.map(c=>({...c,mastery:0,weak:'No study data yet'}));save();render()}
async function deleteAllStudyData(){for(const b of state.books){if(b.cloud&&authMode==='cloud')await deleteCloudBook(b);else await deleteBookFile(b.fileId)}state.courses=[];state.sets=[];state.books=[];state.progress={streak:0,xp:0,mastery:0,questionsAnswered:0,bestStreak:0,concepts:{}};state.settings={...structuredClone(seed.settings),name:'Student',avatar:'S',userId:state.settings.userId};save();render()}
function exportBackup(){const backup={format:'StudyHelper Backup',version:1,exportedAt:new Date().toISOString(),state:{...state,view:'dashboard',books:state.books.map(({data,...b})=>b)}};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`studyhelper-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
function importBackup(file){const reader=new FileReader();reader.onload=()=>{try{const raw=JSON.parse(reader.result);const incoming=raw.state||raw;if(!incoming.courses||!incoming.sets||!incoming.progress)throw new Error('Invalid backup');state={...structuredClone(seed),...incoming,settings:{...structuredClone(seed.settings),...(incoming.settings||{})},progress:{...structuredClone(seed.progress),...(incoming.progress||{})},users:Array.isArray(incoming.users)?incoming.users:structuredClone(seed.users),view:'settings'};save();render();showModal('<h2>Backup restored</h2><p class="muted">Your StudyHelper data was restored. Textbook PDFs were not part of the JSON backup, so re-upload them if needed.</p>')}catch{showModal('<h2>Backup could not be imported</h2><p class="muted">That file does not look like a valid StudyHelper JSON backup.</p>')}};reader.readAsText(file)}
function bind(){const logoutBtn=document.getElementById('logoutButton');if(logoutBtn)logoutBtn.onclick=logout;const avatar=document.getElementById('profileAvatarButton');if(avatar){avatar.textContent=(state.settings.avatar||initials(state.settings.name)).slice(0,3).toUpperCase();avatar.onclick=showProfileEditor}document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>{if(!authReady)return;if(b.dataset.view==='admin'&&!isAdmin())return;state.view=b.dataset.view;save();render()});const adminNav=document.querySelector('.nav-item[data-view="admin"]');if(adminNav)adminNav.style.display=isAdmin()?'':'none';document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='practice'){state.view='practice';render()}else if(a==='quiz')quiz();else if(a==='game'){state.view='games';render()}else if(a==='courses'){state.view='courses';render()}else if(a==='upload')document.getElementById('bookInput')?.click();else if(a==='host')host();else if(a==='edit-profile')showProfileEditor();else if(a==='settings'){state.view='settings';render()}else if(a==='admin'){state.view='admin';render()}else if(a==='new-user')showNewUser();else if(a==='export-data')exportBackup();else if(a==='reset-progress'){if(confirm('Reset XP, streaks, question counts, and mastery while keeping your courses and study sets?'))resetProgress()}else if(a==='delete-data'){if(confirm('Delete ALL courses, study sets, progress, and profile data from this browser? This cannot be undone unless you have a backup.'))deleteAllStudyData()}else if(a==='new-course')showNewCourse();else if(a==='new-set')showNewSetChoice();else if(a==='course-pick')showModal(`<div class="eyebrow">QUESTION SOURCE</div><h2>Choose a saved set</h2><div class="grid grid-2" style="margin-top:14px">${state.sets.map(s=>`<button class="card" data-set="${s.id}" style="text-align:left"><strong>${esc(s.title)}</strong><div class="muted">${esc(courseById(s.courseId)?.name||'')}</div></button>`).join('')||'<div class="muted">No study sets yet.</div>'}</div>`)}) ;document.querySelectorAll('[data-course]').forEach(b=>b.onclick=()=>{if(b.dataset.mode==='practice'){state.view='practice';render();quiz(null,'Apply');}else{state.view='games';render();startGameSession(getQuestions().filter(q=>q.courseId===b.dataset.course),'Recall')}});document.querySelectorAll('[data-game-mode]').forEach(b=>{b.onclick=()=>{const m=b.dataset.gameMode;const type=m==='Quest Rush'?'multiple':m==='Campus Clash'?'scramble':'multiple';startGameSession(getQuestions(),m,type)}});document.querySelectorAll('[data-set]').forEach(b=>b.onclick=()=>quiz(b.dataset.set));document.querySelectorAll('[data-concept]').forEach(b=>b.onclick=()=>quiz(null,'Focus',b.dataset.concept));document.querySelectorAll('[data-edit-set]').forEach(b=>b.onclick=()=>showNewSet(b.dataset.editSet));document.querySelectorAll('[data-share-set]').forEach(b=>b.onclick=()=>shareStudySet(b.dataset.shareSet));document.querySelectorAll('[data-copy-share]').forEach(b=>b.onclick=()=>{const share=state.sharedSets.find(s=>s.shareId===b.dataset.copyShare);if(share)addSharedToLibrary(share)});document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>openTextbook(Number(b.dataset.book)));document.querySelectorAll('[data-remove-book]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this textbook from your StudyHelper library?'))return;const idx=Number(b.dataset.removeBook);const book=state.books[idx];try{if(book?.cloud&&authMode==='cloud')await deleteCloudBook(book);else await deleteBookFile(book?.fileId);state.books.splice(idx,1);save();render()}catch(e){alert(e.message||'Could not remove textbook.')}});const input=document.getElementById('bookInput');if(input)input.onchange=e=>{const f=e.target.files[0];if(f)saveBook(f)};const backupInput=document.getElementById('backupInput');if(backupInput)backupInput.onchange=e=>{const f=e.target.files[0];if(f)importBackup(f)};document.querySelectorAll('[data-request-approve]').forEach(b=>b.onclick=()=>handleRequestDecision(b.dataset.requestApprove,'approve'));document.querySelectorAll('[data-request-deny]').forEach(b=>b.onclick=()=>handleRequestDecision(b.dataset.requestDeny,'deny'));const rr=document.querySelector('[data-action="refresh-requests"]');if(rr)rr.onclick=refreshAdminData;document.querySelectorAll('[data-user-role]').forEach(b=>b.onclick=async()=>{if(!isAdmin())return;const u=state.users.find(x=>x.id===b.dataset.userRole);if(!u)return;try{if(authMode==='cloud'){const token=(await authClient.auth.getSession()).data.session?.access_token;const r=await fetch('/api/admin-manage-user',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({userId:u.id,action:'role',role:u.role==='admin'?'student':'admin'})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not change role.');Object.assign(u,d.user)}else{u.role=u.role==='admin'?'student':'admin'}save();render()}catch(e){alert(e.message)}});document.querySelectorAll('[data-user-status]').forEach(b=>b.onclick=async()=>{if(!isAdmin())return;const u=state.users.find(x=>x.id===b.dataset.userStatus);if(!u)return;try{if(authMode==='cloud'){const token=(await authClient.auth.getSession()).data.session?.access_token;const r=await fetch('/api/admin-manage-user',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({userId:u.id,action:'status',status:u.status==='disabled'?'active':'disabled'})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not change account status.');Object.assign(u,d.user)}else{u.status=u.status==='disabled'?'active':'disabled'}save();render()}catch(e){alert(e.message)}});document.querySelectorAll('[data-user-delete]').forEach(b=>b.onclick=async()=>{if(!isAdmin())return;const id=b.dataset.userDelete;if(!confirm('Delete this account permanently?'))return;try{if(authMode==='cloud'){const token=(await authClient.auth.getSession()).data.session?.access_token;const r=await fetch('/api/admin-manage-user',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({userId:id,action:'delete'})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not delete account.')}state.users=state.users.filter(u=>u.id!==id);save();render()}catch(e){alert(e.message)}});
const join=document.getElementById('joinBtn');if(join)join.onclick=()=>{showModal(`<h2>Game room</h2><p class="muted">This browser build can demonstrate a room flow, but realtime multiplayer requires the cloud backend.</p><button class="primary" id="enterRoom">Enter demo</button>`);document.getElementById('enterRoom').onclick=()=>{closeModal();quiz()}}}
document.getElementById('quickPractice').onclick=()=>{state.view='practice';render();quiz()};document.getElementById('closeModal').onclick=closeModal;document.getElementById('modal').onclick=e=>{if(e.target.id==='modal')closeModal()};document.addEventListener('click',e=>{const set=e.target.closest('[data-set]');if(set&&document.getElementById('modal')?.classList.contains('hidden')===false){closeModal();quiz(set.dataset.set)} });bootAuth();
