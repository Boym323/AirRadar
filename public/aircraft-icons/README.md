# Aircraft silhouettes

The SVG files in this directory are from
[RexKramer1/AircraftShapesSVG](https://github.com/RexKramer1/AircraftShapesSVG),
and are used as the type-specific map markers in AirRadar.

The artwork is licensed under the GNU General Public License, version 3
(GPL-3.0). The unmodified upstream `LICENSE` is included in this directory;
the upstream repository is the corresponding source for these assets.

AirRadar's copies have only their SVG stroke widths increased so the original
silhouettes remain legible at map-marker size. This is a local modification of
the upstream artwork.

AirRadar selects an SVG by the ICAO aircraft type code and keeps its own
fallback silhouette for types not present in the upstream catalogue.
