#!/usr/bin/env python3
"""Create a verifiable source recovery ZIP, with dirty work separate from HEAD."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import sys
import tempfile
import zipfile

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1]).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
def git(*args): return subprocess.check_output(['git', *args], cwd=root)
head = git('rev-parse','HEAD').decode().strip()
status = git('status','--porcelain=v1','--untracked-files=all').decode()
patch = git('diff','--binary','HEAD')
untracked = git('ls-files','--others','--exclude-standard','-z').decode().split('\0')
untracked = [name for name in untracked if name]
with tempfile.TemporaryDirectory(prefix='spatial-recovery-') as temp:
    bundle = Path(temp)/'repository.bundle'
    subprocess.run(['git','bundle','create',str(bundle),'--all'],cwd=root,check=True,capture_output=True)
    subprocess.run(['git','bundle','verify',str(bundle)],cwd=root,check=True,capture_output=True)
    source = zipfile.ZipFile(io.BytesIO(git('archive','--format=zip',head)))
    hashes = {}
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
        for name in source.namelist():
            if name.endswith('/'): continue
            data = source.read(name); hashes[name] = hashlib.sha256(data).hexdigest()
            archive.writestr('Auxilium_Spatial_Developer_Package/'+name,data)
        archive.write(bundle,'recovery/repository.bundle')
        archive.writestr('recovery/RESTORE.md', '''# Restore the preserved implementation

Read the archive's top-level RECOVERY.json first. It names the exact fullCommit,
branch, committed file hashes and any separately preserved uncommitted work.
Extract into a new directory. Do not reset or overwrite a newer checkout.

From the extraction directory:

    git clone recovery/repository.bundle AuxiliumSpatial-restored
    git -C AuxiliumSpatial-restored rev-parse HEAD
    git -C AuxiliumSpatial-restored status --short

Compare HEAD with fullCommit in RECOVERY.json. The source directory in the ZIP
is the exact committed tree; the bundle retains its complete local Git history.
If uncommitted/ exists, preserve its patch/files separately and review before
applying them to this fresh matching checkout. Never apply over unrelated work.
Read START_HERE.md and RESUME.md inside the restored repository and continue.
Checksums establish byte identity, not publication authority or product acceptance.
''')
        if patch: archive.writestr('uncommitted/working-tree.patch',patch)
        for name in untracked:
            path = root/name
            if path.is_symlink() or not path.is_file(): raise RuntimeError('Unsupported uncommitted path: '+name)
            archive.write(path,'uncommitted/files/'+name)
        metadata = {'fullCommit':head,'branch':git('branch','--show-current').decode().strip(),
                    'sourceRoot':'Auxilium_Spatial_Developer_Package','sourceFiles':hashes,
                    'bundleSHA256':hashlib.sha256(bundle.read_bytes()).hexdigest(),
                    'uncommittedStatus':status,'untrackedFiles':untracked,
                    'workingTreePatchSHA256':hashlib.sha256(patch).hexdigest() if patch else None,
                    'restore':'Clone recovery/repository.bundle. Check out fullCommit. Preserve optional uncommitted/working-tree.patch and uncommitted/files separately before applying. Source tree is exact committed HEAD.',
                    'acceptance':'Source recovery archive. Read RESUME and evidence; not a claim of physical acceptance or release.'}
        archive.writestr('RECOVERY.json',json.dumps(metadata,indent=2)+'\n')
    with zipfile.ZipFile(output) as check:
        if check.testzip(): raise RuntimeError('ZIP CRC failed')
        for name,digest in hashes.items():
            if hashlib.sha256(check.read('Auxilium_Spatial_Developer_Package/'+name)).hexdigest()!=digest: raise RuntimeError('Source hash mismatch')
    print(json.dumps({'path':str(output),'fullCommit':head,'bytes':output.stat().st_size,
                      'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'sourceFiles':len(hashes),
                      'dirtyWorkPreserved':bool(status),'verified':'ZIP CRC, every committed source hash, Git bundle verify'},indent=2))
