const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const WebSocket=require('ws');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('room admission, shared movement, teacher controls and isolation',async()=>{
 const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3101'}});
 const clients=[];
 try{
 await once(server.stdout,'data');
 assert.equal((await fetch('http://localhost:3101/healthz')).status,200);
 async function connect(join){const ws=new WebSocket('ws://localhost:3101');clients.push(ws);ws.messages=[];ws.on('message',b=>ws.messages.push(JSON.parse(b)));await once(ws,'open');ws.send(JSON.stringify({type:'join',...join}));return ws}
 async function wait(ws,predicate,timeout=6000){const end=Date.now()+timeout;while(Date.now()<end){const result=ws.messages.find(predicate);if(result)return result;await delay(20)}throw Error('Expected message was not received')}
 const teacher=await connect({teacher:true,name:'teacher'});const joined=await wait(teacher,m=>m.type==='joined');assert.match(joined.code,/^\d{6}$/);
 const first=await connect({code:joined.code,name:'first'});const a=await wait(first,m=>m.type==='joined');const second=await connect({code:joined.code,name:'second'});await wait(second,m=>m.type==='joined');
 await wait(teacher,m=>m.players?.length===3);
 teacher.send(JSON.stringify({type:'command',action:'start'}));await wait(first,m=>m.phase==='countdown');
 teacher.send(JSON.stringify({type:'command',action:'pause'}));await wait(first,m=>m.phase==='countdown'&&m.paused);await delay(3300);assert.equal(first.messages.at(-1).phase,'countdown');
 teacher.send(JSON.stringify({type:'command',action:'pause'}));await wait(first,m=>m.phase==='race');
 first.send(JSON.stringify({type:'move',data:{x:42,lane:2,correct:1}}));await wait(second,m=>m.players?.some(p=>p.id===a.id&&p.x===42));await wait(teacher,m=>m.players?.some(p=>p.id===a.id&&p.x===42));
 first.send(JSON.stringify({type:'command',action:'end'}));await delay(150);assert.equal(first.messages.at(-1).phase,'race');
 teacher.send(JSON.stringify({type:'command',action:'pause'}));await wait(second,m=>m.phase==='race'&&m.paused);first.send(JSON.stringify({type:'move',data:{x:100}}));await delay(150);assert.equal(second.messages.at(-1).players.find(p=>p.id===a.id).x,42);
 teacher.send(JSON.stringify({type:'command',action:'end'}));await wait(second,m=>m.phase==='ended');
 teacher.send(JSON.stringify({type:'command',action:'restart'}));await wait(second,m=>m.phase==='countdown'&&m.players.some(p=>p.id===a.id&&p.x===0));
 const invalid=await connect({code:'000000'});await wait(invalid,m=>m.type==='error');
 }finally{for(const ws of clients)ws.terminate();server.kill();await once(server,'exit')}
});
