#!/usr/bin/env python3
"""Independent standard-library ZIP/JSON/XML decoder checks, not native rendering."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zipfile

import jsonschema


def load_archive(path: Path) -> dict[str, bytes]:
    with zipfile.ZipFile(path) as archive:
        info = archive.infolist()
        assert len(info) <= 4096
        assert len({entry.filename for entry in info}) == len(info)
        assert sum(entry.file_size for entry in info) <= 64 * 1024 * 1024
        assert all(0 < entry.file_size <= 32 * 1024 * 1024 for entry in info)
        assert archive.testzip() is None
        return {entry.filename: archive.read(entry) for entry in info}


def verify(directory: Path, repo: Path) -> dict:
    local = load_archive(directory / "manifest-only-two-floors.zip")
    manifest = json.loads(local["manifest.json"])
    schema = json.loads((repo / "contracts/local-document-manifest.schema.json").read_text())
    jsonschema.Draft202012Validator(schema).validate(manifest)
    geometry = json.loads(local["geometry.json"])
    assert manifest["documentID"] == geometry["documentID"]
    assert manifest["revision"] == geometry["revision"] == 9
    assert len(manifest["floors"]) == len(geometry["floors"]) == 2
    assert set(local) == {"manifest.json"} | {entry["path"] for entry in manifest["files"]}
    for entry in manifest["files"]:
        data = local[entry["path"]]
        assert entry["bytes"] == len(data)
        assert entry["sha256"] == hashlib.sha256(data).hexdigest()
    for index, floor in enumerate(manifest["floors"]):
        original = geometry["floors"][index]
        assert (floor["floorID"], floor["label"], floor["elevation"], floor["index"]) == (
            original["id"], original["label"], original["elevation"], index)
        prefix = f"floors/{index:04d}/"
        scene = json.loads(local[prefix + "scene.json"])
        assert (scene["documentID"], scene["floorID"], scene["revision"]) == (
            geometry["documentID"], original["id"], geometry["revision"])
        glb = local[prefix + "model.glb"]
        assert struct.unpack_from("<III", glb) == (0x46546C67, 2, len(glb))
        json_length, json_kind = struct.unpack_from("<II", glb, 12)
        assert json_kind == 0x4E4F534A and json_length % 4 == 0
        model = json.loads(glb[20:20 + json_length])
        extras = model["asset"]["extras"]
        assert (extras["documentID"], extras["floorID"], extras["revision"]) == (
            geometry["documentID"], original["id"], geometry["revision"])
        assert all("uri" not in buffer for buffer in model["buffers"])
        assert "images" not in model and "textures" not in model
        for page in range(floor["pageCount"]):
            svg = ET.fromstring(local[prefix + f"floorplan-{page:04d}.svg"])
            assert svg.tag == "{http://www.w3.org/2000/svg}svg"
            assert tuple(map(float, svg.attrib["viewBox"].split())) == (0, 0, 792, 612)
            for element in svg.iter():
                assert element.tag.rsplit("}", 1)[-1] not in {"script", "foreignObject", "image", "style"}
                assert all("href" not in key and not key.lower().startswith("on") for key in element.attrib)
            assert "Measurements unverified" in "".join(svg.itertext())
        svg = ET.fromstring(local[prefix + "floorplan-0000.svg"])
        windows = [e for e in svg if e.attrib.get("data-object-id") == "window-a"]
        assert len(windows) == 2
        assert windows[0].attrib["y1"] != windows[1].attrib["y1"]
        markers = [e for e in svg if e.attrib.get("data-role") == "door"]
        assert len(markers) == 2
        low, high = sorted(float(e.attrib["y1"]) for e in markers)
        for wall in [e for e in svg if e.attrib.get("data-object-id") == "w6"]:
            middle = (float(wall.attrib["y1"]) + float(wall.attrib["y2"])) / 2
            assert not low < middle < high

    pages = load_archive(directory / "actual-svg-pages.zip")
    page_manifest = json.loads(pages["manifest.json"])
    page_schema = json.loads((repo / "contracts/drawing-pages-manifest.schema.json").read_text())
    jsonschema.Draft202012Validator(page_schema).validate(page_manifest)
    assert page_manifest["floorID"] == "floor-1"
    assert page_manifest["pageCount"] == len(pages) - 1
    assert "geometry.json" not in pages
    for index, entry in enumerate(page_manifest["files"]):
        assert entry["pageIndex"] == index
        assert entry["path"] == f"floorplan-{index:04d}.svg"
        assert entry["bytes"] == len(pages[entry["path"]])
        assert entry["sha256"] == hashlib.sha256(pages[entry["path"]]).hexdigest()
    return {
        "passed": True,
        "local_manifest_entries": len(manifest["files"]),
        "floors": len(manifest["floors"]),
        "actual_svg_pages": page_manifest["pageCount"],
        "checks": ["independent ZIP CRC decode", "draft-2020-12 manifest schemas", "exact lengths/hashes",
                   "document/floor/revision/elevation identity", "GLB headers/identity/no external resources",
                   "XML namespace/bounds/no active resources", "door gap/window double line", "all SVG directory pages"],
        "native_pdf_png_rendering_tested": False,
        "manifest_only_payloads_are_not_rendering_evidence": True,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.directory, Path(__file__).resolve().parents[2]), indent=2))
