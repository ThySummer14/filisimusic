#!/usr/bin/env python3
"""Import an approved, sanitized catalog and its private local asset map.
The private map is an input only and is never copied into the repository.
"""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENRES = [
    (r'neo.?soul', 'Neo-soul'), (r'bossa', 'Bossa nova'), (r'jazz|swing', '爵士'),
    (r'piano', '钢琴'), (r'chamber|waltz|strings|string trio', '室内乐'),
    (r'pentatonic|chinese', '五声音阶'), (r'post.?rock', '后摇'),
    (r'drum.*bass|dnb', 'Drum & bass'), (r'synthwave', 'Synthwave'),
    (r'ambient', '氛围'), (r'house', 'House'), (r'trip.?hop', 'Trip-hop'),
    (r'downtempo', 'Downtempo'), (r'lo.?fi', 'Lo-fi'), (r'break', 'Breakbeat'),
    (r'disco|funk', 'Funk / disco'), (r'electro|techno', '电子')]

def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1 << 20), b''):
            digest.update(block)
    return digest.hexdigest()

def genre(style):
    for pattern, label in [(r'ambient','氛围'),(r'pentatonic','五声音阶'),(r'post.?rock','后摇'),(r'drum.*bass|dnb','Drum & bass')]:
        if re.search(pattern, style, re.I):
            return label
    return next((label for pattern, label in GENRES if re.search(pattern, style, re.I)), '其他器乐')

def reject_private(text):
    patterns = [r'/workspace/', r'/root/', r'libfile_', r'file_0{5}', r'https?://[^\s"<>]*(?:blob\.core|oaiusercontent|amazonaws)', r'-----BEGIN [A-Z ]*PRIVATE KEY']
    for pattern in patterns:
        if re.search(pattern, text):
            raise ValueError(f'Unexpected private value matched: {pattern}')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--asset-map', type=Path, required=True)
    parser.add_argument('--editorial', type=Path, default=ROOT/'data/editorial.zh.json')
    args = parser.parse_args()
    raw_text = args.catalog.read_text(encoding='utf-8')
    reject_private(raw_text)
    source = json.loads(raw_text)
    local_assets = json.loads(args.asset_map.read_text(encoding='utf-8'))['assets']
    editorial = json.loads(args.editorial.read_text(encoding='utf-8')) if args.editorial.exists() else {}
    tracks, inventory = [], []
    copied_ids = set()
    def copy_assets(song_id):
        if not re.fullmatch(r'[a-z0-9_-]+', song_id) or song_id in copied_ids:
            raise ValueError('Invalid or duplicate song/version ID')
        copied_ids.add(song_id)
        copied = {}
        for kind, directory, suffix in [('mp3','audio','mp3'),('project','projects','zip')]:
            item = local_assets[song_id][kind]
            source_path = Path(item['localPath'])
            if source_path.stat().st_size != item['bytes'] or sha256(source_path) != item['sha256']:
                raise ValueError(f'Source asset differs from approved manifest: {song_id}/{kind}')
            dest = ROOT/directory/f'{song_id}.{suffix}'
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists() or sha256(dest) != item['sha256']:
                shutil.copyfile(source_path, dest)
            if sha256(dest) != item['sha256']:
                raise ValueError(f'Copy integrity check failed: {dest.name}')
            copied[kind] = {'path':dest.relative_to(ROOT).as_posix(), 'bytes':item['bytes'], 'sha256':item['sha256']}
            inventory.append(copied[kind])
        return copied
    for original in source['tracks']:
        if original['completionStatus'] != 'completed':
            continue
        song_id = original['id']
        if not re.fullmatch(r'[a-z0-9_-]+', song_id):
            raise ValueError('Invalid track ID')
        copied = copy_assets(song_id)
        notes = editorial.get(song_id, {})
        qa = original['qa']
        drafts = ' '.join(original['origin'].get('draftNotes', []))
        revisions = notes.get('revisions') or [{'version':f"v{r['round']+1}", 'text':' '.join(r['changes'])} for r in original['revisions']]
        # Count actual completed revisions, including documented final review exports.
        revision_rounds = max([r['round'] for r in original['revisions']] + [qa['actualReaperVersions']-1])
        normalized = {
            'id':song_id, 'title':original['title'], 'titleEn':original['titleEn'],
            'style':original['style'], 'genre':genre(original['style']),
            'group':'sketch' if original['collection']=='short-form' else original['family'],
            'family':original['family'], 'collection':original['collection'],
            'bpm':original['bpm'], 'meter':original['meter'], 'meterLabel':original['meter'],
            'durationSeconds':original['durationSeconds'], 'finalVersion':original['finalVersion'],
            'revisionRounds':revision_rounds,
            'revisionLabel':'2 轮 + 终校' if any(r.get('kind')=='final_correction' for r in original['revisions']) else f'{revision_rounds} 次修改',
            'revisionDescription':'2 轮实质修订，加上最终校正' if any(r.get('kind')=='final_correction' for r in original['revisions']) else f'{revision_rounds} 轮实质修订',
            'reaperVersions':qa['actualReaperVersions'],
            'reaperVerified':qa['reaperVerified'],
            'story':notes.get('story', original['origin']['text']),
            'compositionNotes':notes.get('compositionNotes', drafts),
            'revisions':revisions, 'sections':original.get('sectionMap',[]),
            'src':copied['mp3']['path'], 'project':copied['project']['path'],
            'sha256':copied['mp3']['sha256'], 'projectSha256':copied['project']['sha256'],
            'projectDisclosure':'可再生成源文件包，含乐谱、MIDI、REAPER 工程与生成脚本，不含现成音频分轨。先按包内 README 安装依赖并生成素材，再打开 REAPER 工程；完整分轨档案不在此轻量包内。',
            'qaSummary':f"已记录 {qa['actualReaperVersions']} 个实际 REAPER 导出版本；PCM 数值有限，削波样本为 {qa['clippedSamples']}。",
        }
        for field in ('soundSourceZh', 'provenance', 'creditsZh'):
            if field in original:
                normalized[field] = original[field]
        alternatives = []
        for variant in original.get('alternatives', []):
            if variant.get('sameComposition') is not True or variant.get('baselineVersion') != original['finalVersion']:
                raise ValueError('Alternative must preserve the approved original version')
            version_assets = copy_assets(variant['id'])
            if not variant['qa'].get('reaperVerified'):
                raise ValueError('Unverified alternative')
            alternatives.append({
                'id':variant['id'], 'version':variant['version'], 'labelZh':variant['labelZh'],
                'baselineVersion':variant['baselineVersion'], 'sameComposition':True,
                'durationSeconds':variant['durationSeconds'], 'changesZh':variant['changesZh'],
                'comparisonCuesSeconds':variant.get('comparisonCuesSeconds', {}),
                'src':version_assets['mp3']['path'], 'project':version_assets['project']['path'],
                'sha256':version_assets['mp3']['sha256'], 'projectSha256':version_assets['project']['sha256'],
                'reaperVerified':True, 'reaperVersions':variant['qa']['actualReaperVersions'],
                'qaSummary':f"此对照版保留 {variant['qa']['actualReaperVersions']} 个实际 REAPER 导出版本；详细验证范围见工程记录。",
            })
        if alternatives:
            normalized['alternatives'] = alternatives
        tracks.append(normalized)
    version_count = sum(1+len(t.get('alternatives', [])) for t in tracks)
    public = {'schemaVersion':1,'generatedAtUtc':source['generatedAtUtc'], 'completedCount':len(tracks), 'playableVersionCount':version_count, 'targetCount':source['targetCount'], 'provenance':source['provenance'], 'tracks':tracks}
    (ROOT/'data').mkdir(exist_ok=True)
    for filename, document in [('catalog.json',public),('source-catalog.json',source),('assets-manifest.json',{'files':inventory})]:
        payload = json.dumps(document,ensure_ascii=False,indent=2)+'\n'
        reject_private(payload)
        (ROOT/'data'/filename).write_text(payload,encoding='utf-8')
    print(json.dumps({'tracks':len(tracks),'assets':len(inventory),'bytes':sum(asset['bytes'] for asset in inventory),'editorials':len(editorial)},ensure_ascii=False))

if __name__ == '__main__':
    main()
