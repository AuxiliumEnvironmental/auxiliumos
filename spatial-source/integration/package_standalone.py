#!/usr/bin/env python3
"""Build the existing Spatial workspace for an independent host. Never deploy.

Uses a fixed committed source snapshot, not OS files or a stale dist directory.
The full recovery bundle remains separate; this is a reproducible host artifact.
"""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import io
import json
import os
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root)


def safe_name(name):
    path = PurePosixPath(name)
    return (not path.is_absolute() and '..' not in path.parts and
            '\\' not in name and ':' not in name and name == path.as_posix())


def snapshot(root):
    if git(root, 'status', '--porcelain', '--untracked-files=all', '--', 'web').strip():
        raise ValueError('Preserve and commit current web changes before packaging; no dirty work is omitted.')
    head = git(root, 'rev-parse', 'HEAD').decode().strip()
    archive = zipfile.ZipFile(io.BytesIO(git(root, 'archive', '--format=zip', head, 'web')))
    files = {}
    for entry in archive.infolist():
        if entry.is_dir():
            continue
        if not safe_name(entry.filename) or (entry.external_attr >> 16) & 0o170000 == 0o120000:
            raise ValueError('Unsupported source path: ' + entry.filename)
        path = PurePosixPath(entry.filename)
        if any(part in {'node_modules', 'dist', 'dist-library', '.git'} or part.startswith('.env') for part in path.parts):
            raise ValueError('Unexpected generated or environment source: ' + entry.filename)
        files[entry.filename] = archive.read(entry)
    for name in ['web/src/main.tsx', 'web/src/ui/SpatialWorkspace.tsx', 'web/package-lock.json', 'web/vite.config.ts']:
        if name not in files:
            raise ValueError('Missing canonical source: ' + name)
    return head, files


def verify(directory):
    directory = Path(directory).absolute()
    for path in [directory, *directory.parents, *directory.rglob('*')]:
        if path.is_symlink():
            raise ValueError('Symlink is not a release file: ' + str(path))
    manifest = json.loads((directory / 'RELEASE.json').read_text())
    expected = {'RELEASE.json'}
    for section in ['sourceFiles', 'siteFiles']:
        for name, sha in manifest[section].items():
            if not safe_name(name) or not name.startswith('source/' if section == 'sourceFiles' else 'site/'):
                raise ValueError('Invalid manifest path: ' + name)
            path = directory / name
            if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent != directory.parent):
                raise ValueError('Symlink is not a release file: ' + name)
            if not path.is_file() or digest(path.read_bytes()) != sha:
                raise ValueError('Release file mismatch: ' + name)
            expected.add(name)
    actual = {str(path.relative_to(directory)) for path in directory.rglob('*') if path.is_file() or path.is_symlink()}
    if actual != expected:
        raise ValueError('Unexpected or missing release files: ' + repr(sorted(actual ^ expected)))
    for name in ['site/index.html', 'site/sw.js', 'site/spatial-release.json']:
        if name not in expected:
            raise ValueError('Incomplete standalone app: ' + name)
    identity = json.loads((directory / 'site/spatial-release.json').read_text())
    if identity != {key: manifest[key] for key in ['sourceCommit', 'workspaceInputSHA256', 'intendedHostname']}:
        raise ValueError('Served application identity does not match release.')
    source_hashes = {name.removeprefix('source/'): sha for name, sha in manifest['sourceFiles'].items()}
    fingerprint = digest(json.dumps(source_hashes, sort_keys=True, separators=(',', ':')).encode())
    if manifest['workspaceInputSHA256'] != fingerprint:
        raise ValueError('Workspace input fingerprint does not match packaged source.')
    return manifest


def assemble(destination, source_commit, source_files, site, environment, hostname):
    destination = Path(destination)
    # A release is append-only. Never replace a previous release or existing work.
    if destination.exists() or destination.is_symlink():
        raise ValueError('Use a new release directory; existing output is preserved.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.spatial-release-', dir=destination.parent) as temp:
        stage = Path(temp) / 'release'
        stage.mkdir()
        source_hashes = {name: digest(data) for name, data in sorted(source_files.items())}
        identity = {'sourceCommit': source_commit,
                    'workspaceInputSHA256': digest(json.dumps(source_hashes, sort_keys=True, separators=(',', ':')).encode()),
                    'intendedHostname': hostname}
        for name, data in source_files.items():
            if not safe_name(name) or not name.startswith('web/'):
                raise ValueError('Invalid source input: ' + name)
            path = stage / 'source' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        for path in Path(site).rglob('*'):
            if path.is_symlink():
                raise ValueError('Unsupported built symlink: ' + str(path))
            if path.is_file():
                target = stage / 'site' / path.relative_to(site)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
        (stage / 'site' / 'spatial-release.json').write_text(json.dumps(identity, indent=2) + '\n')
        manifest = {**identity, 'formatVersion': 1,
                    'buildCommand': 'npm run build (in isolated committed web snapshot)',
                    'buildEnvironment': environment,
                    'ownership': 'Generated from the one maintained Spatial workspace. OS and Moldo source are not included.',
                    'deploymentStatus': 'prepared_not_deployed',
                    'accessRequirement': 'Protected hosting or verified application access must be configured before publication. This artifact is not an authentication layer.',
                    'dataTransfer': 'Existing browser drafts remain at their original origin. Export and explicitly import a local-document backup; do not clear original storage.',
                    'nativeStatus': 'Browser editing only. Apple RoomPlan requires the separately installed native application.',
                    'sourceFiles': {'source/' + name: sha for name, sha in source_hashes.items()},
                    'siteFiles': {str(path.relative_to(stage)): digest(path.read_bytes()) for path in sorted((stage / 'site').rglob('*')) if path.is_file()}}
        (stage / 'RELEASE.json').write_text(json.dumps(manifest, indent=2) + '\n')
        verify(stage)
        os.rename(stage, destination)
    return manifest


def build(root, destination, hostname, offline=False):
    head, files = snapshot(root)
    with tempfile.TemporaryDirectory(prefix='spatial-build-') as temp:
        checkout = Path(temp)
        for name, data in files.items():
            path = checkout / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        # A reused node_modules tree can hide transitive or modified dependencies.
        # Rehydrate exactly the lockfile, preferring the local npm cache. Explicit
        # offline mode fails on missing cache; neither mode selects newer versions.
        environment_variables = {key: value for key, value in os.environ.items()
                                 if not key.startswith('VITE_') and key not in {'NODE_OPTIONS', 'NODE_ENV'}}
        install = ['npm', 'ci', '--offline' if offline else '--prefer-offline', '--no-audit', '--no-fund', '--include=dev', '--fetch-retries=0', '--fetch-timeout=20000']
        subprocess.run(install,
                       cwd=checkout / 'web', env=environment_variables, check=True)
        dependencies = json.loads(subprocess.check_output(['npm', 'ls', '--json', '--depth=0'], cwd=checkout / 'web', env=environment_variables))
        subprocess.run(['npm', 'run', 'build'], cwd=checkout / 'web', env=environment_variables, check=True)
        environment = {'node': subprocess.check_output(['node', '--version'], text=True).strip(),
                       'npm': subprocess.check_output(['npm', '--version'], text=True).strip(),
                       'dependencyInstall': ' '.join(install),
                       'dependencyVersions': {name: value['version'] for name, value in dependencies['dependencies'].items()}}
        return assemble(destination, head, files, checkout / 'web/dist', environment, hostname)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--hostname', default='spatialauxilium.io')
    parser.add_argument('--offline', action='store_true', help='Require every lockfile dependency in the existing local npm cache.')
    args = parser.parse_args()
    if args.verify:
        result = verify(args.directory.absolute())
    else:
        if not args.hostname or any(char not in 'abcdefghijklmnopqrstuvwxyz0123456789-.' for char in args.hostname):
            parser.error('Use a bare lowercase hostname.')
        result = build(ROOT, args.directory.absolute(), args.hostname, args.offline)
    print(json.dumps({key: result[key] for key in ['sourceCommit', 'workspaceInputSHA256', 'intendedHostname', 'deploymentStatus']}, indent=2))
