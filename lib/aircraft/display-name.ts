/** Render the observed manufacturer and model without duplicating the manufacturer.
 * Metadata descriptions can already be full names (e.g. "Airbus A380-800").
 * Preserve the source model spelling; do not infer aircraft identity from ICAO.
 */
export function formatAircraftManufacturerModel(
  manufacturer: string | null | undefined,
  model: string | null | undefined,
): string | null {
  const make = manufacturer?.trim().replace(/\s+/g, " ") ?? "";
  const description = model?.trim().replace(/\s+/g, " ") ?? "";
  if (!make) return description || null;
  if (!description) return make;

  // A word boundary avoids treating "Airbusan" as already prefixed by "Airbus".
  const samePrefix = description.slice(0, make.length).toLocaleLowerCase("en")
    === make.toLocaleLowerCase("en");
  if (samePrefix && (description.length === make.length || /[\s/\-–—(]/.test(description[make.length]))) {
    return description;
  }
  return `${make} ${description}`;
}
