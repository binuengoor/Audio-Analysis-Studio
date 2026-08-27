import { describe, it, expect } from 'vitest';
import { buildBackendUrl } from './config';

describe('config buildBackendUrl', () => {
  it('formats paths correctly with leading slash', () => {
    const url = buildBackendUrl('/api/health');
    expect(url).toContain('/api/health');
  });

  it('formats paths correctly without leading slash', () => {
    const url = buildBackendUrl('api/health');
    expect(url).toContain('/api/health');
  });
});
