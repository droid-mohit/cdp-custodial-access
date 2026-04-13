import { describe, it, expect, vi } from 'vitest';
import { getDropdownOptions, selectDropdown } from '../../../src/tools/forms.js';

function createMockPage() {
  return {
    waitForSelector: vi.fn().mockResolvedValue({}),
    evaluate: vi.fn(),
    url: vi.fn().mockReturnValue('https://example.com'),
  };
}
function createMockSession(page?: any) {
  return { page: vi.fn().mockResolvedValue(page ?? createMockPage()), id: 'test' };
}

describe('getDropdownOptions', () => {
  it('returns options from a select element', async () => {
    const page = createMockPage();
    page.evaluate.mockResolvedValue([{ value: 'a', text: 'Option A' }, { value: 'b', text: 'Option B' }]);
    const result = await getDropdownOptions(createMockSession(page) as any, { selector: '#dropdown' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ value: 'a', text: 'Option A' }, { value: 'b', text: 'Option B' }]);
  });
});

describe('selectDropdown', () => {
  it('selects a dropdown option by value', async () => {
    const page = createMockPage();
    page.evaluate.mockResolvedValue(undefined);
    const result = await selectDropdown(createMockSession(page) as any, { selector: '#dropdown', value: 'b' });
    expect(result.success).toBe(true);
  });
});
