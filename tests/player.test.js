import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from '../core.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8'));
const baseId='acoustic_26',altId='acoustic_26_v4';
const flush=()=>new Promise(resolve=>setImmediate(resolve));

/** Deterministic DOM/audio harness executing the production app, not a copied player. */
class Node {
  constructor(id,doc,tag='div'){this.id=id;this.doc=doc;this.tagName=tag.toUpperCase();this.listeners={};this.dataset={};this.attributes={};this.hidden=false;this.disabled=false;this.value='';this.open=false;this.textContent='';this.children=[];this.childIds=[];this.style={setProperty(){}};this.classList={toggle(){}};}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  emit(type,event={}){for(const fn of this.listeners[type]||[])fn({target:this,...event});}
  setAttribute(k,v){this.attributes[k]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  focus(){this.doc.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  getBoundingClientRect(){return {left:0,right:800,top:0,bottom:700};}
  closest(selector){return /input|textarea|select|button|a|contenteditable/.test(selector)&&['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(this.tagName)?this:null;}
  querySelector(){return null;}
  set innerHTML(value){
    this.html=value;
    for(const id of this.childIds)this.doc.nodes.delete(id);
    this.childIds=[];
    for(const match of value.matchAll(/<([a-z][\w-]*)\b([^>]*?\sid="([^"]+)"[^>]*)>/gi)){
      const node=new Node(match[3],this.doc,match[1]);
      for(const a of match[2].matchAll(/([\w-]+)="([^"]*)"/g)){
        node.attributes[a[1]]=a[2];
        if(a[1].startsWith('data-'))node.dataset[a[1].slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=a[2];
      }
      this.doc.nodes.set(node.id,node);this.childIds.push(node.id);
    }
  }
  get innerHTML(){return this.html||'';}
}
class Audio extends Node {
  constructor(doc){super('audio',doc,'audio');this.paused=true;this.ended=false;this.readyState=0;this.duration=NaN;this.currentTime=0;this.error=null;this.volume=.75;this.muted=false;this.playbackRate=1;this.requests=[];this.loads=0;}
  pause(){this.paused=true;this.emit('pause');}
  load(){this.loads++;this.error=null;this.ended=false;this.readyState=0;this.currentTime=0;this.duration=NaN;}
  play(){this.paused=false;this.ended=false;this.emit('play');let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});this.requests.push({src:this.src,resolve,reject});return promise;}
}
async function harness(){
  const doc={nodes:new Map(),listeners:{},title:'',activeElement:null,getElementById(id){return this.nodes.get(id)||null;},addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},querySelectorAll(){return [];},querySelector(selector){return selector==='dialog[open]'?[...this.nodes.values()].find(n=>n.tagName==='DIALOG'&&n.open)||null:null;}};
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*?\sid="([^"]+)"[^>]*>/gi))doc.nodes.set(m[2],new Node(m[2],doc,m[1]));
  const audio=new Audio(doc);doc.nodes.set('audio',audio);doc.getElementById('playback-notice').hidden=true;
  const errors=[];
  const context={document:doc,navigator:{},window:{},core,URLSearchParams,location:{search:''},localStorage:{getItem(){return null;},setItem(){}},fetch:async()=>({ok:true,json:async()=>structuredClone(catalog)}),setTimeout:()=>1,clearTimeout(){},console:{error:(...args)=>errors.push(args)},Math};
  const code=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import \{([^}]+)\} from '\.\/core\.js';/,(_,names)=>`const {${names.replace('escapeHTML as esc','escapeHTML:esc')}}=core;`);
  vm.runInNewContext(code+'\nglobalThis.testApp={state,selectTrack,openDetails,changeDetailsVersion,requestPlay,togglePlayback,advance,renderTracks};',context);
  await flush();assert.deepEqual(errors,[]);
  return {...context.testApp,doc,audio,errors,el:id=>doc.getElementById(id),key(event){for(const fn of doc.listeners.keydown||[])fn({altKey:false,ctrlKey:false,metaKey:false,repeat:false,key:' ',code:'Space',preventDefault(){},...event});}};
}

test('alternatives are versions of one composition and original v3 is default',()=>{
 const song=catalog.tracks.find(t=>t.id===baseId);assert.equal(core.trackVersions(song).length,2);assert.equal(core.trackVersion(song).version,'v3');assert.equal(core.trackVersion(song).src,'audio/acoustic_26.mp3');assert.equal(core.trackVersion(song,altId).primary,false);assert.equal(core.playableVersionCount(catalog.tracks),catalog.tracks.length+1);
 const search=core.getFilteredTracks(catalog.tracks,{query:'未合上的书'});assert.equal(search.length,1);assert.equal(search[0].id,baseId);
});
test('alternative metadata rejects duplicate IDs, traversal, wrong composition and false count',()=>{
 for(const mutate of [c=>c.tracks.find(t=>t.id===baseId).alternatives[0].id='jazz_waltz',c=>c.tracks.find(t=>t.id===baseId).alternatives[0].src='../bad.mp3',c=>c.tracks.find(t=>t.id===baseId).alternatives[0].sameComposition=false,c=>c.playableVersionCount++]){const copy=structuredClone(catalog);mutate(copy);assert.throws(()=>core.validateCatalog(copy));}
});
test('card grid and counts retain one card per composition, never a separate v4 card',async()=>{
 const h=await harness();h.state.limit=1000;h.renderTracks();assert.equal((h.el('track-grid').innerHTML.match(/<article /g)||[]).length,catalog.tracks.length);assert.ok(!h.el('track-grid').innerHTML.includes(`data-track-id="${altId}"`));assert.equal(h.el('stat-count').textContent,String(catalog.tracks.length));assert.ok(h.el('results-count').textContent.includes(`${catalog.tracks.length+1} 个可听版本`));
});
test('playing v3 switches to v4 from zero, preserves composition queue and labels current version',async()=>{
 const h=await harness();const queue=[baseId,'jazz_waltz'];h.selectTrack(baseId,true,queue);h.audio.requests[0].resolve();await flush();h.audio.currentTime=190;h.openDetails(baseId);const selector=h.el('version-select');selector.focus();selector.value=altId;selector.emit('change');
 assert.equal(h.audio.src,'audio/acoustic_26_v4.mp3');assert.equal(h.audio.currentTime,0);assert.equal(h.state.current.id,baseId);assert.equal(h.state.currentVersion.id,altId);assert.deepEqual(Array.from(h.state.queue),queue);assert.equal(h.state.wantsPlay,true);assert.equal(h.audio.requests.length,2);assert.ok(h.el('player-subtitle').textContent.includes('v4 主题互换版'));assert.equal(h.doc.activeElement,selector);assert.equal(h.el('version-select'),selector);
 assert.equal(h.el('download-audio').href,'audio/acoustic_26_v4.mp3');assert.equal(h.el('download-project').href,'projects/acoustic_26_v4.zip');assert.equal(h.el('alternative-notes').hidden,false);
});
test('paused version switch stays paused and v3 primary media stays selectable',async()=>{
 const h=await harness();h.selectTrack(baseId,false,[baseId]);h.openDetails(baseId);h.el('version-select').value=altId;h.el('version-select').emit('change');assert.equal(h.audio.requests.length,0);assert.equal(h.audio.paused,true);assert.equal(h.state.wantsPlay,false);h.el('version-select').value=baseId;h.el('version-select').emit('change');assert.equal(h.audio.src,'audio/acoustic_26.mp3');assert.equal(h.el('download-project').href,'projects/acoustic_26.zip');assert.equal(h.el('alternative-notes').hidden,true);
});
test('choosing a version of another song does not interrupt currently playing music',async()=>{
 const h=await harness();h.selectTrack('jazz_waltz',true);h.openDetails(baseId);h.el('version-select').value=altId;h.el('version-select').emit('change');assert.equal(h.state.current.id,'jazz_waltz');assert.equal(h.audio.requests.length,1);h.el('dialog-play').emit('click');assert.equal(h.state.current.id,baseId);assert.equal(h.state.currentVersion.id,altId);assert.equal(h.audio.requests.length,2);
});
test('late v3 rejection cannot show an error or stop newer v4 playback',async()=>{
 const h=await harness();h.selectTrack(baseId,true);h.selectTrack(baseId,true,null,altId);h.audio.requests[0].reject(new Error('old source failed'));await flush();assert.equal(h.state.wantsPlay,true);assert.equal(h.state.currentVersion.id,altId);assert.equal(h.el('retry-audio').hidden,true);assert.match(h.el('playback-message').textContent,/正在加载/);h.audio.requests[1].resolve();await flush();assert.equal(h.audio.paused,false);
});
test('late version promise cannot resurrect playback after rapid switch and pause',async()=>{
 const h=await harness();h.selectTrack(baseId,true);h.selectTrack(baseId,true,null,altId);h.togglePlayback();h.audio.requests[0].resolve();h.audio.requests[1].resolve();await flush();assert.equal(h.audio.paused,true);assert.equal(h.state.wantsPlay,false);
});
test('same-source retry is protected from a previous play promise rejection',async()=>{
 const h=await harness();h.selectTrack(baseId,true);h.togglePlayback();h.togglePlayback();h.audio.requests[0].reject(new Error('superseded'));await flush();assert.equal(h.state.wantsPlay,true);assert.equal(h.el('retry-audio').hidden,true);assert.match(h.el('playback-message').textContent,/正在加载/);h.audio.requests[1].resolve();await flush();assert.equal(h.audio.paused,false);
});
test('active alternative error exposes retry and retains its exact source and download identity',async()=>{
 const h=await harness();h.selectTrack(baseId,true,null,altId);h.openDetails(baseId);h.audio.paused=true;h.audio.error={code:4};h.audio.emit('error');assert.equal(h.state.wantsPlay,false);assert.equal(h.el('retry-audio').hidden,false);assert.equal(h.el('playback-notice').hidden,false);h.el('retry-audio').emit('click');assert.equal(h.audio.src,'audio/acoustic_26_v4.mp3');assert.equal(h.state.currentVersion.id,altId);assert.equal(h.state.wantsPlay,true);assert.equal(h.el('download-audio').href,'audio/acoustic_26_v4.mp3');
});
test('version-select focus and an open dialog do not trigger global Space/arrow shortcuts',async()=>{
 const h=await harness();h.selectTrack(baseId,false);h.openDetails(baseId);const select=h.el('version-select');select.focus();h.key({target:select});h.key({target:select,key:'ArrowRight',code:'ArrowRight'});assert.equal(h.audio.requests.length,0);assert.equal(h.audio.currentTime,0);assert.equal(h.doc.activeElement,select);h.el('track-dialog').close();h.key({target:select});assert.equal(h.audio.requests.length,0);
});
test('song navigation leaves the variant and uses the next song default; returning defaults to v3',async()=>{
 const h=await harness();h.selectTrack(baseId,true,[baseId,'jazz_waltz'],altId);h.advance(1);assert.equal(h.state.current.id,'jazz_waltz');assert.equal(h.state.currentVersion.id,'jazz_waltz');h.audio.currentTime=0;h.advance(-1);assert.equal(h.state.current.id,baseId);assert.equal(h.state.currentVersion.id,baseId);assert.equal(h.audio.src,'audio/acoustic_26.mp3');
});
