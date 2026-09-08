export interface AircraftPhoto {
  thumbnailUrl: string;
  sourceUrl: string;
  photographer: string | null;
  attribution: string | null;
  provider: "planespotters";
}

export interface AircraftPhotoApiResponse {
  photo: AircraftPhoto | null;
  enabled: boolean;
  cached: boolean;
  provider: "planespotters";
}
