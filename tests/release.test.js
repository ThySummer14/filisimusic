import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/catalog.json',import.meta.url)));
const source=JSON.parse(fs.readFileSync(new URL('../data/source-catalog.json',import.meta.url)));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('published54-work baseline is preserved exactly',()=>{assert.equal(hash(catalog.tracks.slice(0,54)),'6ecf0f80496036f23bdb2644e590eb421c94ecee0bd9ac5717b47418d65d1b99');assert.equal(hash(source.tracks.slice(0,54)),'d35358510d8b61a1c3a483c80a5ad2aa05964a202fb0a2549b525248913b2549');});
test('release adds approved051v6 and056–100 only',()=>{assert.equal(catalog.tracks.length,100);assert.equal(catalog.playableVersionCount,101);assert.deepEqual(catalog.tracks.slice(54).map(t=>Number(t.id.split('_')[1])),[51,...Array.from({length:45},(_,i)=>i+56)]);assert.equal(catalog.tracks.find(t=>t.id.startsWith('story_051_')).finalVersion,'v6');});
