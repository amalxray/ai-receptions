import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const avatarComponent = readFileSync(resolve(root, 'components/chat/ChatPersona.tsx'), 'utf8');

describe('global receptionist avatar', () => {
  it('points the shared assistant avatar at the full portrait in public/images', () => {
    expect(avatarComponent).toContain("'/images/receptionist-avatar-full.jpg'");
    expect(existsSync(resolve(root, 'public/images/receptionist-avatar-full.jpg'))).toBe(true);
    expect(avatarComponent).toContain('rounded-full');
    expect(avatarComponent).toContain('object-cover');
  });

  it.each([
    'components/chat/ChatInterface.tsx',
    'components/chat/FloatingChatWidget.tsx',
    'app/chat/ChatLanding.tsx',
    'app/receptionist/page.tsx',
  ])('%s uses the shared persona avatar component', (file) => {
    expect(readFileSync(resolve(root, file), 'utf8')).toContain('ChatPersonaAvatar');
  });
});
