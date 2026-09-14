import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import DmApprovalQueue from '@/components/DmApprovalQueue';
import type { CampaignLead } from '@/hooks/useCampaignLeads';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
const sample = { id: 'prospect-1', full_name: 'Sarah Chen', status: 'dm_pending_approval', dm_text: 'A relevant message', profile_headline: 'B2B design', icp_match: true, icp_match_reason: 'Matches the campaign audience' } as CampaignLead;
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.invoke.mockResolvedValue({ data: {}, error: null }); });
it('approves only the selected pending DM without enabling a whole stage', async () => {
  const refresh = vi.fn();
  render(<DmApprovalQueue leads={[sample]} campaignProfileId="campaign-1" onRefresh={refresh} stageFlags={{ stage_connection_approved: true, stage_dm_approved: false, stage_followup_approved: false }} />);
  expect(screen.getByText('Matches the campaign audience')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Approve this DM & send' }));
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('approve-dms', { body: { lead_ids: ['prospect-1'], action: 'approve' } }));
  expect(refresh).toHaveBeenCalledOnce();
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
});
it('states the full stage scope before enabling connection notes', async () => {
  render(<DmApprovalQueue leads={[{ ...sample, status: 'pending_approval', connection_note: 'A connection note' }]} campaignProfileId="campaign-1" onRefresh={vi.fn()} />);
  expect(screen.getByText(/entire connection-note stage, including subsequent notes/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Enable automatic connection notes' }));
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('approve-dms', { body: { action: 'approve_stage', stage: 'connection', campaign_profile_id: 'campaign-1' } }));
});
it('does not report an approval when the server rejects it', async () => {
  mocks.invoke.mockResolvedValue({ data: { error: 'Campaign is paused' }, error: null });
  const refresh = vi.fn();
  render(<DmApprovalQueue leads={[sample]} campaignProfileId="campaign-1" onRefresh={refresh} stageFlags={{ stage_connection_approved: true, stage_dm_approved: false, stage_followup_approved: false }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Approve this DM & send' }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Failed: Campaign is paused'));
  expect(refresh).not.toHaveBeenCalled();
  expect(mocks.success).not.toHaveBeenCalled();
});
it('saves a draft edit for the selected prospect without approving it', async () => {
  render(<DmApprovalQueue leads={[sample]} campaignProfileId="campaign-1" onRefresh={vi.fn()} stageFlags={{ stage_connection_approved: true, stage_dm_approved: false, stage_followup_approved: false }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Edit message text' }), { target: { value: 'An edited draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('approve-dms', { body: { lead_ids: ['prospect-1'], action: 'edit', edits: { 'prospect-1': { custom_dm: 'An edited draft', dm_text: 'An edited draft' } } } }));
});
