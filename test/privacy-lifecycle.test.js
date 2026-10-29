import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function app(voices=[]){
  const nodes=new Map(), timers=new Map(), spoken=[];
  const $=id=>{
    if(!nodes.has(id)) nodes.set(id,{hidden:false,value:'',textContent:'',innerHTML:'',addEventListener(){},querySelectorAll(){return [];}});
    return nodes.get(id);
  };
  const speech={cancel(){},getVoices:()=>voices,speak:u=>spoken.push(u)};
  let landing=0, timerId=0;
  const state={guest:true,scans:[],img:{},src:{},email:'synthetic@example.com',name:'Synthetic'};
  const context=vm.createContext({$,S:state,flow:{},CONFIG:{privacy:true},SUBTLE:true,
    window:{addEventListener(){},speechSynthesis:speech},speechSynthesis:speech,
    SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
    document:{querySelectorAll:()=>[]},ctx:{clearRect(){}},cv:{width:128,height:128},
    cancelVaultWrites(){},cancelPendingImages(){},clearPending(){},DemoMail:{boxes:{login:{email:'synthetic@example.com'}}},
    AuthBackend:{detect:()=>Promise.resolve('demo'),tokens:{signup:'synthetic-token'},regToken:'synthetic-token'},
    renderGlossary(){},ENGINE:{name:'demo'},showLanding(){landing++;},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},
    clearTimeout(id){timers.delete(id);},
  });
  vm.runInContext(readFileSync(new URL('../js/app.js',import.meta.url),'utf8'),context);
  return {context,state,nodes,$,timers,spoken,landing:()=>landing};
}

test('익명 분석에도 유휴 잠금이 걸리고 나갈 때 영상·인증 임시값을 지운다',()=>{
  const a=app();
  a.$('app').hidden=false;
  a.$('recKey').textContent='synthetic-recovery-key';
  a.$('loginPw').value='synthetic-password';
  a.context.resetIdle();
  const timer=[...a.timers.values()].find(t=>t.delay===600000);
  assert.ok(timer);
  timer.fn();
  assert.equal(a.state.img,null);
  assert.equal(a.state.src,null);
  assert.equal(a.state.email,'');
  assert.equal(a.$('loginPw').value,'');
  assert.equal(a.$('recKey').textContent,'');
  assert.equal(Object.keys(a.context.AuthBackend.tokens).length,0);
  assert.equal(Object.keys(a.context.DemoMail.boxes).length,0);
  assert.equal(a.landing(),2);
});

test('개인정보 보호 모드에서 원격 음성 엔진을 사용하지 않는다',()=>{
  const a=app([{lang:'ko-KR',localService:false}]);
  a.context.speak('synthetic report');
  assert.equal(a.spoken.length,0);
  assert.match(a.$('checkMsg').textContent,/기기 내 한국어 음성/);
});

test('한국어 로컬 음성이 있으면 해당 음성을 명시적으로 선택한다',()=>{
  const voice={lang:'ko-KR',localService:true};
  const a=app([{lang:'ko-KR',localService:false},voice]);
  a.context.speak('synthetic report');
  assert.equal(a.spoken.length,1);
  assert.equal(a.spoken[0].voice,voice);
});
