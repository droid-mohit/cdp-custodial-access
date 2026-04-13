import { describe, it, expect, vi } from 'vitest';
import { click, input, scroll, sendKeys, findText, uploadFile } from '../../../src/tools/interaction.js';

function createMockPage() {
  const mockElement = {
    boundingBox: vi.fn().mockResolvedValue({ x: 50, y: 50, width: 100, height: 30 }),
    click: vi.fn(),
    focus: vi.fn(),
    type: vi.fn(),
    uploadFile: vi.fn(),
  };
  return {
    waitForSelector: vi.fn().mockResolvedValue(mockElement),
    $: vi.fn().mockResolvedValue(mockElement),
    mouse: { move: vi.fn(), click: vi.fn(), down: vi.fn(), up: vi.fn() },
    keyboard: { type: vi.fn(), press: vi.fn(), down: vi.fn(), up: vi.fn() },
    evaluate: vi.fn().mockResolvedValue(null),
    url: vi.fn().mockReturnValue('https://example.com'),
    title: vi.fn().mockResolvedValue('Test'),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('fake')),
  };
}

function createMockSession(page?: any) {
  const mockPage = page ?? createMockPage();
  return { page: vi.fn().mockResolvedValue(mockPage), id: 'test-session' };
}

describe('click', () => {
  it('clicks an element by selector', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    const result = await click(session as any, { selector: '#btn' });
    expect(result.success).toBe(true);
    expect(page.waitForSelector).toHaveBeenCalledWith('#btn', expect.any(Object));
    expect(page.mouse.move).toHaveBeenCalled();
    expect(page.mouse.click).toHaveBeenCalled();
  });

  it('returns error when element not found', async () => {
    const page = createMockPage();
    page.waitForSelector.mockRejectedValue(new Error('Timeout'));
    const session = createMockSession(page);
    const result = await click(session as any, { selector: '#missing' });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ELEMENT_NOT_FOUND');
  });
});

describe('input', () => {
  it('types text into an element', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    const result = await input(session as any, { selector: '#search', text: 'hello' });
    expect(result.success).toBe(true);
    expect(page.waitForSelector).toHaveBeenCalledWith('#search', expect.any(Object));
    expect(page.keyboard.type).toHaveBeenCalled();
  });

  it('returns error when element not found', async () => {
    const page = createMockPage();
    page.waitForSelector.mockRejectedValue(new Error('Timeout'));
    const session = createMockSession(page);
    const result = await input(session as any, { selector: '#missing', text: 'hello' });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ELEMENT_NOT_FOUND');
  });
});

describe('scroll', () => {
  it('scrolls down by default', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    const result = await scroll(session as any, { direction: 'down' });
    expect(result.success).toBe(true);
    expect(page.evaluate).toHaveBeenCalled();
  });

  it('scrolls up', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    const result = await scroll(session as any, { direction: 'up', amount: 300 });
    expect(result.success).toBe(true);
  });
});

describe('sendKeys', () => {
  it('sends keyboard shortcuts', async () => {
    const page = createMockPage();
    const session = createMockSession(page);
    const result = await sendKeys(session as any, { keys: 'Enter' });
    expect(result.success).toBe(true);
    expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
  });
});

describe('findText', () => {
  it('finds text on page', async () => {
    const page = createMockPage();
    page.evaluate.mockResolvedValue({ found: true, x: 100, y: 200 });
    const session = createMockSession(page);
    const result = await findText(session as any, { text: 'hello' });
    expect(result.success).toBe(true);
  });

  it('returns not found when text is missing', async () => {
    const page = createMockPage();
    page.evaluate.mockResolvedValue({ found: false });
    const session = createMockSession(page);
    const result = await findText(session as any, { text: 'nonexistent' });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('ELEMENT_NOT_FOUND');
  });
});

describe('uploadFile', () => {
  it('uploads a file to an input element', async () => {
    const page = createMockPage();
    const mockElement = { uploadFile: vi.fn() };
    page.waitForSelector.mockResolvedValue(mockElement);
    const session = createMockSession(page);
    const result = await uploadFile(session as any, { selector: '#file', filePath: '/tmp/test.txt' });
    expect(result.success).toBe(true);
    expect(mockElement.uploadFile).toHaveBeenCalledWith('/tmp/test.txt');
  });
});
