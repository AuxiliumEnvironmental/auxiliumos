"""Adversarial host handoff checks; these are not hosted access acceptance."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('standalone', ROOT / 'integration/package_standalone.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class StandaloneReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.site = self.base / 'built'
        self.site.mkdir()
        (self.site / 'index.html').write_text('<div id="root"></div>')
        (self.site / 'sw.js').write_text('// test asset')
        self.target = self.base / 'release'

    def package(self):
        return module.assemble(self.target, 'a' * 40, {'web/src/main.tsx': b'fixture'}, self.site, {}, 'spatialauxilium.io')

    def test_exact_identity_and_no_os_payload(self):
        result = self.package()
        self.assertEqual(module.verify(self.target), result)
        self.assertEqual(result['deploymentStatus'], 'prepared_not_deployed')
        self.assertEqual(set(result['sourceFiles']), {'source/web/src/main.tsx'})
        identity = json.loads((self.target / 'site/spatial-release.json').read_text())
        self.assertEqual(identity['sourceCommit'], 'a' * 40)

    def test_tampered_app_cannot_be_reported_verified(self):
        self.package()
        (self.target / 'site/index.html').write_text('different application')
        with self.assertRaisesRegex(ValueError, 'mismatch'):
            module.verify(self.target)

    def test_unlisted_file_cannot_be_silently_deployed(self):
        self.package()
        (self.target / 'site/unreviewed.js').write_text('unexpected script')
        with self.assertRaisesRegex(ValueError, 'Unexpected'):
            module.verify(self.target)

    def test_fingerprint_must_describe_packaged_source(self):
        result = self.package()
        result['workspaceInputSHA256'] = 'f' * 64
        identity = {key: result[key] for key in ['sourceCommit', 'workspaceInputSHA256', 'intendedHostname']}
        served = json.dumps(identity).encode()
        (self.target / 'site/spatial-release.json').write_bytes(served)
        result['siteFiles']['site/spatial-release.json'] = module.digest(served)
        (self.target / 'RELEASE.json').write_text(json.dumps(result))
        with self.assertRaisesRegex(ValueError, 'fingerprint'):
            module.verify(self.target)

    def test_existing_release_and_symlink_are_preserved(self):
        self.package()
        original = (self.target / 'RELEASE.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'preserved'):
            self.package()
        self.assertEqual((self.target / 'RELEASE.json').read_bytes(), original)
        (self.target / 'site/sw.js').unlink()
        (self.target / 'site/sw.js').symlink_to(self.site / 'sw.js')
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            module.verify(self.target)

    def test_source_traversal_rejected_without_partial_output(self):
        with self.assertRaisesRegex(ValueError, 'Invalid source'):
            module.assemble(self.target, 'a' * 40, {'web/../../outside': b'bad'}, self.site, {}, 'spatialauxilium.io')
        self.assertFalse(self.target.exists())
        self.assertFalse((self.base / 'outside').exists())

    def test_manifest_and_release_directory_symlinks_rejected(self):
        self.package()
        path = self.target / 'RELEASE.json'
        external = self.base / 'external-manifest.json'
        external.write_bytes(path.read_bytes())
        path.unlink()
        path.symlink_to(external)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            module.verify(self.target)
        path.unlink()
        path.write_bytes(external.read_bytes())
        alias = self.base / 'alias'
        alias.symlink_to(self.target, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            module.verify(alias)

    def test_dirty_current_source_cannot_be_omitted(self):
        repo = self.base / 'repo'
        repo.mkdir()
        subprocess.run(['git', 'init', '-q', str(repo)], check=True)
        (repo / 'web').mkdir()
        (repo / 'web/local-edit.ts').write_text('uncommitted newer work')
        with self.assertRaisesRegex(ValueError, 'no dirty work is omitted'):
            module.snapshot(repo)


if __name__ == '__main__':
    unittest.main()
