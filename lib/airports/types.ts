export interface Airport {
  icaoCode: string;
  iataCode: string | null;
  name: string;
  city: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  type?: string | null;
  elevationFt?: number | null;
  scheduledService?: boolean | null;
  region?: string | null;
  localCode?: string | null;
}
