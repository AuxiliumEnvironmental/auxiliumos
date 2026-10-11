#!/usr/bin/env python3
"""Render trusted emitted SVG with system librsvg for visual QA.

This is an independent SVG decoder, NOT the app's Apple PDF/PNG renderer and
NOT evidence that CoreGraphics compiled or executed.
"""
import argparse
import ctypes as C
from pathlib import Path


def render(source: Path, output: Path) -> None:
    rsvg = C.CDLL("librsvg-2.so.2")
    cairo = C.CDLL("libcairo.so.2")
    gobject = C.CDLL("libgobject-2.0.so.0")
    rsvg.rsvg_handle_new_from_data.argtypes = [C.c_void_p, C.c_size_t, C.POINTER(C.c_void_p)]
    rsvg.rsvg_handle_new_from_data.restype = C.c_void_p
    class Rect(C.Structure):
        _fields_ = [(field, C.c_double) for field in ("x", "y", "width", "height")]
    rsvg.rsvg_handle_render_document.argtypes = [C.c_void_p, C.c_void_p, C.POINTER(Rect), C.POINTER(C.c_void_p)]
    rsvg.rsvg_handle_render_document.restype = C.c_int
    cairo.cairo_image_surface_create.argtypes = [C.c_int, C.c_int, C.c_int]
    cairo.cairo_image_surface_create.restype = C.c_void_p
    cairo.cairo_create.argtypes = [C.c_void_p]
    cairo.cairo_create.restype = C.c_void_p
    cairo.cairo_surface_write_to_png.argtypes = [C.c_void_p, C.c_char_p]
    cairo.cairo_surface_write_to_png.restype = C.c_int
    cairo.cairo_destroy.argtypes = [C.c_void_p]
    cairo.cairo_surface_destroy.argtypes = [C.c_void_p]
    gobject.g_object_unref.argtypes = [C.c_void_p]
    data = source.read_bytes()
    error = C.c_void_p()
    handle = rsvg.rsvg_handle_new_from_data(data, len(data), C.byref(error))
    if not handle:
        raise ValueError("Independent SVG decoder rejected source")
    surface = cairo.cairo_image_surface_create(0, 1584, 1224)
    context = cairo.cairo_create(surface)
    try:
        viewport = Rect(0, 0, 1584, 1224)
        if not rsvg.rsvg_handle_render_document(handle, context, C.byref(viewport), C.byref(error)):
            raise ValueError("Independent SVG renderer failed")
        result = cairo.cairo_surface_write_to_png(surface, str(output).encode())
        if result:
            raise ValueError(f"PNG review write failed: {result}")
    finally:
        cairo.cairo_destroy(context)
        cairo.cairo_surface_destroy(surface)
        gobject.g_object_unref(handle)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    render(args.source, args.output)
    print(f"Rendered SVG through librsvg, not native CoreGraphics: {args.output}")
