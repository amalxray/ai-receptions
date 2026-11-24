import type { OSMClinic } from './openstreetmap';

export type DiscoverySource = 'openstreetmap' | 'foursquare' | 'geoapify';

export type ProspectClinic = Omit<OSMClinic, 'source'> & {
  source: DiscoverySource;
};
