import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {io} from 'socket.io-client';

test('upload, range delivery, room sync, buffering, reconnect and restart',async()=>{
 const storage=await mkdtemp(path.join(tmpdir(),'watch-party-'));
 const port=String(18000+Math.floor(Math.random()*10000)),base='http://127.0.0.1:'+port;
 let child;const clients=[];
 async function start(){child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:port,STORAGE_DIR:storage},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});}
 async function stop(){const current=child;await new Promise(resolve=>{current.once('exit',resolve);current.kill();});child=null;}
 async function join(id){const s=io(base,{transports:['websocket'],forceNew:true});clients.push(s);await new Promise(resolve=>s.once('connect',resolve));const result=await new Promise(resolve=>s.emit('join',{id,name:'Tester'},resolve));return {s,state:result.state};}
 function change(s,event,payload){return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('No state for '+event)),3000);s.once('state',state=>{clearTimeout(timeout);resolve(state);});s.emit(event,payload);});}
 try{
 await start();assert.equal((await fetch(base+'/api/rooms/invalid')).status,404);
 const invalid=new FormData();invalid.append('movie',new Blob(['not a movie']),'bad.mp4');assert.equal((await fetch(base+'/api/rooms',{method:'POST',body:invalid})).status,400);
 const content=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(100)]),data=new FormData();data.append('movie',new Blob([content],{type:'video/mp4'}),'sample.mp4');data.append('name','Test screening');
 const response=await fetch(base+'/api/rooms',{method:'POST',body:data});assert.equal(response.status,201);const {id}=await response.json();
 const range=await fetch(base+'/api/rooms/'+id+'/video',{headers:{Range:'bytes=4-11'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 4-11/112');assert.equal(await range.text(),'ftypisom');
 const badRange=await fetch(base+'/api/rooms/'+id+'/video',{headers:{Range:'bytes=200-300'}});assert.equal(badRange.status,416);
 const {s:a}=await join(id);await new Promise(r=>setTimeout(r,50));assert.equal((await change(a,'control',{action:'seek',time:25})).position,25);assert.equal((await change(a,'control',{action:'play'})).playing,true);
 await new Promise(r=>setTimeout(r,120));const {s:b,state:late}=await join(id);assert.ok(late.position>=25);assert.equal(late.playing,true);await new Promise(r=>setTimeout(r,50));
 const waiting=await change(b,'buffering',true);assert.equal(waiting.playing,false);assert.equal(waiting.waiting,true);const resumed=await change(b,'buffering',false);assert.equal(resumed.playing,true);
 await change(b,'buffering',true);await change(a,'control',{action:'pause'});assert.equal((await change(b,'buffering',false)).playing,false);
 b.disconnect();const {state:rejoined}=await join(id);assert.equal(rejoined.playing,false);assert.ok(rejoined.position>=25);
 await change(a,'control',{action:'seek',time:42});for(const s of clients)s.disconnect();await new Promise(r=>setTimeout(r,50));await stop();await start();const restored=await (await fetch(base+'/api/rooms/'+id)).json();assert.equal(restored.position,42);assert.equal(restored.playing,false);assert.equal(restored.movie.file,undefined);
 }finally{for(const s of clients)s.disconnect();if(child)await stop();await rm(storage,{recursive:true,force:true});}
});
