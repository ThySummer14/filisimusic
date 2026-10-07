#!/usr/bin/env python3
"""Verify public data, every media hash, source ZIP CRCs, and static resources."""
import hashlib
import json
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ERRORS=[]
def check(ok,message):
    if not ok: ERRORS.append(message)
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1<<20),b''):h.update(b)
    return h.hexdigest()
catalog=json.loads((ROOT/'data/catalog.json').read_text())
source=json.loads((ROOT/'data/source-catalog.json').read_text())
manifest=json.loads((ROOT/'data/assets-manifest.json').read_text())
tracks=catalog['tracks']
versions=[version for track in tracks for version in [track,*track.get('alternatives',[])]]
check(catalog['completedCount']==len(tracks),'Catalog count differs')
check(len(tracks)==len(source['tracks']),'Public/source catalog mismatch')
check(catalog.get('playableVersionCount',len(tracks))==len(versions),'Playable version count differs')
check(len(manifest['files'])==len(versions)*2,'Asset manifest count differs')
check(len({t['id'] for t in tracks})==len(tracks),'Duplicate IDs')
check(len({t['id'] for t in versions})==len(versions),'Duplicate version IDs')
check(len({a['path'] for a in manifest['files']})==len(manifest['files']),'Duplicate asset paths')
for asset in manifest['files']:
    path=ROOT/asset['path']
    check(path.is_file(),f"Missing: {asset['path']}")
    if not path.is_file():continue
    check(path.stat().st_size==asset['bytes'],f"Size mismatch: {path.name}")
    check(digest(path)==asset['sha256'],f"Hash mismatch: {path.name}")
    check(path.stat().st_size<100*1024*1024,f'Asset too large for ordinary Git: {path.name}')
for t in tracks:
    check(t['revisions'] and len(t['revisions'])==t['revisionRounds'],f"Revision note mismatch: {t['id']}")
    original=next((x for x in source['tracks'] if x['id']==t['id']),None)
    check(original is not None,f"Missing source track: {t['id']}")
    for version in [t,*t.get('alternatives',[])]:
        raw=original if version is t else next((x for x in original.get('alternatives',[]) if x['id']==version['id']),None)
        check(raw is not None,f"Missing source version: {version['id']}")
        if raw:
            check(version['reaperVersions']==raw['qa']['actualReaperVersions'],f"REAPER export count differs: {version['id']}")
            if raw.get('collection')=='story-collection-20261006':
                check(raw['qa']['finitePcm'] and raw['qa']['clippedSamples']==0,f"PCM verification failed: {version['id']}")
            check(version['sha256']==raw['audio']['sha256'],f"Source audio hash differs: {version['id']}")
            check(version['projectSha256']==raw['engineering']['sha256'],f"Source project hash differs: {version['id']}")
        if version is not t:
            check(version['sameComposition'] and version['baselineVersion']==t['finalVersion'],f"Wrong variant baseline: {version['id']}")
            check(bool(version['changesZh']),f"Missing version comparison: {version['id']}")
for t in versions:
    check(t['src']==f"audio/{t['id']}.mp3",f"Noncanonical MP3: {t['id']}")
    check(t['project']==f"projects/{t['id']}.zip",f"Noncanonical ZIP: {t['id']}")
    check(t['reaperVerified'] and t['reaperVersions']>=(2 if t.get('collection')=='story-collection-20261006' else 3),f"Unverified track: {t['id']}")
    with zipfile.ZipFile(ROOT/t['project']) as z:
        check(z.testzip() is None,f"ZIP CRC failed: {t['id']}")
        for member in z.infolist():
            check(not member.filename.startswith('/') and '..' not in Path(member.filename).parts,f"Unsafe archive member: {member.filename}")
            if Path(member.filename).suffix in ['.json','.py','.md','.txt','.rpp']:
                text=z.read(member).decode('utf8',errors='replace')
                check(not re.search(r'/workspace/|/root/|libfile_|file_0{5}',text),f"Private data in ZIP: {t['id']}/{member.filename}")
for path in (ROOT/'data').glob('*.json'):
    text=path.read_text()
    check(not re.search(r'/workspace/|/root/|libfile_|file_0{5}|https?://[^\s"<>]*(?:blob\.core|oaiusercontent|amazonaws)',text),f'Private data in public JSON: {path.name}')
class Resources(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for key,value in attrs:
            if key in ['src','href'] and value and not value.startswith(('#','https:','http:','data:')):
                check((ROOT/value).exists(),f'Missing static resource: {value}')
Resources().feed((ROOT/'index.html').read_text())
check((ROOT/'.nojekyll').is_file(),'.nojekyll missing')
check(not (ROOT/'assets.local.json').exists(),'Private local map must not be published')
check(sum(a['bytes'] for a in manifest['files'])<1_000_000_000,'Site media exceeds budget')
if ERRORS:
    print('\n'.join(ERRORS));raise SystemExit(1)
print(f"PASS: {len(tracks)} tracks / {len(versions)} playable versions, {len(manifest['files'])} SHA-256 verified resources, all ZIP CRCs, relative URLs and privacy checks.")
