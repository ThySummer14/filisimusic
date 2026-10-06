import {PAGE_SIZE, escapeHTML as esc, formatTime, timeLabel, clamp, validateCatalog, getFilteredTracks, nextTrackId, artwork} from './core.js';
const $ = id => document.getElementById(id);
const audio = $('audio');
const state = {tracks:[], filtered:[], group:'all', style:'all', query:'', sort:'original', limit:PAGE_SIZE, current:null, queue:[], generation:0, wantsPlay:false, seeking:false, loading:false, catalogGeneration:0};
const groupLabels = {acoustic:'木色与琴弦',electronic:'电子与节奏',sketch:'灵感短篇'};
let noticeTimer;
function announce(message) { $('announcement').textContent = message; }
function showNotice(message, retry = false, temporary = false) {
  clearTimeout(noticeTimer);
  $('playback-message').textContent = message;
  $('retry-audio').hidden = !retry;
  $('playback-notice').hidden = false;
  if (temporary) noticeTimer = setTimeout(hideNotice, 4200);
}
function hideNotice() { clearTimeout(noticeTimer); $('playback-notice').hidden = true; }
function updateRange(element, value, max) {
  element.style.setProperty('--progress', `${clamp(value / (max || 1) * 100, 0, 100)}%`);
}
function trackCard(track) {
  const active = state.current?.id === track.id;
  const playing = active && !audio.paused && !audio.ended;
  const index = String(track.order + 1).padStart(2,'0');
  return `<article class="track-card${active ? ' is-current':''}" data-track-id="${esc(track.id)}"><div class="track-art">${artwork(track)}<span class="art-index">NO. ${index}</span><span class="art-label">FILISI / ${esc(track.group.toUpperCase())}</span><button class="track-play" data-play="${esc(track.id)}" aria-label="${playing ? '暂停':'播放'} ${esc(track.title)}" aria-pressed="${playing}"><span class="${playing ? 'pause-symbol':'play-symbol'}" aria-hidden="true"></span></button></div><div class="track-meta"><span class="track-style">${esc(track.genre)} · ${esc(track.bpm)} BPM</span><span class="track-duration">${formatTime(track.durationSeconds)}</span></div><button class="track-title" data-details="${esc(track.id)}">${esc(track.title)}</button><p class="track-en" lang="en">${esc(track.titleEn)}</p><p class="track-story">${esc(track.story)}</p><div class="track-bottom"><button class="text-link" data-details="${esc(track.id)}" aria-label="阅读 ${esc(track.title)} 的制作手记">制作手记 <span aria-hidden="true">↗</span></button><span class="version-label">${esc(track.finalVersion)} / ${esc(track.revisionLabel)}</span></div></article>`;
}
function renderTracks() {
  state.filtered = getFilteredTracks(state.tracks, state);
  const visible = state.filtered.slice(0, state.limit);
  $('track-grid').innerHTML = visible.map(trackCard).join('');
  $('track-grid').setAttribute('aria-busy','false');
  $('empty-state').hidden = state.filtered.length > 0;
  $('results-count').textContent = state.filtered.length === state.tracks.length ? `收录 ${state.tracks.length} 首作品 · 点击封面上的播放键试听` : `找到 ${state.filtered.length} / ${state.tracks.length} 首作品`;
  $('load-more').hidden = state.limit >= state.filtered.length;
  $('load-more').textContent = `再翻一页 · 还有 ${Math.max(0,state.filtered.length-visible.length)} 首 ↓`;
  $('random-track').disabled = !state.filtered.length;
  document.querySelectorAll('[data-group]').forEach(button => {
    const active = button.dataset.group === state.group;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  });
}
function updatePlayingUI() {
  const playing = Boolean(state.current && !audio.paused && !audio.ended);
  const icon = `<span class="${playing ? 'pause-symbol':'play-symbol'}" aria-hidden="true"></span>`;
  $('play-pause').innerHTML = icon;
  $('play-pause').setAttribute('aria-label', playing ? '暂停':'播放');
  $('play-pause').setAttribute('aria-pressed',String(playing));
  document.querySelectorAll('[data-play]').forEach(button => {
    const isCurrent = button.dataset.play === state.current?.id;
    const isPlaying = isCurrent && playing;
    const track = state.tracks.find(item => item.id === button.dataset.play);
    button.innerHTML = `<span class="${isPlaying ? 'pause-symbol':'play-symbol'}" aria-hidden="true"></span>`;
    button.setAttribute('aria-label',`${isPlaying ? '暂停':'播放'} ${track?.title || ''}`);
    button.setAttribute('aria-pressed',String(isPlaying));
  });
  document.querySelectorAll('.track-card').forEach(card => card.classList.toggle('is-current',card.dataset.trackId === state.current?.id));
  const dialogPlay = $('dialog-play');
  if (dialogPlay) { const isPlaying = dialogPlay.dataset.id === state.current?.id && playing; dialogPlay.innerHTML = `<span class="${isPlaying ? 'pause-symbol':'play-symbol'}" aria-hidden="true"></span>${isPlaying ? '暂停播放':'聆听这首'}`; }
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = !state.current ? 'none' : playing ? 'playing' : 'paused';
}
function updateProgress() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : state.current?.durationSeconds || 0;
  if (!state.seeking) {
    $('seek').max = String(duration || 100);$('seek').value = String(audio.currentTime || 0);
    $('seek').setAttribute('aria-valuetext',timeLabel(audio.currentTime));
    $('elapsed').textContent = formatTime(audio.currentTime);updateRange($('seek'),audio.currentTime,duration);
  }
  $('duration').textContent = formatTime(duration);
  $('seek').disabled = !state.current || !Number.isFinite(audio.duration);
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && duration > 0 && Number.isFinite(audio.duration)) {
    try { navigator.mediaSession.setPositionState({duration,playbackRate:audio.playbackRate,position:clamp(audio.currentTime,0,duration)}); } catch { /* Older browsers can reject incomplete media state. */ }
  }
}
function updatePlayerTrack(track) {
  $('player-title').textContent = track.title;
  $('player-subtitle').textContent = `${track.genre} · ${track.titleEn}`;
  $('player-cover').innerHTML = artwork(track,true);
  $('player-details').disabled = false;
  $('player-details').setAttribute('aria-label',`查看 ${track.title} 的制作手记`);
  ['play-pause','previous','next'].forEach(id => $(id).disabled = false);
  $('duration').textContent = formatTime(track.durationSeconds);
  $('elapsed').textContent = '0:00';$('seek').value = '0';updateRange($('seek'),0,1);
  document.title = `${track.title} · filisimusic`;
  if ('mediaSession' in navigator && 'MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({title:track.title,artist:'filisimusic · AI 辅助器乐',album:groupLabels[track.group]});
}
async function requestPlay() {
  if (!state.current) return;
  const generation = state.generation;
  state.wantsPlay = true;
  hideNotice();
  try {
    const promise = audio.play();
    if (audio.readyState < 3) showNotice(`正在加载《${state.current.title}》…`);
    await promise;
    if (generation !== state.generation) return;
    if (!state.wantsPlay) { audio.pause(); return; }
    hideNotice();updatePlayingUI();
  } catch (error) {
    if (generation !== state.generation || !state.wantsPlay || error.name === 'AbortError') return;
    state.wantsPlay = false;
    showNotice(error.name === 'NotAllowedError' ? '浏览器暂停了自动播放。请再按一次播放键。' : '这首暂时没有播放成功。请检查网络后重试。',true);
    updatePlayingUI();
  }
}
function selectTrack(id, play = true, queue = null) {
  const track = state.tracks.find(item => item.id === id);if (!track) return;
  if (state.current?.id === id) { if (play) togglePlayback();return; }
  state.generation++;state.wantsPlay = false;audio.pause();hideNotice();
  state.current = track;
  if (queue?.length) state.queue = [...queue];
  else if (!state.queue.includes(id)) state.queue = state.tracks.map(item => item.id);
  audio.src = track.src;audio.load();
  updatePlayerTrack(track);updatePlayingUI();
  announce(`已选择《${track.title}》`);
  if (play) requestPlay();
}
function togglePlayback() {
  if (!state.current) { if (state.tracks.length) selectTrack(state.tracks[0].id,true,state.tracks.map(track=>track.id));return; }
  if (!audio.paused || state.wantsPlay) { state.wantsPlay = false;audio.pause();hideNotice();updatePlayingUI(); }
  else { if (audio.error) { state.generation++;audio.load(); } requestPlay(); }
}
function advance(direction = 1, automatic = false) {
  if (!state.current || !state.queue.length) return;
  if (direction < 0 && audio.currentTime > 3) { audio.currentTime = 0;updateProgress();return; }
  const id = nextTrackId(state.queue,state.current.id,direction,!automatic);
  if (!id) { state.wantsPlay = false;updatePlayingUI();showNotice('这一组听完了。再去发现下一段旋律吧。',false,true);return; }
  if (id === state.current.id) { audio.currentTime=0;requestPlay();return; }
  selectTrack(id,true);
}
function chooseRandom() {
  const candidates = state.filtered.filter(track => track.id !== state.current?.id);
  const tracks = candidates.length ? candidates : state.filtered;
  if (!tracks.length) return;
  selectTrack(tracks[Math.floor(Math.random()*tracks.length)].id,true,state.filtered.map(track=>track.id));
}
function openDetails(id) {
  const track = state.tracks.find(item => item.id === id);if (!track) return;
  const revisions = (track.revisions || []).map(revision => `<div class="revision-row"><strong>${esc(revision.version)}</strong><span>${esc(revision.text)}</span></div>`).join('');
  const sections = (track.sections || []).map(section => `<span class="section-chip">${esc(typeof section === 'string' ? section : section.label)}</span>`).join('');
  const verifiedText = track.reaperVerified ? '已核验 REAPER 导出' : '导出状态见工程说明';
  $('dialog-content').innerHTML = `<div class="dialog-header"><div class="dialog-art">${artwork(track,true)}</div><div class="dialog-heading"><p class="eyebrow">NO. ${String(track.order+1).padStart(2,'0')} / ${esc(groupLabels[track.group])}</p><h2 id="dialog-title">${esc(track.title)}</h2><p class="english-title" lang="en">${esc(track.titleEn)}</p><button class="button button-ink" id="dialog-play" data-id="${esc(track.id)}"><span class="play-symbol" aria-hidden="true"></span>聆听这首</button></div></div><div class="dialog-body"><dl class="track-facts"><div><dt>时长</dt><dd>${formatTime(track.durationSeconds)}</dd></div><div><dt>速度</dt><dd>${esc(track.bpm)} BPM</dd></div><div><dt>拍号</dt><dd>${esc(track.meterLabel || `${track.meter}/4`)}</dd></div><div><dt>最终版本</dt><dd>${esc(track.finalVersion)}</dd></div></dl><section class="story-block"><h3>这首歌怎么来的</h3><p>${esc(track.story)}</p>${track.compositionNotes ? `<p>${esc(track.compositionNotes)}</p>` : ''}</section>${sections ? `<section class="story-block"><h3>沿着结构听一遍</h3><div class="section-map">${sections}</div><p>段落名称取自制作乐谱，保留原始命名。</p></section>` : ''}<section class="story-block"><h3>从草稿到定稿</h3><p>草稿后进行了 ${esc(track.revisionLabel)}。${esc(verifiedText)}，共 ${esc(track.reaperVersions || Number(track.revisionRounds)+1)} 个实际导出版本。</p>${revisions ? `<div class="revision-list">${revisions}</div>` : ''}</section><section class="download-box"><h3>把工程也带走</h3><p>${esc(track.projectDisclosure || '这是可再生成源文件包，未附现成音频分轨。先按包内 README 安装依赖、生成音频素材，再在 REAPER 中打开工程。')}</p><div class="download-links"><a class="button button-ink" href="${esc(track.project)}" download="${esc(track.id)}-reaper-source.zip">下载工程源文件 <span aria-hidden="true">↓</span></a><a class="button button-outline" href="${esc(track.src)}" download="${esc(track.id)}.mp3">下载 MP3 <span aria-hidden="true">↓</span></a></div>${track.sha256 ? `<p class="integrity-note">MP3 SHA-256: ${esc(track.sha256)}</p>` : ''}</section><p class="qa-disclosure">AI 辅助创作 · 程序合成音色 · 器乐作品。${esc(track.qaSummary || '技术检查不等于听感评价。')} 尚未完成逐曲完整人工听审。故事与修改说明依据制作记录整理，不是个人经历的记述。</p></div>`;
  $('dialog-play').addEventListener('click',()=>selectTrack(track.id,true,state.filtered.some(item=>item.id===track.id) ? state.filtered.map(item=>item.id) : state.tracks.map(item=>item.id)));
  updatePlayingUI();
  if (!$('track-dialog').open) $('track-dialog').showModal();
  $('track-dialog').scrollTop = 0;
}
function setFilters() { state.limit=PAGE_SIZE;renderTracks(); }
async function loadCatalog() {
  const generation = ++state.catalogGeneration;
  $('catalog-error').hidden=true;$('track-grid').setAttribute('aria-busy','true');
  $('results-count').textContent='正在整理唱片架…';
  try {
    const response = await fetch('data/catalog.json',{cache:'no-cache'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = validateCatalog(await response.json());
    if (generation !== state.catalogGeneration) return;
    state.tracks = catalog.tracks.map((track,index)=>({...track,order:index}));
    const styles = [...new Set(state.tracks.map(track=>track.genre))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    $('style-filter').innerHTML='<option value="all">所有风格</option>'+styles.map(style=>`<option value="${esc(style)}">${esc(style)}</option>`).join('');
    $('stat-count').textContent=String(state.tracks.length);$('all-count').textContent=String(state.tracks.length);
    $('stat-duration').textContent=String(Math.round(state.tracks.reduce((total,track)=>total+track.durationSeconds,0)/60));
    $('start-listening').disabled=false;$('random-track').disabled=false;
    renderTracks();
    const requestedTrack = new URLSearchParams(location.search).get('track');
    if (requestedTrack && state.tracks.some(track=>track.id===requestedTrack)) selectTrack(requestedTrack,false,state.tracks.map(track=>track.id));
  } catch(error) {
    if (generation !== state.catalogGeneration) return;
    $('track-grid').innerHTML='';$('track-grid').setAttribute('aria-busy','false');$('catalog-error').hidden=false;
    $('results-count').textContent='曲目暂时无法加载';
    console.error('Catalog could not load:',error.message);
  }
}
$('track-grid').addEventListener('click',event=>{
  const play = event.target.closest('[data-play]');const detail = event.target.closest('[data-details]');
  if(play) selectTrack(play.dataset.play,true,state.filtered.map(track=>track.id));
  else if(detail) openDetails(detail.dataset.details);
});
$('start-listening').addEventListener('click',()=>{if(state.current) togglePlayback();else if(state.tracks.length) selectTrack(state.tracks[0].id,true,state.tracks.map(track=>track.id));});
$('random-track').addEventListener('click',chooseRandom);
$('player-details').addEventListener('click',()=>{if(state.current)openDetails(state.current.id);});
$('play-pause').addEventListener('click',togglePlayback);$('previous').addEventListener('click',()=>advance(-1));$('next').addEventListener('click',()=>advance(1));
$('retry-audio').addEventListener('click',()=>{if(state.current){state.generation++;audio.load();requestPlay();}});$('dismiss-notice').addEventListener('click',hideNotice);
$('search').addEventListener('input',event=>{state.query=event.target.value;setFilters();});
$('style-filter').addEventListener('change',event=>{state.style=event.target.value;setFilters();});
$('sort').addEventListener('change',event=>{state.sort=event.target.value;setFilters();});
document.querySelectorAll('[data-group]').forEach(button=>button.addEventListener('click',()=>{state.group=button.dataset.group;setFilters();}));
$('clear-filters').addEventListener('click',()=>{state.group='all';state.style='all';state.query='';$('search').value='';$('style-filter').value='all';setFilters();$('search').focus();});
$('load-more').addEventListener('click',()=>{const previousCount=Math.min(state.limit,state.filtered.length);state.limit+=PAGE_SIZE;renderTracks();const firstNew=$('track-grid').children[previousCount]?.querySelector('button');firstNew?.focus({preventScroll:true});announce(`现在显示 ${Math.min(state.limit,state.filtered.length)} 首作品`);});
$('retry-catalog').addEventListener('click',loadCatalog);
$('close-dialog').addEventListener('click',()=>$('track-dialog').close());
$('keyboard-help').addEventListener('click',()=>$('help-dialog').showModal());
for(const dialog of [$('track-dialog'),$('help-dialog')]) dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)dialog.close();}});
$('seek').addEventListener('input',event=>{state.seeking=true;$('elapsed').textContent=formatTime(event.target.value);event.target.setAttribute('aria-valuetext',timeLabel(event.target.value));updateRange(event.target,Number(event.target.value),Number(event.target.max));});
function commitSeek(){if(state.seeking && Number.isFinite(audio.duration)){audio.currentTime=clamp(Number($('seek').value),0,audio.duration);}state.seeking=false;updateProgress();}
$('seek').addEventListener('change',commitSeek);$('seek').addEventListener('blur',commitSeek);
function updateVolume(){const volume=audio.muted?0:audio.volume;$('volume').value=String(volume);$('volume').setAttribute('aria-valuetext',`${Math.round(volume*100)}%`);updateRange($('volume'),volume,1);$('mute').setAttribute('aria-label',volume===0?'取消静音':'静音');$('mute').setAttribute('aria-pressed',String(volume===0));$('mute').title=volume===0?'取消静音':'静音';}
try{const saved=localStorage.getItem('filisimusic-volume');audio.volume=saved!==null&&Number.isFinite(Number(saved))?clamp(Number(saved),0,1):.75;}catch{audio.volume=.75;}
$('volume').addEventListener('input',event=>{audio.muted=false;audio.volume=Number(event.target.value);updateVolume();try{localStorage.setItem('filisimusic-volume',String(audio.volume));}catch{}});
$('mute').addEventListener('click',()=>{if(audio.volume===0){audio.volume=.75;audio.muted=false;}else audio.muted=!audio.muted;updateVolume();});
audio.addEventListener('volumechange',updateVolume);updateVolume();
audio.addEventListener('timeupdate',updateProgress);audio.addEventListener('loadedmetadata',updateProgress);audio.addEventListener('durationchange',updateProgress);
for(const event of ['play','pause','ended'])audio.addEventListener(event,updatePlayingUI);
audio.addEventListener('playing',()=>{if(state.wantsPlay)hideNotice();else audio.pause();});
audio.addEventListener('waiting',()=>{if(state.wantsPlay)showNotice('正在缓冲，稍等一下…');});
audio.addEventListener('ended',()=>advance(1,true));
audio.addEventListener('error',()=>{if(!state.current||!audio.error)return;state.wantsPlay=false;updatePlayingUI();const code=audio.error?.code;showNotice(code===3?'音频没有正确解码。请重试，或下载 MP3 本地播放。':code===4?'音频暂时不可用。请稍后重试，或下载 MP3 本地播放。':'音频加载中断了。请检查网络后重试。',true);});
document.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||event.repeat||document.querySelector('dialog[open]'))return;
  if(event.target.closest('input,textarea,select,button,a,[contenteditable="true"]'))return;
  if(event.code==='Space'){event.preventDefault();togglePlayback();}
  else if(event.key.toLowerCase()==='n'){event.preventDefault();advance(1);}
  else if(event.key.toLowerCase()==='p'){event.preventDefault();advance(-1);}
  else if((event.key==='ArrowLeft'||event.key==='ArrowRight')&&state.current&&Number.isFinite(audio.duration)){event.preventDefault();audio.currentTime=clamp(audio.currentTime+(event.key==='ArrowRight'?5:-5),0,audio.duration);updateProgress();}
});
if('mediaSession'in navigator){const handlers={play:requestPlay,pause:()=>{state.wantsPlay=false;audio.pause();hideNotice();},previoustrack:()=>advance(-1),nexttrack:()=>advance(1),seekbackward:details=>{if(Number.isFinite(audio.duration))audio.currentTime=clamp(audio.currentTime-(details.seekOffset||5),0,audio.duration);},seekforward:details=>{if(Number.isFinite(audio.duration))audio.currentTime=clamp(audio.currentTime+(details.seekOffset||5),0,audio.duration);},seekto:details=>{if(Number.isFinite(audio.duration))audio.currentTime=clamp(details.seekTime,0,audio.duration);}};for(const[action,handler]of Object.entries(handlers)){try{navigator.mediaSession.setActionHandler(action,handler);}catch{}}}
loadCatalog();
