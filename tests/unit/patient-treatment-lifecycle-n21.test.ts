import { describe, expect, it } from 'vitest';
import {
  canClosePatientTreatment,
  closePatientTreatment,
  getCurrentPatientTreatmentEpisode,
  getPatientTreatmentStatus,
  reopenPatientTreatment,
} from '@/components/dashboard/patients/smartProfile';

describe('N21 patient treatment lifecycle', () => {
  it('closes the active episode and clears the current reference when the debt is clear', () => {
    const metadata = {
      current_episode_id: 'ep-1',
      episodes: [{ id: 'ep-1', started_at: '2025-01-01T00:00:00.000Z', status: 'active' }],
    };

    const result = closePatientTreatment(metadata);

    expect(canClosePatientTreatment(metadata)).toBe(true);
    expect(result.current_episode_id).toBeNull();
    expect(result.episodes[0].status).toBe('closed');
    expect(result.episodes[0].closed_at).toBeTruthy();
    expect(getPatientTreatmentStatus(result)).toBe('closed');
  });

  it('reopens the account by adding a new active episode', () => {
    const metadata = {
      current_episode_id: 'ep-1',
      episodes: [
        {
          id: 'ep-1',
          started_at: '2025-01-01T00:00:00.000Z',
          status: 'closed',
          closed_at: '2025-01-05T00:00:00.000Z',
        },
      ],
    };

    const result = reopenPatientTreatment(metadata);
    const current = getCurrentPatientTreatmentEpisode(result);

    expect(result.current_episode_id).not.toBeNull();
    expect(current?.status).toBe('active');
    expect(current?.closed_at).toBeNull();
    expect(current?.opened_at).toBeTruthy();
  });

  it('blocks closure while unpaid debt remains', () => {
    const metadata = {
      current_episode_id: 'ep-1',
      balance_due: 1250,
      episodes: [{ id: 'ep-1', started_at: '2025-01-01T00:00:00.000Z', status: 'active' }],
    };

    expect(canClosePatientTreatment(metadata)).toBe(false);

    const result = closePatientTreatment(metadata);

    expect(result.episodes[0].status).toBe('active');
    expect(result.current_episode_id).toBe('ep-1');
  });
});
