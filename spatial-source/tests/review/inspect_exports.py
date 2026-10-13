#!/usr/bin/env python3
"""Independent standard-library read of generated synthetic ZIP and GLB bytes.
No Apple rendering, visual approval, glTF conformance certification, or sensor claim.
"""
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import sys
import zipfile
import xml.etree.ElementTree as ET

root = Path(sys.argv[1])
with zipfile.ZipFile(root / 'review-exchange.zip') as bundle:
    assert len(bundle.namelist()) == 4
    assert set(bundle.namelist()) == {'manifest.json', 'geometry.json', 'scene.json', 'floorplan.svg'}
    assert bundle.testzip() is None
    files = {name: bundle.read(name) for name in bundle.namelist()}
manifest = json.loads(files['manifest.json'])
geometry = json.loads(files['geometry.json'])
scene = json.loads(files['scene.json'])
assert manifest['revision'] == geometry['revision'] == scene['revision'] == 19
assert manifest['documentID'] == geometry['documentID'] == scene['documentID'] == 'synthetic-two-rooms'
for member in manifest['files']:
    data = files[member['path']]
    assert len(data) == member['bytes']
    assert hashlib.sha256(data).hexdigest() == member['sha256']
svg = ET.fromstring(files['floorplan.svg'])
assert svg.tag == '{http://www.w3.org/2000/svg}svg'
assert not any(node.tag.rsplit('}', 1)[-1] in {'script','image','foreignObject','style'} for node in svg.iter())

blob = (root / 'review-model.glb').read_bytes()
u32 = lambda position: struct.unpack_from('<I', blob, position)[0]
assert blob[:4] == b'glTF' and u32(4) == 2 and u32(8) == len(blob)
json_size = u32(12)
assert json_size % 4 == 0 and u32(16) == 0x4E4F534A
model = json.loads(blob[20:20+json_size])
binary_start = 20+json_size+8
assert u32(20+json_size+4) == 0x004E4942
assert binary_start + u32(20+json_size) == len(blob)
binary = blob[binary_start:]
assert len(binary) % 4 == 0
assert model['asset']['version'] == '2.0'
assert model['asset']['extras']['revision'] == 19
assert model['asset']['extras']['measurementStatus'] == 'unverified'
assert 'images' not in model and 'textures' not in model
assert all('uri' not in buffer for buffer in model['buffers'])
assert len(binary)-3 <= model['buffers'][0]['byteLength'] <= len(binary)

for view in model['bufferViews']:
    assert view['buffer'] == 0 and view['byteOffset'] % 4 == 0
    assert view['byteOffset'] + view['byteLength'] <= len(binary)

def accessor(index):
    item = model['accessors'][index]
    view = model['bufferViews'][item['bufferView']]
    width = {'VEC3': 3, 'SCALAR': 1}[item['type']]
    code = {5126: 'f', 5125: 'I'}[item['componentType']]
    offset = view['byteOffset'] + item.get('byteOffset', 0)
    assert item['count'] * width * 4 == view['byteLength']
    rows = [struct.unpack_from('<'+code*width, binary, offset+i*width*4) for i in range(item['count'])]
    if code == 'f':
        assert all(math.isfinite(v) for row in rows for v in row)
        if 'min' in item:
            assert tuple(item['min']) == tuple(min(row[d] for row in rows) for d in range(width))
            assert tuple(item['max']) == tuple(max(row[d] for row in rows) for d in range(width))
    return rows

def clip(polygon, dimension, bound, keep_above):
    result = []
    inside = lambda point: point[dimension] >= bound if keep_above else point[dimension] <= bound
    for a, b in zip(polygon, polygon[1:]+polygon[:1]):
        if inside(a):
            result.append(a)
        if inside(a) != inside(b):
            t = (bound-a[dimension])/(b[dimension]-a[dimension])
            result.append(tuple(a[d]+t*(b[d]-a[d]) for d in range(2)))
    return result

def area(polygon):
    return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(polygon,polygon[1:]+polygon[:1])))/2

def hole_intersection(triangle, rectangle):
    result = triangle
    for dim, bound, above in [(0,rectangle[0],True),(0,rectangle[1],False),(1,rectangle[2],True),(1,rectangle[3],False)]:
        result = clip(result,dim,bound,above)
        if not result: return 0
    return area(result)

triangles = lines = 0
surface_area = {}
for mesh in model['meshes']:
    metadata = mesh['extras']
    primitive, = mesh['primitives']
    vertices = accessor(primitive['attributes']['POSITION'])
    if primitive['mode'] == 4:
        indexes = [v[0] for v in accessor(primitive['indices'])]
        assert len(indexes) % 3 == 0 and all(0 <= index < len(vertices) for index in indexes)
        normals = accessor(primitive['attributes']['NORMAL'])
        assert len(normals) == len(vertices)
        assert all(abs(sum(v*v for v in normal)-1) < 1e-5 for normal in normals)
        for offset in range(0,len(indexes),3):
            face = [vertices[index] for index in indexes[offset:offset+3]]
            triangles += 1
            if metadata['role'] == 'floor':
                assert all(abs(normal[1]-1) < 1e-6 for normal in normals)
                polygon = [(v[0],v[2]) for v in face]
                surface_area['floor'] = surface_area.get('floor',0) + area(polygon)
            if metadata['objectID'] == 'w6':
                assert all(abs(v[0]-4) < 1e-6 for v in face)
                polygon = [(v[2],v[1]) for v in face]
                assert hole_intersection(polygon,(1,1.9,0,2.05)) < 1e-5
                surface_area['door-wall'] = surface_area.get('door-wall',0) + area(polygon)
            if metadata['objectID'] == 'w4':
                assert all(abs(v[2]-4) < 1e-6 for v in face)
                polygon = [(v[0],v[1]) for v in face]
                assert hole_intersection(polygon,(1.6,3,0.9,2.0)) < 1e-5
                surface_area['window-wall'] = surface_area.get('window-wall',0) + area(polygon)
    else:
        assert primitive['mode'] == 1 and len(vertices) % 2 == 0
        assert metadata['representation'] == 'semantic-edges'
        lines += len(vertices)//2
assert triangles == sum(len(face['triangles']) for face in scene['faces'])
assert lines == len(scene['edges'])
assert abs(surface_area['floor']-32) < 1e-5
assert abs(surface_area['door-wall']-8.555) < 1e-5
assert abs(surface_area['window-wall']-8.86) < 1e-5
print(json.dumps({'status':'pass','revision':19,'triangles':triangles,'semantic_lines':lines,
                  'checks':['exact ZIP hashes/lengths','independent GLB chunk/accessor bounds','no external assets',
                            'correct floor normal and synthetic area','zero door/window triangle-hole intersection']},sort_keys=True))
