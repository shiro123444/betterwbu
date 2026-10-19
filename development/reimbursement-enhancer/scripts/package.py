"""Package the maintained source and built extension, excluding local data."""
from pathlib import Path
import hashlib
import json
import zipfile

root=Path(__file__).resolve().parents[1]
extension=root/'extension'
manifest=json.loads((extension/'manifest.json').read_text(encoding='utf-8'))
package=json.loads((root/'package.json').read_text(encoding='utf-8'))
assert manifest['version']==package['version']
for entry in manifest['content_scripts']:
    for name in entry.get('js',[])+entry.get('css',[]):
        assert (extension/name).is_file(),name
for source,target in [('site.js','site-isolated.js'),('memory-core.js','memory-core-isolated.js'),('basic-core.js','basic-core-http-isolated.js')]:
    assert (extension/source).read_bytes()==(extension/target).read_bytes()
files=[p for folder in ['extension','src','scripts','tests'] for p in (root/folder).rglob('*')
       if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc']
files += [root/'package.json',root/'package-lock.json']
payload={p.relative_to(root).as_posix():p.read_bytes() for p in files}
readme=root.parents[1]/'README.md'
if not readme.is_file():readme=root/'README.md'
if readme.is_file():payload['README.md']=readme.read_bytes()
hashes={name:hashlib.sha256(data).hexdigest() for name,data in payload.items()}
payload['checksums.json']=json.dumps(hashes,ensure_ascii=False,indent=2).encode('utf-8')
destination=root/'dist';destination.mkdir(exist_ok=True)
archive=destination/f"betterwbu-{manifest['version']}-source.zip"
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as output:
    for name,data in sorted(payload.items()):output.writestr(name,data)
with zipfile.ZipFile(archive) as output:
    assert output.testzip() is None
    for name,digest in hashes.items():assert hashlib.sha256(output.read(name)).hexdigest()==digest
print(json.dumps({'version':manifest['version'],'files':len(payload),'bytes':archive.stat().st_size,
                  'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()},ensure_ascii=False))
