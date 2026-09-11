import { load } from "cheerio";

export interface CzEaipSegmentAnnotationNormalization {
  html: string;
  correctedRows: number;
  correctedAnnotations: number;
}

/**
 * AIM ŘLP ENR 3.2 occasionally publishes inconsistent AIXM object ids inside
 * one visual route-segment row (for example VAL_LEN uses the segment id while
 * CODE_RNP or UOM_DIST references another id). The table semantics still
 * describe one segment. Use the VAL_LEN annotation as the stable row identity
 * and normalize only TRTE_SEG annotation ids; published values are untouched.
 */
export function normalizeCzEaipEnr32SegmentAnnotations(html: string): CzEaipSegmentAnnotationNormalization {
  const $ = load(html, { xmlMode: true });
  let correctedRows = 0;
  let correctedAnnotations = 0;

  $("tr").each((_, row) => {
    const params = $(row).find(".sdParams").toArray();
    const distanceIds = [...new Set(params.flatMap((element) => {
      const value = $(element).text().trim();
      const match = /^TRTE_SEG;VAL_LEN;([^;\s]+)$/.exec(value);
      return match ? [match[1]] : [];
    }))];

    if (distanceIds.length === 0) return;
    if (distanceIds.length !== 1) {
      throw new Error(`ENR 3.2 segment row contains ${distanceIds.length} VAL_LEN object ids; refusing to normalize`);
    }

    const primaryId = distanceIds[0];
    let rowCorrections = 0;
    for (const element of params) {
      const value = $(element).text().trim();
      const match = /^(TRTE_SEG;[^;]+;)([^;\s]+)$/.exec(value);
      if (!match || match[2] === primaryId) continue;
      $(element).text(`${match[1]}${primaryId}`);
      rowCorrections += 1;
    }

    if (rowCorrections > 0) {
      correctedRows += 1;
      correctedAnnotations += rowCorrections;
    }
  });

  return {
    html: $.xml(),
    correctedRows,
    correctedAnnotations,
  };
}
