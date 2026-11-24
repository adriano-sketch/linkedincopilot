import { describe, it, expect } from 'vitest';
import { profileUrlFrom } from '@/lib/addPeople';
import { browserTimezone, safeTimezone, timezoneOptions } from '@/lib/timezones';

describe('profileUrlFrom', () => {
  const canon = 'https://www.linkedin.com/in/maria-silva';

  it('gives one form for the many ways the same profile is written', () => {
    for (const raw of [
      'https://www.linkedin.com/in/maria-silva',
      'https://www.linkedin.com/in/maria-silva/',
      'http://linkedin.com/in/Maria-Silva',
      'linkedin.com/in/maria-silva?utm_source=share',
      'https://br.linkedin.com/in/maria-silva/',
      'https://www.linkedin.com/in/maria-silva/recent-activity/all/',
      '  https://www.linkedin.com/in/maria-silva#about  ',
    ]) expect(profileUrlFrom(raw)).toBe(canon);
  });

  it('keeps accents and symbols that real profile addresses have', () => {
    expect(profileUrlFrom('https://www.linkedin.com/in/jo%C3%A3o-concei%C3%A7%C3%A3o')).toBe('https://www.linkedin.com/in/joão-conceição');
  });

  it('rejects what is not a LinkedIn profile', () => {
    for (const raw of ['', 'maria silva', 'https://example.com/in/maria', 'https://linkedin.com@evil.com/in/maria', 'https://www.linkedin.com/company/acme', 'https://www.linkedin.com/in/']) {
      expect(profileUrlFrom(raw)).toBeNull();
    }
  });
});

describe('time zones', () => {
  it('keeps a valid zone and replaces an unknown one', () => {
    expect(safeTimezone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
    expect(safeTimezone('Mars/Olympus')).toBe('America/New_York');
    expect(safeTimezone(null)).toBe('America/New_York');
  });

  it('always offers the zone already saved, even an alias', () => {
    expect(timezoneOptions('Asia/Calcutta')).toContain('Asia/Calcutta');
    expect(timezoneOptions(null).length).toBeGreaterThan(10);
  });

  it('reports the browser zone as a place or nothing', () => {
    const tz = browserTimezone();
    expect(tz === null || (typeof tz === 'string' && !['UTC', 'GMT', 'Etc/UTC'].includes(tz))).toBe(true);
  });
});
