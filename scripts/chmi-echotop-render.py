#!/usr/bin/env python3
"""Bounded ODIM HDF5 Echo Top (HGHT metres AMSL) to transparent RGBA PNG.

Input: one trusted, validated-size HDF5 file on stdin. Output: PNG on stdout,
one JSON metadata line on stderr. Never invoke it for arbitrary uploaded files.
Requires python3-h5py and python3-numpy on the AirRadar server.
"""
import io
import json
import math
import struct
import sys
import zlib

MAX_HDF_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 2_000_000
MAX_PNG_BYTES = 12 * 1024 * 1024
EXPECTED_BOUNDS = (11.267, 48.047, 19.624, 51.458)


def scalar(attrs, name):
    if name not in attrs:
        raise ValueError("ODIM missing required " + name)
    value = attrs[name]
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, bytes):
        value = value.decode("ascii", "strict")
    return value


def validate_geography(where, width, height):
    projection = scalar(where.attrs, "projdef")
    if not isinstance(projection, str) or (
        "+proj=merc" not in projection and "3857" not in projection.lower()
    ):
        raise ValueError("Echo Top is not EPSG:3857 Mercator")
    if int(scalar(where.attrs, "xsize")) != width or int(scalar(where.attrs, "ysize")) != height:
        raise ValueError("ODIM raster shape mismatch")
    if width * height > MAX_PIXELS:
        raise ValueError("Raster exceeds pixel limit")
    coords = [
        float(scalar(where.attrs, key))
        for key in ("LL_lon", "LL_lat", "UR_lon", "UR_lat")
    ]
    west, south, east, north = coords
    if not (west < east and south < north):
        raise ValueError("Invalid ODIM geographic extent")
    for measured, documented in zip(coords, EXPECTED_BOUNDS):
        if not math.isfinite(measured) or abs(measured - documented) > 0.35:
            raise ValueError("Echo Top extent differs from official documented grid")
    return coords


def png_chunk(label, data):
    crc = zlib.crc32(label)
    crc = zlib.crc32(data, crc)
    return struct.pack(">I", len(data)) + label + data + struct.pack(">I", crc & 0xFFFFFFFF)


def render(raw):
    try:
        import h5py
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("Echo Top converter requires python3-h5py and python3-numpy") from exc

    with h5py.File(io.BytesIO(raw), "r") as h5:
        dataset = h5["dataset1/data1/data"]
        if len(dataset.shape) != 2:
            raise ValueError("Expected a two-dimensional ODIM raster")
        height, width = map(int, dataset.shape)
        if height < 1 or width < 1 or width * height > MAX_PIXELS:
            raise ValueError("Invalid Echo Top raster dimensions")
        where = h5["where"]
        bounds = validate_geography(where, width, height)
        product = scalar(h5["dataset1/what"].attrs, "product")
        quantity = scalar(h5["dataset1/data1/what"].attrs, "quantity")
        if product != "ETOP" or quantity != "HGHT":
            raise ValueError("Expected ODIM ETOP / HGHT (metres above sea level)")
        meta = h5["dataset1/data1/what"].attrs
        gain = float(scalar(meta, "gain"))
        offset = float(scalar(meta, "offset"))
        nodata = float(scalar(meta, "nodata"))
        undetect = float(scalar(meta, "undetect"))
        if not all(map(math.isfinite, (gain, offset, nodata, undetect))) or gain <= 0 or gain > 1000:
            raise ValueError("Invalid ODIM gain/offset/undetect metadata")
        raw_cells = dataset[()]
        if raw_cells.dtype.kind not in "uif":
            raise ValueError("ODIM HGHT raster must be numeric")
        valid = (raw_cells != nodata) & (raw_cells != undetect)
        physical = raw_cells.astype(np.float32) * gain + offset
        valid &= np.isfinite(physical) & (physical >= 0) & (physical <= 22000)
        rgba = np.zeros((height, width, 4), dtype=np.uint8)
        # Explicit palette: blue/purple low echo to yellow/red high echo; meters AMSL.
        relative = np.clip(physical / 16000, 0, 1)
        rgba[:, :, 0] = (30 + 224 * relative).astype(np.uint8)
        rgba[:, :, 1] = (145 - 100 * relative).astype(np.uint8)
        rgba[:, :, 2] = (205 - 150 * relative).astype(np.uint8)
        rgba[:, :, 3] = np.where(valid, 155, 0).astype(np.uint8)
        rows = b"".join(b"\x00" + rgba[y].tobytes() for y in range(height))
        png = (
            b"\x89PNG\r\n\x1a\n"
            + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + png_chunk(b"IDAT", zlib.compress(rows, 5))
            + png_chunk(b"IEND", b"")
        )
        if len(png) > MAX_PNG_BYTES:
            raise ValueError("PNG output exceeds limit")
        return png, {"bounds": bounds, "width": width, "height": height,
                     "validCells": int(valid.sum()), "quantity": "HGHT",
                     "product": "ETOP", "unit": "m AMSL"}


def main():
    raw = sys.stdin.buffer.read(MAX_HDF_BYTES + 1)
    if len(raw) > MAX_HDF_BYTES or len(raw) < 8 or raw[:8] != b"\x89HDF\r\n\x1a\n":
        raise ValueError("HDF5 input invalid or exceeds the byte limit")
    png, metadata = render(raw)
    sys.stdout.buffer.write(png)
    print(json.dumps(metadata, separators=(",", ":")), file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Echo Top data rejected: " + str(exc)[:160], file=sys.stderr)
        sys.exit(1)
