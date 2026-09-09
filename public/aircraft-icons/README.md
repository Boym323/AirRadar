# Aircraft silhouettes

The fallback SVG files in this directory are from
[RexKramer1/AircraftShapesSVG](https://github.com/RexKramer1/AircraftShapesSVG),
and are used when a type is not covered by the preferred tar1090 icon set.

The artwork is licensed under the GNU General Public License, version 3
(GPL-3.0). The unmodified upstream `LICENSE` is included in this directory;
the upstream repository is the corresponding source for these assets.

AirRadar's copies have only their SVG stroke widths increased so the original
silhouettes remain legible at map-marker size. This is a local modification of
the upstream artwork.

AirRadar selects a tar1090 SVG by the ICAO aircraft type code first, then
selects one of these fallback SVGs, and finally uses its own fallback
silhouette for types not present in either catalogue.
