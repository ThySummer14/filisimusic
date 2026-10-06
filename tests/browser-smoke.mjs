/** Optional integration test. Requires Playwright and an installed Chromium.
 * Browser sandboxing remains enabled. Screenshots/reports go outside the site.
 */
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.QA_OUTPUT||path.join(root,'qa-output');fs.mkdirSync(output,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.mp3':'audio/mpeg','.zip':'application/zip'};
const server=createServer((request,response)=>{
  const relative=decodeURIComponent(new URL(request.url,'http://localhost').pathname).replace(/^\/filisimusic\//,'');
  const file=path.resolve(root,relative||'index.html');
  if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
  try{const stats=fs.statSync(file);if(!stats.isFile())throw new Error('Not file');
    const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store'};
    const range=/bytes=(\d+)-(\d*)/.exec(request.headers.range||'');
    if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):stats.size-1,stats.size-1);if(start>end){response.writeHead(416).end();return;}response.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${stats.size}`});fs.createReadStream(file,{start,end}).pipe(response);}
    else{response.writeHead(200,{...headers,'Content-Length':stats.size});fs.createReadStream(file).pipe(response);}
  }catch{response.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/filisimusic/`;
let browser;const results=[];const errors=[];const media=[];
function passed(name){results.push({name,status:'passed'});console.log('PASS',name);}
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',chromiumSandbox:true,args:['--renderer-process-limit=2']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().endsWith('.mp3'))media.push(request.url());});
  await page.goto(url,{waitUntil:'networkidle'});await page.waitForSelector('.track-card');
  assert.equal(await page.locator('.track-card').count(),12);assert.equal(await page.locator('#stat-count').innerText(),String(catalog.tracks.length));assert.equal(media.length,0);passed('Initial catalog, 12-card pagination, zero eager audio requests at GitHub Pages base path');
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);passed('Desktop layout has no horizontal overflow');
  await page.locator('#search').fill('no-such-track');await page.waitForSelector('#empty-state:not([hidden])');assert.equal(await page.locator('.track-card').count(),0);await page.locator('#clear-filters').click();assert.equal(await page.locator('.track-card').count(),12);passed('Search empty state and recovery');
  await page.locator('[data-group="electronic"]').click();assert.equal(await page.locator('.track-card').count(),Math.min(12,catalog.tracks.filter(t=>t.group==='electronic').length));
  await page.locator('#style-filter').selectOption('氛围');assert.equal(await page.locator('.track-card').count(),catalog.tracks.filter(t=>t.group==='electronic'&&t.genre==='氛围').length);passed('Series and style filters intersect');
  await page.locator('#style-filter').selectOption('all');await page.locator('[data-group="all"]').click();await page.locator('#sort').selectOption('duration-asc');assert.equal(await page.locator('.track-card').first().getAttribute('data-track-id'),[...catalog.tracks].sort((a,b)=>a.durationSeconds-b.durationSeconds)[0].id);await page.locator('#sort').selectOption('original');passed('Duration sorting');
  await page.locator('#load-more').click();assert.equal(await page.locator('.track-card').count(),24);passed('Load more expands real tracks');
  await page.locator('.track-title').first().click();await page.waitForSelector('#track-dialog[open]');assert.ok((await page.locator('#dialog-content').innerText()).includes('不含现成音频分轨'));await page.keyboard.press('Escape');assert.equal(await page.locator('#track-dialog').getAttribute('open'),null);passed('Source disclosure, native dialog and Escape close');
  await page.locator('[data-play]').first().click();await page.waitForFunction(()=>document.querySelector('audio').currentTime>.2,{timeout:15000});assert.equal(await page.locator('#player-title').innerText(),catalog.tracks[0].title);passed('Real MP3 decoding and advancing playback');
  await page.locator('#play-pause').click();assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);
  await page.locator('#seek').evaluate(slider=>{slider.value='30';slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));});assert.ok(Math.abs(await page.locator('audio').evaluate(a=>a.currentTime)-30)<.5);passed('Pause and seeking');
  await page.locator('#volume').evaluate(slider=>{slider.value='.2';slider.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.locator('audio').evaluate(a=>a.volume),.2);await page.locator('#mute').click();assert.equal(await page.locator('audio').evaluate(a=>a.muted),true);await page.locator('#mute').click();passed('Volume and mute');
  await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('Space');await page.waitForFunction(()=>!document.querySelector('audio').paused);await page.keyboard.press('ArrowRight');assert.ok(await page.locator('audio').evaluate(a=>a.currentTime)>34);await page.keyboard.press('Space');passed('Keyboard playback and 5-second seek');
  await page.locator('#next').click();await page.waitForFunction(()=>document.querySelector('audio').currentTime>.1);assert.equal(await page.locator('#player-title').innerText(),catalog.tracks[1].title);passed('Next track uses selection queue');
  await page.locator('[data-play]').evaluateAll(buttons=>{buttons[0].click();buttons[2].click();buttons[3].click();});await page.waitForFunction(()=>document.querySelector('audio').currentTime>.1);assert.equal(await page.locator('#player-title').innerText(),catalog.tracks[3].title);assert.ok((await page.locator('audio').getAttribute('src')).includes(catalog.tracks[3].id));passed('Rapid play selection resolves to the latest track');
  await page.locator('#play-pause').click();
  // A failed audio request must leave an actionable retry, then recover without reloading the page.
  const failed=catalog.tracks[4];await page.route(`**/audio/${failed.id}.mp3`,route=>route.abort('failed'));
  await page.locator(`[data-play="${failed.id}"]`).click();await page.waitForSelector('#retry-audio:not([hidden])');await page.unroute(`**/audio/${failed.id}.mp3`);await page.locator('#retry-audio').click();await page.waitForFunction(()=>document.querySelector('audio').currentTime>.1);passed('Network audio failure and successful explicit retry');
  await page.locator('#play-pause').click();
  await page.locator('#search').fill('不存在的搜索');await page.locator('#search').press('Space');assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);await page.locator('#clear-filters').click();passed('Typing does not trigger global keyboard playback');
  await page.locator('.track-title').first().click();const downloadPromise=page.waitForEvent('download');await page.locator('.download-links a').first().click();const download=await downloadPromise;assert.ok(download.suggestedFilename().endsWith('.zip'));await page.locator('#close-dialog').click();passed('Engineering ZIP download works');
  const versioned=catalog.tracks.find(track=>track.alternatives?.length);
  if(versioned){
    const alternative=versioned.alternatives[0];
    await page.locator('#search').fill(versioned.title);assert.equal(await page.locator('.track-card').count(),1);
    await page.locator('.track-title').click();assert.equal(await page.locator('#version-select').inputValue(),versioned.id);
    await page.locator('#dialog-play').click();await page.waitForFunction(()=>document.querySelector('audio').currentTime>.1);
    await page.locator('#version-select').focus();await page.locator('#version-select').selectOption(alternative.id);
    await page.waitForFunction(id=>document.querySelector('audio').getAttribute('src')===`audio/${id}.mp3`&&document.querySelector('audio').currentTime>.1,alternative.id);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'version-select');
    assert.equal(await page.locator('#download-audio').getAttribute('href'),alternative.src);
    assert.equal(await page.locator('#download-project').getAttribute('href'),alternative.project);
    assert.ok((await page.locator('#player-subtitle').innerText()).includes(alternative.labelZh));
    await page.locator('#dialog-play').click();await page.locator('#version-select').selectOption(versioned.id);
    assert.equal(await page.locator('audio').evaluate(a=>a.paused),true);assert.equal(await page.locator('audio').getAttribute('src'),versioned.src);
    await page.locator('#close-dialog').click();await page.locator('#search').fill('');
    passed('One composition card, original default, version playback switch, correct downloads, retained keyboard focus and paused switch');
  }
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,'desktop-playing.png'),fullPage:false});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.track-card').count(),12);passed('390px mobile layout, persistent player and no horizontal overflow');
  await page.locator('.track-title').first().click();assert.equal(await page.locator('#track-dialog').evaluate(d=>d.scrollWidth>d.clientWidth),false);await page.screenshot({path:path.join(output,'mobile-story.png'),fullPage:false});await page.keyboard.press('Escape');passed('Mobile creation-story dialog fits viewport');
  // Validate failed catalog recovery in the same supported browser, one page at a time.
  await page.route('**/data/catalog.json',route=>route.fulfill({status:503,body:'unavailable'}));await page.reload();await page.waitForSelector('#catalog-error:not([hidden])');await page.unroute('**/data/catalog.json');await page.locator('#retry-catalog').click();await page.waitForSelector('.track-card');passed('Catalog failure and recovery');
  assert.deepEqual(errors,[]);passed('No uncaught browser JavaScript errors');
  fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify({status:'passed',url,checks:results,uncaughtErrors:errors,audioAudition:false,playbackVerified:true},null,2));
}catch(error){fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify({status:'failed',checks:results,uncaughtErrors:errors,error:String(error)},null,2));throw error;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
