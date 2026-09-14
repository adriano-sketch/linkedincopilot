import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import AuthPage from '@/pages/AuthPage';
const mocks = vi.hoisted(() => ({ signin: vi.fn(), signup: vi.fn(), reset: vi.fn(), update: vi.fn(), toast: vi.fn(), user: null as null | { id: string } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user, loading: false, signInWithEmail: mocks.signin, signUpWithEmail: mocks.signup }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { resetPasswordForEmail: mocks.reset, updateUser: mocks.update } } }));
beforeEach(() => { vi.clearAllMocks(); mocks.user = null; mocks.signin.mockResolvedValue({ error: null }); mocks.signup.mockResolvedValue({ error: null, data: { session: null } }); });
afterEach(cleanup);
function mount(url: string) { render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/auth" element={<AuthPage />} /><Route path="/onboarding" element={<p>Onboarding destination</p>} /></Routes></MemoryRouter>); }
it('honors sign-in links and submits existing credentials without signup validation', async () => {
  mount('/auth?mode=signin');
  expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'existingpass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  await waitFor(() => expect(mocks.signin).toHaveBeenCalledWith('person@example.com', 'existingpass'));
  expect(mocks.signup).not.toHaveBeenCalled();
});
it('validates a new password before creating an account', () => {
  mount('/auth?mode=signup');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'lowercaseonly' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
  expect(screen.getByRole('alert')).toHaveTextContent('uppercase');
  expect(mocks.signup).not.toHaveBeenCalled();
});
it('keeps an authenticated recovery session on the password recovery form', () => {
  mocks.user = { id: 'test-session' };
  mount('/auth?mode=recovery');
  expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
  expect(screen.queryByText('Onboarding destination')).not.toBeInTheDocument();
});
it('restores the submit button after an unexpected connection failure', async () => {
  mocks.signin.mockRejectedValue(new Error('Connection interrupted'));
  mount('/auth?mode=signin');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'person@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'existingpass' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Connection interrupted' })));
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
});
