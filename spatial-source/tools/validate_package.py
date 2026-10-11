#!/usr/bin/env python3
"""Strict boundary checks for developer exchange fixtures, not OS authorization.

No archive is extracted. Inputs are bounded before decompression. Semantic
geometry validation additionally runs through SpatialCore's CLI in verify.sh.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import stat
import sys
import xml.etree.ElementTree as ET
import zipfile
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
MAX_MEMBER = 32 * 1024 * 1024
MAX_TOTAL = 64 * 1024 * 1024
ALLOWED = {"manifest.json", "geometry.json", "floorplan.svg", "scene.json"}

class InvalidPackage(ValueError):
    pass

def strict_json(raw: bytes):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise InvalidPackage(f"Duplicate JSON key: {key}")
            result[key] = value
        return result
    def constant(value):
        raise InvalidPackage(f"Nonfinite JSON number: {value}")
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=constant)
    except (UnicodeError, json.JSONDecodeError, RecursionError) as exc:
        raise InvalidPackage("Malformed or excessively nested JSON") from exc

def schema_check(data, name):
    schema = strict_json((ROOT / "contracts" / name).read_bytes())
    errors = sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: str(e.path))
    if errors:
        e = errors[0]
        raise InvalidPackage(f"{name}: {list(e.path)}: {e.message}")

def safe_svg(raw: bytes):
    # Accept only the constrained SVG vocabulary emitted by this package.
    # General third-party SVG support would need its own threat model.
    lower = raw.lower()
    if b"<!doctype" in lower or b"<!entity" in lower:
        raise InvalidPackage("SVG entities/DOCTYPE are forbidden")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise InvalidPackage("Malformed SVG") from exc
    allowed_attrs = {
        "svg": {"viewBox", "role"}, "title": set(), "desc": set(),
        "rect": {"x", "y", "width", "height", "fill"},
        "polygon": {"points", "fill"},
        "line": {"x1", "x2", "y1", "y2", "stroke", "stroke-width", "stroke-linecap"},
        "text": {"x", "y", "text-anchor", "font-family", "font-size", "fill"},
    }
    namespace = "{http://www.w3.org/2000/svg}"
    if root.tag != namespace + "svg":
        raise InvalidPackage("Expected an SVG root")
    for el in root.iter():
        if not el.tag.startswith(namespace):
            raise InvalidPackage("Foreign SVG namespace")
        tag = el.tag[len(namespace):]
        if tag not in allowed_attrs or set(el.attrib) - allowed_attrs[tag]:
            raise InvalidPackage("Unsupported active or external SVG content")
        for key, value in el.attrib.items():
            if len(value) > 100000 or "url(" in value.lower():
                raise InvalidPackage("Oversized or external SVG attribute")
            if key in {"fill", "stroke"} and not re.fullmatch(r"#[0-9A-Fa-f]{6}|white|none", value):
                raise InvalidPackage("Unsupported SVG color")
            if key in {"x", "y", "x1", "x2", "y1", "y2", "width", "height", "font-size", "stroke-width", "points", "viewBox"}:
                if not re.fullmatch(r"[-0-9., eE+]+", value):
                    raise InvalidPackage("Invalid SVG numeric attribute")
            if key == "font-family" and value != "system-ui,sans-serif":
                raise InvalidPackage("External/custom fonts are not accepted")
            if key == "role" and value != "img":
                raise InvalidPackage("Unexpected SVG role")
            if key == "stroke-linecap" and value not in {"round", "butt", "square"}:
                raise InvalidPackage("Unexpected SVG linecap")
            if key == "text-anchor" and value not in {"start", "middle", "end"}:
                raise InvalidPackage("Unexpected SVG text anchor")

def validate_files(files: dict[str, bytes]):
    if set(files) != ALLOWED:
        raise InvalidPackage("Expected exactly manifest.json, geometry.json, scene.json and floorplan.svg")
    if sum(map(len, files.values())) > MAX_TOTAL or any(len(v) > MAX_MEMBER for v in files.values()):
        raise InvalidPackage("Package exceeds safety bounds")
    manifest = strict_json(files["manifest.json"])
    schema_check(manifest, "manifest.schema.json")
    entries = manifest["files"]
    if {e["path"] for e in entries} != ALLOWED - {"manifest.json"} or len({e["path"] for e in entries}) != len(entries):
        raise InvalidPackage("Manifest file list is incomplete or duplicated")
    for entry in entries:
        raw = files[entry["path"]]
        if len(raw) != entry["bytes"] or hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise InvalidPackage("Stored bytes do not match the manifest")
    geometry = strict_json(files["geometry.json"])
    scene = strict_json(files["scene.json"])
    schema_check(geometry, "geometry-v1.1.schema.json" if geometry.get("schemaVersion") == "1.1.0" else "geometry.schema.json")
    schema_check(scene, "scene-v1.1.schema.json" if scene.get("schemaVersion") == "1.1.0" else "scene.schema.json")
    for data in (geometry, scene):
        if data["documentID"] != manifest["documentID"] or data["revision"] != manifest["revision"]:
            raise InvalidPackage("Cross-artifact revision mismatch")
    floors = {floor["id"]: floor for floor in geometry["floors"]}
    if scene["floorID"] not in floors:
        raise InvalidPackage("Scene references an absent floor")
    floor = floors[scene["floorID"]]
    walls, rooms, openings = ({o["id"] for o in floor[k]} for k in ("walls", "rooms", "openings"))
    areas = {o["id"] for o in floor.get("areas", [])}
    for face in scene["faces"]:
        permitted = rooms if face["role"] == "floor" else walls
        if face["objectID"] not in permitted:
            raise InvalidPackage("Scene face references an absent object")
        if any(index >= len(face["vertices"]) for tri in face["triangles"] for index in tri):
            raise InvalidPackage("Scene triangle index is out of range")
    for edge in scene["edges"]:
        if edge["objectID"] not in (walls if edge["role"] == "wall" else areas if edge["role"] == "area" else openings):
            raise InvalidPackage("Scene edge references an absent object")
    safe_svg(files["floorplan.svg"])
    return manifest

def read_archive(path: Path):
    if path.stat().st_size > MAX_TOTAL:
        raise InvalidPackage("Archive exceeds size limit")
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        if len(members) != 4 or len({m.filename for m in members}) != 4:
            raise InvalidPackage("Wrong or duplicate archive members")
        total = 0
        for member in members:
            mode = member.external_attr >> 16
            if member.filename not in ALLOWED or member.is_dir() or stat.S_ISLNK(mode):
                raise InvalidPackage("Invalid archive path/type")
            if member.flag_bits & 1 or member.file_size > MAX_MEMBER:
                raise InvalidPackage("Encrypted or oversized member")
            if member.file_size > max(1, member.compress_size) * 200:
                raise InvalidPackage("Compression ratio exceeds safety limit")
            total += member.file_size
        if total > MAX_TOTAL:
            raise InvalidPackage("Expanded archive exceeds safety limit")
        files = {}
        for member in members:
            with archive.open(member) as stream:
                raw = stream.read(MAX_MEMBER + 1)
            if len(raw) != member.file_size or len(raw) > MAX_MEMBER:
                raise InvalidPackage("Member length mismatch")
            files[member.filename] = raw
    return validate_files(files)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    try:
        manifest = read_archive(args.archive)
    except (InvalidPackage, OSError, zipfile.BadZipFile, ValueError) as exc:
        parser.exit(1, f"Rejected: {exc}\n")
    print(f"Valid transport bundle for {manifest['documentID']} revision {manifest['revision']}; no authorization or native-capture acceptance is implied.")

if __name__ == "__main__":
    main()
