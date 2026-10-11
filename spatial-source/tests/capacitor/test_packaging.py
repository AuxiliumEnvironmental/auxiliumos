"""Portable packaging checks only, not Swift compilation or sensor acceptance."""
from pathlib import Path
import hashlib
import importlib.util
import json
import plistlib
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('spatial_native_prepare', ROOT / 'capacitor/prepare.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class PackagingTests(unittest.TestCase):
    def test_canonical_assets_are_copied_with_hashes_and_installed_csp(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'dist', Path(directory) / 'public'
            source.mkdir(); (source / 'assets').mkdir()
            html = '<html><head></head><body><script src="/assets/app.js"></script></body></html>'
            (source / 'index.html').write_text(html)
            (source / 'assets/app.js').write_text('export const canonical = true;')
            result = prepare.prepare_assets(source, output)
            self.assertEqual((source / 'assets/app.js').read_bytes(), (output / 'assets/app.js').read_bytes())
            self.assertEqual(result['sourceFiles']['index.html'], hashlib.sha256(html.encode()).hexdigest())
            self.assertIn("frame-src 'none'", (output / 'index.html').read_text())
            self.assertIn("connect-src 'none'", (output / 'index.html').read_text())
            self.assertEqual(json.loads((output / 'GENERATED_WEB_ASSETS.json').read_text()), result)

    def test_failed_prepare_preserves_existing_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'dist', Path(directory) / 'public'
            source.mkdir(); output.mkdir(); (output / 'prior.js').write_text('saved source')
            with self.assertRaises(ValueError): prepare.prepare_assets(source, output)
            self.assertEqual((output / 'prior.js').read_text(), 'saved source')

    def test_symlinks_and_fonts_cannot_escape_into_distribution(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'dist', Path(directory) / 'public'
            source.mkdir(); (source / 'index.html').write_text('<head></head>')
            (source / 'linked.js').symlink_to(Path(directory) / 'outside')
            with self.assertRaises(ValueError): prepare.prepare_assets(source, output)
            (source / 'linked.js').unlink(); (source / 'font.woff2').write_bytes(b'font')
            with self.assertRaises(ValueError): prepare.prepare_assets(source, output)

    def test_generator_is_deterministic_and_reuses_native_capture(self):
        subprocess.run(['python3', str(ROOT / 'capacitor/generate_project.py')], check=True, capture_output=True)
        project = ROOT / 'capacitor/ios/AuxiliumSpatial.xcodeproj/project.pbxproj'
        first = project.read_bytes()
        subprocess.run(['python3', str(ROOT / 'capacitor/generate_project.py')], check=True, capture_output=True)
        self.assertEqual(first, project.read_bytes())
        content = first.decode()
        for name in ('CaptureController.swift', 'CapturePipeline.swift', 'AppleSurfaceAdapter.swift', 'DeviceAccessGate.swift'):
            self.assertIn('../../ios/SpatialApp/' + name, content)
        self.assertNotIn('../../ios/SpatialApp/EditorView.swift', content)
        self.assertNotIn('../../ios/SpatialApp/AuxiliumSpatialApp.swift', content)
        self.assertIn('version = 8.5.3', content)
        self.assertIn('App/public', content)
        self.assertIn('BridgePolicyTests.swift', content)

    def test_native_configuration_has_no_remote_server_or_signing_material(self):
        config = json.loads((ROOT / 'capacitor/ios/App/capacitor.config.json').read_text())
        self.assertEqual(config['server'], {'hostname': 'localhost', 'iosScheme': 'capacitor'})
        self.assertFalse(config['plugins']['CapacitorHttp']['enabled'])
        plist = plistlib.loads((ROOT / 'capacitor/ios/App/Info.plist').read_bytes())
        self.assertIn('NSCameraUsageDescription', plist)
        self.assertIn('NSFaceIDUsageDescription', plist)
        self.assertNotIn('NSAppTransportSecurity', plist)
        self.assertNotIn('CFBundleURLTypes', plist)
        build = (ROOT / 'capacitor/build_unsigned.sh').read_text()
        self.assertIn('CODE_SIGNING_ALLOWED=NO', build)
        self.assertNotIn('-allowProvisioningUpdates', build)


if __name__ == '__main__': unittest.main()
