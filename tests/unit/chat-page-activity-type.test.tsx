import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityType } from '@/lib/services/activityTypes';

const h = vi.hoisted(() => ({
  host: 'amal.dentairec.com',
  resolvePublicClinic: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: () => ({ get: () => h.host }),
}));

vi.mock('@/lib/services/clinics', () => ({
  resolvePublicClinic: h.resolvePublicClinic,
}));

vi.mock('@/components/chat/ChatInterface', () => ({ default: vi.fn() }));
vi.mock('@/components/chat/ChatInterfaceV2', () => ({ default: vi.fn() }));

import ChatInterfaceV2 from '@/components/chat/ChatInterfaceV2';
import Page from '@/app/chat/page';

type ChatProps = {
  clinicId: string;
  activityType?: ActivityType | null;
};

function findChatProps(node: React.ReactNode): ChatProps | null {
  for (const child of React.Children.toArray(node)) {
    if (React.isValidElement<ChatProps>(child) && child.type === ChatInterfaceV2) {
      return child.props;
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(child)) {
      const nestedProps = findChatProps(child.props.children);
      if (nestedProps) return nestedProps;
    }
  }
  return null;
}

function getChatProps(page: React.ReactElement): ChatProps {
  const props = findChatProps(page.props.children);
  if (!props) throw new Error('Expected the tenant chat interface');
  return props;
}

describe('/chat activity type', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('React', React);
    h.host = 'amal.dentairec.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['imaging_center', 'imaging_center'],
    ['clinic', 'clinic'],
    ['dental_lab', 'dental_lab'],
  ] as const)('passes the database activity type for %s', async (activityType, expected) => {
    h.resolvePublicClinic.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'amal',
      name: 'Amal',
      activity_type: activityType,
      latitude: null,
      longitude: null,
      address: null,
      phone: null,
    });

    const page = await Page({ searchParams: { clinic: 'amal' } });

    expect(h.resolvePublicClinic).toHaveBeenCalledWith({ slug: 'amal' });
    expect(getChatProps(page).activityType).toBe(expected);
  });

  it('does not use a client-supplied activity type for category eligibility', async () => {
    const searchParams = { clinic: 'amal', activity_type: 'imaging_center' };
    h.resolvePublicClinic.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'amal',
      name: 'Amal',
      activity_type: 'clinic',
      latitude: null,
      longitude: null,
      address: null,
      phone: null,
    });

    const page = await Page({ searchParams });

    expect(getChatProps(page).activityType).toBe('clinic');
  });
});
