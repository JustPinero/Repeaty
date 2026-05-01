import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallHint } from './InstallHint';

const ORIGINAL_UA = navigator.userAgent;
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0';

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
}

function setStandalone(value: boolean) {
  Object.defineProperty(window.navigator, 'standalone', {
    value,
    configurable: true,
  });
}

describe('InstallHint', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setStandalone(false);
  });

  afterEach(() => {
    setUserAgent(ORIGINAL_UA);
  });

  it('renders on iOS Safari (not standalone, not dismissed)', () => {
    setUserAgent(IOS_UA);
    render(<InstallHint />);
    expect(screen.getByText(/Install Repeaty on your home screen/i)).toBeInTheDocument();
  });

  it('does NOT render on Chrome (non-iOS)', () => {
    setUserAgent(CHROME_UA);
    render(<InstallHint />);
    expect(screen.queryByText(/Install Repeaty on your home screen/i)).toBeNull();
  });

  it('does NOT render in standalone mode (already installed)', () => {
    setUserAgent(IOS_UA);
    setStandalone(true);
    render(<InstallHint />);
    expect(screen.queryByText(/Install Repeaty on your home screen/i)).toBeNull();
  });

  it('does NOT render after dismissal (sticky via localStorage)', () => {
    window.localStorage.setItem('repeaty:install-hint-dismissed', 'true');
    setUserAgent(IOS_UA);
    render(<InstallHint />);
    expect(screen.queryByText(/Install Repeaty on your home screen/i)).toBeNull();
  });

  it('Dismiss click hides the hint and writes to localStorage', async () => {
    setUserAgent(IOS_UA);
    const user = userEvent.setup();
    render(<InstallHint />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/Install Repeaty on your home screen/i)).toBeNull();
    expect(window.localStorage.getItem('repeaty:install-hint-dismissed')).toBe('true');
  });
});
