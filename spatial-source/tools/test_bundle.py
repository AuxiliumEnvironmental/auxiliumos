import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile
from validate_package import InvalidPackage, read_archive, strict_json, validate_files, safe_svg

ROOT = Path(__file__).resolve().parents[1]

class BundleTests(unittest.TestCase):
    def setUp(self):
        with zipfile.ZipFile(ROOT / "fixtures/synthetic_exchange.zip") as archive:
            self.files = {name: archive.read(name) for name in archive.namelist()}
    def rehash(self):
        m = json.loads(self.files["manifest.json"])
        for entry in m["files"]:
            data = self.files[entry["path"]]
            entry.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        self.files["manifest.json"] = json.dumps(m).encode()
    def test_valid_bundle(self):
        self.assertEqual(validate_files(self.files)["revision"], 1)
    def test_archive_valid(self):
        self.assertEqual(read_archive(ROOT / "fixtures/synthetic_exchange.zip")["documentID"], "synthetic-two-rooms")
    def test_checksum_mismatch(self):
        self.files["scene.json"] += b" "
        with self.assertRaises(InvalidPackage): validate_files(self.files)
    def test_unknown_geometry_schema(self):
        d = json.loads(self.files["geometry.json"]); d["schemaVersion"] = "2.0.0"
        self.files["geometry.json"] = json.dumps(d).encode(); self.rehash()
        with self.assertRaises(InvalidPackage): validate_files(self.files)
    def test_unknown_geometry_field(self):
        d = json.loads(self.files["geometry.json"]); d["admin"] = True
        self.files["geometry.json"] = json.dumps(d).encode(); self.rehash()
        with self.assertRaises(InvalidPackage): validate_files(self.files)
    def test_cross_revision_mismatch(self):
        d = json.loads(self.files["scene.json"]); d["revision"] = 2
        self.files["scene.json"] = json.dumps(d).encode(); self.rehash()
        with self.assertRaises(InvalidPackage): validate_files(self.files)
    def test_scene_out_of_range_index(self):
        d = json.loads(self.files["scene.json"]); d["faces"][0]["triangles"][0][0] = 999
        self.files["scene.json"] = json.dumps(d).encode(); self.rehash()
        with self.assertRaises(InvalidPackage): validate_files(self.files)
    def test_scene_absent_object(self):
        d = json.loads(self.files["scene.json"]); d["faces"][0]["objectID"] = "absent"
        self.files["scene.json"] = json.dumps(d).encode(); self.rehash()
        with self.assertRaises(InvalidPackage): validate_files(self.files)
    def test_measurement_claim_rejected(self):
        d = json.loads(self.files["geometry.json"]); d["measurementStatus"] = "certified"
        self.files["geometry.json"] = json.dumps(d).encode(); self.rehash()
        with self.assertRaises(InvalidPackage): validate_files(self.files)
    def test_duplicate_json_key_rejected(self):
        with self.assertRaises(InvalidPackage): strict_json(b'{"revision":1,"revision":2}')
    def test_nonfinite_json_rejected(self):
        for data in [b'{"x":NaN}', b'{"x":Infinity}', b'{"x":-Infinity}']:
            with self.subTest(data=data), self.assertRaises(InvalidPackage): strict_json(data)
    def test_script_svg_rejected(self):
        self.files["floorplan.svg"] = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        self.rehash()
        with self.assertRaises(InvalidPackage): validate_files(self.files)
    def test_svg_external_image_rejected(self):
        with self.assertRaises(InvalidPackage): safe_svg(b'<svg xmlns="http://www.w3.org/2000/svg"><image href="https://invalid.example/a"/></svg>')
    def test_svg_event_handler_rejected(self):
        with self.assertRaises(InvalidPackage): safe_svg(b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')
    def test_svg_entity_rejected(self):
        with self.assertRaises(InvalidPackage): safe_svg(b'<!DOCTYPE svg [<!ENTITY x "xx">]><svg xmlns="http://www.w3.org/2000/svg"/>')
    def test_duplicate_manifest_entry(self):
        d = json.loads(self.files["manifest.json"]); d["files"][1] = copy.deepcopy(d["files"][0])
        self.files["manifest.json"] = json.dumps(d).encode()
        with self.assertRaises(InvalidPackage): validate_files(self.files)
    def test_size_limit(self):
        with patch("validate_package.MAX_MEMBER", 10), self.assertRaises(InvalidPackage): validate_files(self.files)
    def test_traversal_member(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "bad.zip"
            with zipfile.ZipFile(p, "w") as out:
                for k, v in self.files.items(): out.writestr("../geometry.json" if k == "geometry.json" else k, v)
            with self.assertRaises(InvalidPackage): read_archive(p)
    def test_duplicate_archive_member(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "bad.zip"
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                with zipfile.ZipFile(p, "w") as out:
                    for k, v in self.files.items(): out.writestr(k, v)
                    out.writestr("geometry.json", self.files["geometry.json"])
            with self.assertRaises(InvalidPackage): read_archive(p)
    def test_symlink_member(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "bad.zip"
            with zipfile.ZipFile(p, "w") as out:
                for k, v in self.files.items():
                    info = zipfile.ZipInfo(k)
                    info.external_attr = (0o120777 if k == "geometry.json" else 0o100644) << 16
                    out.writestr(info, v)
            with self.assertRaises(InvalidPackage): read_archive(p)
    def test_suspicious_compression_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "bad.zip"
            with zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as out:
                for k, v in self.files.items(): out.writestr(k, b"0"*300000 if k == "geometry.json" else v)
            with self.assertRaises(InvalidPackage): read_archive(p)

if __name__ == "__main__": unittest.main()
