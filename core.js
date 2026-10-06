/** Pure functions shared by the player and its dependency-free tests. */
export const PAGE_SIZE = 12;
export function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
export function formatTime(seconds) {
  const value = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(Number(seconds))) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
export function timeLabel(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)} 分 ${value % 60} 秒`;
}
export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
/** Versions stay attached to one composition; the original remains the default. */
export function trackVersions(track) {
  return [{id:track.id,version:track.finalVersion,labelZh:'原版（默认）',primary:true,
    src:track.src,project:track.project,durationSeconds:track.durationSeconds,
    sha256:track.sha256,projectSha256:track.projectSha256,qaSummary:track.qaSummary},
    ...(track.alternatives || []).map(version=>({...version,primary:false}))];
}
export function trackVersion(track, id = track.id) { return trackVersions(track).find(version=>version.id===id) || null; }
export function playableVersionCount(tracks) { return tracks.reduce((total,track)=>total+1+(track.alternatives?.length || 0),0); }
export function validateCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.tracks) || !catalog.tracks.length) throw new Error('Catalog has no tracks.');
  const ids = new Set();
  for (const track of catalog.tracks) {
    if (!/^[a-z0-9_\-]+$/.test(track.id) || ids.has(track.id)) throw new Error('Invalid or duplicate track ID.');
    ids.add(track.id);
    if (!track.title || !Number.isFinite(track.durationSeconds) || track.durationSeconds <= 0) throw new Error('Invalid track metadata.');
    if (track.src !== `audio/${track.id}.mp3` || track.project !== `projects/${track.id}.zip`) throw new Error('Track resources must use canonical relative paths.');
    if (!['acoustic','electronic','sketch'].includes(track.group)) throw new Error('Invalid collection group.');
    if (track.alternatives !== undefined && !Array.isArray(track.alternatives)) throw new Error('Invalid alternatives.');
    for (const alternative of track.alternatives || []) {
      if (!/^[a-z0-9_\-]+$/.test(alternative.id) || ids.has(alternative.id)) throw new Error('Invalid or duplicate version ID.');
      ids.add(alternative.id);
      if (alternative.sameComposition !== true || alternative.baselineVersion !== track.finalVersion || !alternative.version || !alternative.labelZh) throw new Error('Alternative must identify its original composition.');
      if (!Number.isFinite(alternative.durationSeconds) || alternative.durationSeconds <= 0) throw new Error('Invalid alternative duration.');
      if (alternative.src !== `audio/${alternative.id}.mp3` || alternative.project !== `projects/${alternative.id}.zip`) throw new Error('Version resources must use canonical relative paths.');
      if (!Array.isArray(alternative.changesZh) || !alternative.changesZh.length || alternative.changesZh.some(text=>typeof text!=='string')) throw new Error('Alternative needs documented changes.');
    }
  }
  if (catalog.playableVersionCount !== undefined && catalog.playableVersionCount !== playableVersionCount(catalog.tracks)) throw new Error('Playable version count differs.');
  return catalog;
}
export function getFilteredTracks(tracks, {group = 'all', style = 'all', query = '', sort = 'original'} = {}) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  const result = tracks.filter(track => {
    if (group !== 'all' && track.group !== group) return false;
    if (style !== 'all' && track.genre !== style) return false;
    const text = `${track.title} ${track.titleEn} ${track.style} ${track.genre} ${track.story} ${(track.revisions || []).map(r => r.text).join(' ')}`.toLocaleLowerCase();
    return words.every(word => text.includes(word));
  });
  if (sort === 'duration-desc') result.sort((a,b) => b.durationSeconds-a.durationSeconds);
  if (sort === 'duration-asc') result.sort((a,b) => a.durationSeconds-b.durationSeconds);
  if (sort === 'title') result.sort((a,b) => a.title.localeCompare(b.title, 'zh-CN'));
  return result;
}
export function nextTrackId(queue, currentId, direction = 1, wrap = true) {
  if (!queue.length) return null;
  const index = queue.indexOf(currentId);
  if (index === -1) return queue[0];
  const next = index + direction;
  if (!wrap && (next < 0 || next >= queue.length)) return null;
  return queue[(next + queue.length) % queue.length];
}
export function genreForStyle(style) {
  const text = style.toLowerCase();
  const entries = [
    [/neo.?soul/,'Neo-soul'],[/bossa/,'Bossa nova'],[/jazz|swing/,'爵士'],[/piano/,'钢琴'],[/chamber|waltz|strings/,'室内乐'],[/pentatonic|chinese/,'五声音阶'],[/post.?rock/,'后摇'],[/drum.*bass|dnb/,'Drum & bass'],[/synthwave/,'Synthwave'],[/ambient/,'氛围'],[/house/,'House'],[/trip.?hop/,'Trip-hop'],[/downtempo/,'Downtempo'],[/lo.?fi/,'Lo-fi'],[/break/,'Breakbeat'],[/disco|funk/,'Funk / disco'],[/electro|techno/,'电子']
  ];
  return entries.find(([pattern]) => pattern.test(text))?.[1] || '其他器乐';
}
const palettes = [
  ['#9bad96','#e8e3bf','#3d594a','#c7d0a3'],['#455b5c','#d8af83','#99aca0','#28433f'],['#ba886b','#ecd9b3','#744c39','#d9ae82'],['#7e8e9e','#e7d8bb','#465569','#b6c3bf'],['#ada984','#e4dcb7','#626b4e','#cebd8d'],['#7d8a77','#d2d8b5','#455447','#acb496'],['#b79281','#e9d2bc','#74524e','#d4ad98'],['#738583','#d6e0c6','#3f6058','#a8b9a8']
];
/** Original geometric cover art, not a measured audio waveform. */
export function artwork(track, square = false) {
  let hash = 0; for (const character of track.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const [background,light,dark,mid] = palettes[hash % palettes.length];
  const type = hash % 4;
  let shapes = '';
  if (type === 0) {
    shapes = `<circle cx="280" cy="125" r="130" fill="${dark}"/><circle cx="280" cy="125" r="97" fill="none" stroke="${mid}" stroke-width="1"/><circle cx="280" cy="125" r="84" fill="none" stroke="${mid}" stroke-width="1"/><circle cx="280" cy="125" r="70" fill="none" stroke="${mid}" stroke-width="1"/><circle cx="280" cy="125" r="48" fill="${light}"/><circle cx="280" cy="125" r="5" fill="${dark}"/><path d="M-20 220 186 14" stroke="${light}" stroke-width="38" opacity=".65"/>`;
  } else if (type === 1) {
    shapes = `<circle cx="285" cy="65" r="47" fill="${light}"/><path d="M-20 174q105-96 220 3t240-6v110H-20Z" fill="${mid}"/><path d="M-20 207q90-110 220-8t240-15v100H-20Z" fill="${dark}"/>`;
    for(let i=0;i<8;i++) shapes += `<path d="M${115+i*13} -10v260" stroke="${light}" stroke-width="1" opacity=".24"/>`;
  } else if(type === 2) {
    shapes = `<path d="M225 250V74a74 74 0 0 1 148 0v176" fill="${dark}"/><path d="M249 250V78a50 50 0 0 1 100 0v172" fill="${light}"/><path d="M95 250V104a52 52 0 0 1 104 0v146" fill="${mid}"/><path d="M111 250V104a36 36 0 0 1 72 0v146" fill="${dark}"/><path d="M0 210H420M0 224H420M0 239H420" stroke="${background}" stroke-width="1"/>`;
  } else {
    shapes = `<circle cx="267" cy="120" r="88" fill="${light}"/><path d="M200 -20 67 270H172L305-20Z" fill="${dark}"/><path d="M332 -20 199 270H240L373-20Z" fill="${mid}"/>`;
    for(let i=0;i<7;i++) shapes += `<path d="M${352+i*10} 0 ${237+i*10} 250" stroke="${light}" stroke-width="1" opacity=".5"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${square ? '80 0 250 250':'0 0 420 250'}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="420" height="250" fill="${background}"/>${shapes}<path d="M0 0H420V250H0Z" fill="none" stroke="${light}" stroke-opacity=".12" stroke-width="2"/></svg>`;
}
