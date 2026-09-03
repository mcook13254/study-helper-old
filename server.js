const http=require('http');const fs=require('fs');const path=require('path');
const root=__dirname, port=process.env.PORT||3000;
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
http.createServer((req,res)=>{let p=req.url.split('?')[0];if(p==='/')p='/index.html';const file=path.join(root,p);if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res)}).listen(port,()=>console.log(`StudyHelper running at http://localhost:${port}`));
