import { ACTIVITY_TYPE_LABELS_AR } from '@/lib/services/activityTypes';
import {
  getEligibleCenters,
  type EligibleCenter,
} from '@/lib/services/activityPublicSpace';
import {
  getDiscoveryEntries,
  type DiscoveryResult,
  type DiscoveryEntry,
  type DiscoverySearchParams,
} from '@/lib/services/doctorPublicProfile';

export type DiscoverCenterEntry = EligibleCenter & { kind: 'center' };

export type DiscoverEntries = {
  doctors: DiscoveryEntry[];
  centers: DiscoverCenterEntry[];
  doctorPagination: Omit<DiscoveryResult, 'entries'>;
};

function includesText(value: string | null | undefined, query: string): boolean {
  return value?.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ?? false;
}

export async function getDiscoverEntries(
  params: DiscoverySearchParams = {}
): Promise<DiscoverEntries> {
  const [doctors, eligibleCenters] = await Promise.all([
    getDiscoveryEntries(params),
    getEligibleCenters(),
  ]);
  const query = params.q?.trim();
  const specialty = params.specialty?.trim();
  const city = params.city?.trim();

  const centers = eligibleCenters.filter((center) => {
    if (query && !includesText(center.name, query)) return false;
    if (
      specialty &&
      !includesText(center.description, specialty) &&
      !includesText(center.activityType, specialty) &&
      !includesText(ACTIVITY_TYPE_LABELS_AR[center.activityType], specialty)
    ) {
      return false;
    }
    if (
      city &&
      !includesText(center.city, city) &&
      !includesText(center.area, city)
    ) {
      return false;
    }
    return true;
  }).map((center) => ({ ...center, kind: 'center' as const }));

  const { entries, ...doctorPagination } = doctors;
  return { doctors: entries, centers, doctorPagination };
}
