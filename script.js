const $=s=>document.querySelector(s),cv=$('#c'),ctx=cv.getContext('2d');
const W=2600,ROUND=150,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const COLORS=['#ff5d73','#3fa7ff','#ffd23f','#4ade80','#c084fc','#fb923c','#22d3ee','#f472b6','#a3e635','#f87171','#60a5fa','#facc15','#34d399','#a78bfa','#fdba74','#2dd4bf'];
const BOTS=['Pixie','Delirium','Tornado','Ninja','Capivara','Meteoro','Gulosão','Abismo','Vortex','Turbo','Sombra','Bolhinha','Rex','Mochi','Bruxo'];
const PCFG={config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'stun:stun2.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'}]}};
let G=null,isHost=false,online=false,peer=null,conns=[],hostConn=null,myId=0,names=[],started=false,ptr={x:0,y:0},cw=0,ch=0,last=0,acc=0,ended=false,lobbyDur=3;
const fmtDur=m=>m+(m===1?' min':' min');

/* ---------- cidade ---------- */
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const T=[{s:6,v:1,w:40,c:['#ff4d6d','#00e5ff','#ffe600']},{s:16,v:3,w:25,c:['#ff9f1c','#39ff14','#c77dff','#ff4d6d']},
{s:34,v:10,w:20,c:['#ffb86b','#ff6b9d','#6bd5ff']},{s:56,v:25,w:11,c:['#7c9cff','#00ffc6','#ff9a3c']},{s:90,v:60,w:4,c:['#00e5ff','#ff2bd6','#b6ff3b']}];
function gen(seed){const R=rng(seed),o=[];for(let i=0;i<420;i++){let r=R()*100,k=0;for(;k<4;k++){if(r<T[k].w)break;r-=T[k].w}
o.push({x:150+R()*(W-300),y:150+R()*(W-300),s:T[k].s,v:T[k].v,c:T[k].c[(R()*T[k].c.length)|0],a:1})}return o}
const rad=s=>22+Math.sqrt(s)*3.2;
function mk(i,name,bot){const h={id:i,name,bot,color:COLORS[i%16],x:0,y:0,r:22,score:0,dead:0,kills:0,ix:0,iy:0,rt:0};spawn(h);h.sx=h.x;h.sy=h.y;return h}
function spawn(h){h.x=200+Math.random()*(W-400);h.y=200+Math.random()*(W-400)}

/* ---------- simulação (host / local) ---------- */
let pend=[];
function step(dt){
  G.time-=dt;
  for(const h of G.h){
    if(h.dead>0){h.dead-=dt;if(h.dead<=0){h.dead=0;spawn(h);h.score=Math.floor(h.score*.4);h.r=rad(h.score)}continue}
    if(h.bot)ai(h,dt);
    const m=Math.min(1,Math.hypot(h.ix,h.iy)),a=Math.atan2(h.iy,h.ix),sp=Math.max(110,230-h.r*.9)*m;
    h.x=clamp(h.x+Math.cos(a)*sp*dt,h.r,W-h.r);h.y=clamp(h.y+Math.sin(a)*sp*dt,h.r,W-h.r);
    G.o.forEach((o,i)=>{if(o.a&&o.s<h.r*1.25&&Math.hypot(o.x-h.x,o.y-h.y)<h.r*.85){o.a=0;h.score+=o.v;pend.push(i)}});
    h.r=rad(h.score);
  }
  for(const a of G.h)for(const b of G.h){
    if(a===b||a.dead||b.dead)continue;
    if(a.r>b.r*1.25&&Math.hypot(a.x-b.x,a.y-b.y)<a.r*.6){b.dead=3;a.kills++;a.score+=Math.floor(b.score*.5)+10;a.r=rad(a.score)}
  }
}
function ai(h,dt){
  h.rt-=dt;if(h.rt>0)return;h.rt=.4+Math.random()*.4;
  let tx=null,ty=null,flee=false,best=0;
  for(const o of G.h){if(o===h||o.dead)continue;const d=Math.hypot(o.x-h.x,o.y-h.y);
    if(o.r>h.r*1.25&&d<420){tx=h.x-(o.x-h.x);ty=h.y-(o.y-h.y);flee=true;break}}
  if(!flee){
    for(const o of G.h){if(o===h||o.dead)continue;const d=Math.hypot(o.x-h.x,o.y-h.y);if(h.r>o.r*1.35&&d<320){tx=o.x;ty=o.y;best=1e9}}
    if(best<1e9)for(const o of G.o){if(!o.a||o.s>=h.r*1.25)continue;const d=Math.hypot(o.x-h.x,o.y-h.y),sc=o.v/(d+60);if(sc>best){best=sc;tx=o.x;ty=o.y}}
  }
  if(tx===null){h.ix=Math.random()-.5;h.iy=Math.random()-.5;return}
  const d=Math.hypot(tx-h.x,ty-h.y)||1;h.ix=(tx-h.x)/d;h.iy=(ty-h.y)/d;
  if(h.x<h.r+60&&h.ix<0||h.x>W-h.r-60&&h.ix>0)h.ix*=-1;if(h.y<h.r+60&&h.iy<0||h.y>W-h.r-60&&h.iy>0)h.iy*=-1;
}

/* ---------- rede (PeerJS, host autoritativo) ---------- */
const show=id=>{['home','online','lobby','local'].forEach(p=>$('#'+p).classList.toggle('hide',p!==id))};
const nick=()=>($('#nick').value.trim()||'Jogador'+((Math.random()*90+10)|0));
const send=(c,d)=>{try{c.open&&c.send(d)}catch(e){}};
const bcast=d=>conns.forEach(c=>send(c,d));
function drawLobby(){
  $('#plist').innerHTML=names.map((n,i)=>`<li><i style="background:${COLORS[i%16]}"></i>${n.replace(/[<>&]/g,'')}${i===0?' (anfitrião)':''}</li>`).join('');
  $('#bStart').classList.toggle('hide',!isHost);
  $('#dRange').classList.toggle('hide',!isHost);
  $('#dRange').value=lobbyDur;
  $('#dVal').textContent=fmtDur(lobbyDur);
  $('#durBox label').firstChild.textContent=isHost?'Duração da rodada: ':'Duração da rodada (definida pelo anfitrião): ';
  $('#bStart').disabled=names.length<2;
  $('#msgLb').textContent=isHost?(names.length<2?'Aguardando mais jogadores...':''):'Aguardando o anfitrião iniciar...';
}
function createRoom(){
  const code=Math.random().toString(36).slice(2,7).toUpperCase();
  $('#msgOn').textContent='Criando sala...';
  peer=new Peer('holeio-'+code,PCFG);
  peer.on('error',e=>{if(e.type==='unavailable-id')createRoom();else $('#msgOn').textContent='Erro de conexão: '+e.type});
  peer.on('open',()=>{isHost=true;online=true;names=[nick()];$('#roomCode').textContent=code;show('lobby');drawLobby()});
  peer.on('connection',c=>{
    c.on('data',d=>{
      if(d.t==='hi'){
        if(started||names.length>=16){send(c,{t:'full'});setTimeout(()=>c.close(),300);return}
        c.pid=names.length;names.push(String(d.n).slice(0,14));conns.push(c);send(c,{t:'you',id:c.pid,dur:lobbyDur});bcast({t:'lobby',names,dur:lobbyDur});drawLobby();
      }else if(d.t==='in'&&G&&G.h[c.pid]){G.h[c.pid].ix=+d.x||0;G.h[c.pid].iy=+d.y||0}
    });
    c.on('close',()=>{conns=conns.filter(x=>x!==c);if(started){const h=G&&G.h[c.pid];if(h){h.bot=true}}else{names=names.filter((_,i)=>i!==c.pid);conns.forEach(x=>{if(x.pid>c.pid)x.pid--});names.forEach((_,i)=>{});bcast({t:'lobby',names,dur:lobbyDur});drawLobby()}});
  });
}
function joinRoom(){
  const code=$('#code').value.trim().toUpperCase();if(code.length<5){$('#msgOn').textContent='Digite o código da sala.';return}
  $('#msgOn').textContent='Conectando...';peer=new Peer(undefined,PCFG);
  peer.on('error',()=>$('#msgOn').textContent='Sala não encontrada.');
  peer.on('open',()=>{
    hostConn=peer.connect('holeio-'+code,{reliable:true});
    hostConn.on('open',()=>{online=true;$('#roomCode').textContent=code;hostConn.send({t:'hi',n:nick()})});
    hostConn.on('close',()=>{if(!ended){alert('Conexão com a sala encerrada.');location.reload()}});
    hostConn.on('data',onHost);
  });
}
function onHost(d){
  if(d.t==='full'){$('#msgOn').textContent='Sala cheia ou já iniciada.';show('online')}
  else if(d.t==='you'){myId=d.id;if(d.dur)lobbyDur=d.dur;show('lobby');drawLobby()}
  else if(d.t==='lobby'){names=d.names;if(d.dur)lobbyDur=d.dur;drawLobby()}
  else if(d.t==='start'){names=d.names;const dur=clamp(+d.dur||3,1,10)*60;G={o:gen(d.seed),h:names.map((n,i)=>mk(i,n,false)),time:dur,dur};begin()}
  else if(d.t==='s'&&G){G.time=d.tm;d.h.forEach((a,i)=>{const h=G.h[i];h.sx=a[0];h.sy=a[1];h.r=a[2];h.score=a[3];h.dead=a[4];h.kills=a[5]});d.e.forEach(i=>G.o[i].a=0)}
  else if(d.t==='end')finish(d.rank)
}
function startOnline(){
  started=true;const seed=(Math.random()*1e9)|0;
  const mins=clamp(+$('#dRange').value||3,1,10),dur=mins*60;
  G={o:gen(seed),h:names.map((n,i)=>mk(i,n,false)),time:dur,dur};myId=0;
  bcast({t:'start',seed,names,dur:mins});begin();
}

/* ---------- loop / render ---------- */
function begin(){started=true;$('#menu').classList.add('hide');addEventListener('resize',rs);rs();last=performance.now();requestAnimationFrame(loop)}
let DPR=1;function rs(){DPR=Math.min(devicePixelRatio||1,2);cw=innerWidth;ch=innerHeight;cv.width=cw*DPR;cv.height=ch*DPR}
let joy=null,mouseOn=false;const keys={};
cv.addEventListener('touchstart',e=>{const t=e.changedTouches[0];joy={id:t.identifier,x:t.clientX,y:t.clientY,dx:0,dy:0}},{passive:true});
cv.addEventListener('touchmove',e=>{if(!joy)return;for(const t of e.changedTouches)if(t.identifier===joy.id){joy.dx=t.clientX-joy.x;joy.dy=t.clientY-joy.y;const d=Math.hypot(joy.dx,joy.dy);if(d>70){joy.x+=joy.dx/d*(d-70);joy.y+=joy.dy/d*(d-70);joy.dx=joy.dx/d*70;joy.dy=joy.dy/d*70}}},{passive:true});
const tEnd=e=>{if(joy)for(const t of e.changedTouches)if(t.identifier===joy.id)joy=null};
cv.addEventListener('touchend',tEnd);cv.addEventListener('touchcancel',tEnd);
cv.addEventListener('mousemove',e=>{mouseOn=true;ptr.x=e.clientX;ptr.y=e.clientY});
addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=1});addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=0});
function getInput(){
  if(joy)return[clamp(joy.dx/60,-1,1),clamp(joy.dy/60,-1,1)];
  const kx=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),ky=(keys.s||keys.arrowdown?1:0)-(keys.w||keys.arrowup?1:0);
  if(kx||ky){const d=Math.hypot(kx,ky);return[kx/d,ky/d]}
  if(!mouseOn)return[0,0];const k=Math.min(cw,ch)/4;return[clamp((ptr.x-cw/2)/k,-1,1),clamp((ptr.y-ch/2)/k,-1,1)];
}
let snapT=0,inT=0;
function loop(t){
  const dt=Math.min(.05,(t-last)/1000);last=t;
  const me=G.h[myId],[ix,iy]=getInput();
  if(!ended){
    if(!online||isHost){
      me.ix=ix;me.iy=iy;step(dt);snapT+=dt;
      if(online&&snapT>.05){snapT=0;bcast({t:'s',tm:G.time,e:pend,h:G.h.map(h=>[Math.round(h.x),Math.round(h.y),h.r,h.score,h.dead>0?1:0,h.kills])});pend=[]}
      else if(!online)pend=[];
      for(const h of G.h){h.sx=h.x;h.sy=h.y}
      if(G.time<=0){const rank=G.h.slice().sort((a,b)=>b.score-a.score).map(h=>[h.name,h.score]);bcast({t:'end',rank});finish(rank)}
    }else{
      inT+=dt;if(inT>.05){inT=0;send(hostConn,{t:'in',x:ix,y:iy})}
      for(const h of G.h){h.x+=(h.sx-h.x)*.35;h.y+=(h.sy-h.y)*.35}
    }
  }
  draw();if(!ended)requestAnimationFrame(loop);
}
function finish(rank){ended=true;$('#rank').innerHTML=rank.map((r,i)=>`<li><span>${i+1}. ${String(r[0]).replace(/[<>&]/g,'')}</span><b>${r[1]} pts</b></li>`).join('');$('#end').classList.remove('hide')}

function draw(){
  const me=G.h[myId],z=clamp(1.15-me.r/160,.4,1)*Math.min(cw,ch)/650;
  ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle='#030512';ctx.fillRect(0,0,cw,ch);
  ctx.setTransform(z*DPR,0,0,z*DPR,(cw/2-me.x*z)*DPR,(ch/2-me.y*z)*DPR);
  ctx.fillStyle='#0a1030';ctx.fillRect(0,0,W,W);
  ctx.strokeStyle='#00e5ff14';ctx.lineWidth=1;ctx.beginPath();for(let p=0;p<=W;p+=50){ctx.moveTo(p,0);ctx.lineTo(p,W);ctx.moveTo(0,p);ctx.lineTo(W,p)}ctx.stroke();
  ctx.fillStyle='#0f1a4a';for(let p=0;p<=W;p+=400){ctx.fillRect(p-45,0,90,W);ctx.fillRect(0,p-45,W,90)}
  ctx.fillStyle='#00e5ff55';for(let p=0;p<=W;p+=400)for(let q=20;q<W;q+=60){ctx.fillRect(p-1.5,q,3,26);ctx.fillRect(q,p-1.5,26,3)}
  ctx.strokeStyle='#ff2bd6';ctx.lineWidth=6;ctx.strokeRect(0,0,W,W);
  const vx0=me.x-cw/2/z-100,vx1=me.x+cw/2/z+100,vy0=me.y-ch/2/z-100,vy1=me.y+ch/2/z+100;
  for(const o of G.o){
    if(!o.a||o.x<vx0||o.x>vx1||o.y<vy0||o.y>vy1)continue;const h=o.s/2;
    ctx.fillStyle='#050816';ctx.fillRect(o.x-h+3,o.y-h+3,o.s,o.s);
    ctx.fillStyle='#0d1633';ctx.fillRect(o.x-h,o.y-h,o.s,o.s);
    ctx.strokeStyle=o.c;ctx.lineWidth=o.s>30?2.5:1.5;ctx.strokeRect(o.x-h,o.y-h,o.s,o.s);
    if(o.s>30){ctx.globalAlpha=.55;ctx.fillStyle=o.c;ctx.fillRect(o.x-h*.45,o.y-h*.45,o.s*.45,o.s*.45);ctx.globalAlpha=1}
    else{ctx.fillStyle=o.c;ctx.fillRect(o.x-h*.5,o.y-h*.5,h,h)}
  }
  const lead=G.h.reduce((a,b)=>b.score>a.score?b:a);
  for(const h of G.h){
    if(h.dead>0)continue;
    ctx.save();ctx.shadowColor=h.color;ctx.shadowBlur=24;
    ctx.beginPath();ctx.arc(h.x,h.y,h.r+4,0,7);ctx.fillStyle=h.color;ctx.fill();ctx.restore();
    ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,7);ctx.fillStyle='#000';ctx.fill();
    ctx.beginPath();ctx.arc(h.x,h.y,h.r*.7,0,7);ctx.strokeStyle=h.color+'66';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=h===G.h[myId]?'#b6ff3b':'#fff';ctx.font='bold 17px Rajdhani,sans-serif';ctx.textAlign='center';ctx.fillText(h.name+(h===lead?' 👑':''),h.x,h.y-h.r-12);
  }
  ctx.setTransform(DPR,0,0,DPR,0,0);
  const bar=(x,y,w,txt,c)=>{ctx.fillStyle='#050816cc';ctx.fillRect(x,y,w,28);ctx.strokeStyle=c||'#00e5ff88';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,27);ctx.fillStyle='#e6f7ff';ctx.textAlign='left';ctx.font='bold 15px Rajdhani,sans-serif';ctx.fillText(txt,x+8,y+19)};
  const m=Math.max(0,Math.ceil(G.time)),bw=Math.min(200,cw*.42);
  bar(8,8,100,`⏱ ${(m/60|0)}:${String(m%60).padStart(2,'0')}`);bar(8,40,Math.min(150,cw*.35),`Pontos: ${me.score}`,'#b6ff3b99');
  G.h.slice().sort((a,b)=>b.score-a.score).slice(0,5).forEach((h,i)=>bar(cw-bw-8,8+i*30,bw,`${i+1}. ${h.name} ${h.score}`,h===G.h[myId]?'#b6ff3b99':null));
  if(joy){ctx.strokeStyle='#00e5ff99';ctx.lineWidth=2;ctx.beginPath();ctx.arc(joy.x-joy.dx,joy.y-joy.dy,70,0,7);ctx.stroke();ctx.fillStyle='#00e5ff66';ctx.beginPath();ctx.arc(joy.x,joy.y,24,0,7);ctx.fill()}
  if(G.time>G.dur-6){ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 18px Rajdhani,sans-serif';ctx.fillText('Arraste o dedo, use o mouse ou WASD/setas para mover',cw/2,ch-24)}
  if(me.dead>0){ctx.fillStyle='#000a';ctx.fillRect(0,ch/2-30,cw,60);ctx.fillStyle='#ff2bd6';ctx.textAlign='center';ctx.font='bold 24px Orbitron,sans-serif';ctx.fillText('ENGOLIDO! Renasce em '+Math.ceil(me.dead)+'s',cw/2,ch/2+8)}
}

/* ---------- menu ---------- */
$('#bOnline').onclick=()=>show('online');
$('#bLocal').onclick=()=>show('local');
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>show('home'));
$('#bCreate').onclick=createRoom;
$('#bJoin').onclick=joinRoom;
$('#bStart').onclick=startOnline;
$('#bLeave').onclick=()=>location.reload();
$('#dRange').oninput=e=>{if(!isHost)return;lobbyDur=+e.target.value;$('#dVal').textContent=fmtDur(lobbyDur);bcast({t:'lobby',names,dur:lobbyDur})};
$('#nRange').oninput=e=>$('#nVal').textContent=e.target.value;
$('#bPlayLocal').onclick=()=>{
  const n=+$('#nRange').value;isHost=true;myId=0;
  names=['Você',...BOTS.slice(0,n-1)];
  G={o:gen((Math.random()*1e9)|0),h:names.map((nm,i)=>mk(i,nm,i>0)),time:ROUND,dur:ROUND};begin();
};
