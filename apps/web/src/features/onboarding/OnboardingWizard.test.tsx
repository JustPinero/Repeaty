import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
const mutateAsyncMock = vi.fn();

let isPendingValue = false;
let errorValue: Error | null = null;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('./useCompleteOnboarding', () => ({
  useCompleteOnboarding: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: isPendingValue,
    error: errorValue,
  }),
}));

import { OnboardingWizard } from './OnboardingWizard';
import { useOnboardingState } from './useOnboardingState';

const initialOnboarding = useOnboardingState.getState();

function resetState() {
  useOnboardingState.setState({
    step: 1,
    displayName: '',
    nativeLanguageCode: '',
    targets: [],
  });
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue(undefined);
    isPendingValue = false;
    errorValue = null;
    resetState();
    localStorage.clear();
  });

  it('renders only Step 1 when step === 1', () => {
    render(
      <MemoryRouter>
        <OnboardingWizard />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/name|what should we call you/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/native language/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/target language|i want to learn/i)).not.toBeInTheDocument();
  });

  it('renders only Step 2 when step === 2', () => {
    useOnboardingState.setState({ step: 2 });
    render(
      <MemoryRouter>
        <OnboardingWizard />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/native language/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/name|what should we call you/i)).not.toBeInTheDocument();
  });

  it('walks all three steps and submits with the captured store values', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OnboardingWizard />
      </MemoryRouter>,
    );

    // Step 1
    await user.type(screen.getByLabelText(/name|what should we call you/i), 'Ben');
    await user.click(screen.getByRole('button', { name: /next/i }));

    // Step 2
    await user.selectOptions(screen.getByLabelText(/native language/i), 'en-US');
    await user.click(screen.getByRole('button', { name: /next/i }));

    // Step 3
    await user.selectOptions(screen.getByLabelText(/target language|i want to learn/i), 'es');
    await user.selectOptions(screen.getByLabelText(/level|cefr/i), 'A1');
    await user.click(screen.getByRole('button', { name: /finish|done|complete/i }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(mutateAsyncMock).toHaveBeenCalledWith({
      displayName: 'Ben',
      nativeLanguageCode: 'en-US',
      targets: [{ language_code: 'es', cefr_level: 'A1' }],
    });
  });

  it('navigates to /app and resets the store after a successful submit', async () => {
    let resolveSubmit: () => void = () => {};
    mutateAsyncMock.mockImplementation(
      () => new Promise<void>((resolve) => { resolveSubmit = resolve; }),
    );

    useOnboardingState.setState({
      step: 3,
      displayName: 'Ben',
      nativeLanguageCode: 'en-US',
      targets: [{ language_code: 'es', cefr_level: 'A1' }],
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <OnboardingWizard />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /finish|done|complete/i }));

    // While the mutation is in flight, the store must NOT be reset and we
    // must NOT have navigated yet (back-button continuity guarantee).
    expect(useOnboardingState.getState().displayName).toBe('Ben');
    expect(navigateMock).not.toHaveBeenCalled();

    resolveSubmit();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/app', { replace: true });
    });
    // Now the store should be reset.
    expect(useOnboardingState.getState().displayName).toBe('');
    expect(useOnboardingState.getState().step).toBe(1);
    expect(useOnboardingState.getState().targets).toEqual([]);
  });

  it('renders an alert when the mutation surfaces an error', () => {
    errorValue = new Error('boom: rpc rejected');
    render(
      <MemoryRouter>
        <OnboardingWizard />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/boom: rpc rejected/i);
  });

  // Restore the original Zustand state when this file is done so other tests
  // don't see weirdness from this suite's mutations.
  afterAll(() => {
    useOnboardingState.setState(initialOnboarding);
  });
});

declare function afterAll(fn: () => void): void;
