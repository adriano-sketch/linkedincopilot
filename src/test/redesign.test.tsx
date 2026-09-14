import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, it, expect, vi } from 'vitest';
import ContextDemo from '@/components/ContextDemo';
import Landing from '@/pages/Landing';
import PipelineStats from '@/components/PipelineStats';
import ProspectContext from '@/components/ProspectContext';
import type { CampaignLead } from '@/hooks/useCampaignLeads';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
afterEach(cleanup);
describe('Public product experience', () => {
  it('changes the prospect, source context and draft together', () => {
    render(<ContextDemo />);
    fireEvent.click(screen.getByRole('button', { name: /Alex Morgan/ }));
    expect(screen.getByRole('button', { name: /Alex Morgan/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Our team helps founder-led/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Example message' })).getByText(/Since Summit helps founders/)).toBeInTheDocument();
    expect(screen.queryByText(/With Northstar working/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Connection note' }));
    expect(screen.getByText(/Alex, I noticed Summit/)).toBeInTheDocument();
    expect(screen.getByText(/fictional data/)).toBeInTheDocument();
  });
  it('routes sign-in and signup separately and exposes mobile navigation', () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth?mode=signin');
    expect(screen.getAllByRole('link', { name: /Start free/ })[0]).toHaveAttribute('href', '/auth?mode=signup');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByText('Product'));
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
  });
});
describe('Workspace context and filters', () => {
  it('includes pending DMs in the review filter and can clear a selected filter', () => {
    const onStageClick = vi.fn();
    const { rerender } = render(<PipelineStats counts={{ dm_pending_approval: 3, pending_approval: 2, ready_for_dm: 1 }} onStageClick={onStageClick} />);
    const button = screen.getByRole('button', { name: 'Review: 6 prospects. Filter prospects.' });
    fireEvent.click(button);
    expect(onStageClick).toHaveBeenCalledWith('pending_approval');
    rerender(<PipelineStats counts={{ dm_pending_approval: 3 }} activeFilter="pending_approval" onStageClick={onStageClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review: 3 prospects. Filter prospects.' }));
    expect(onStageClick).toHaveBeenLastCalledWith(null);
  });
  it('does not invent profile context or qualify unknown prospects', () => {
    render(<ProspectContext lead={{ first_name: 'Alex', icp_match: null } as CampaignLead} />);
    expect(screen.getByText('Audience fit not confirmed')).toBeInTheDocument();
    expect(screen.getByText(/No profile summary available/)).toBeInTheDocument();
    expect(screen.queryByText('Matches campaign criteria')).not.toBeInTheDocument();
  });
  it('shows available profile data and the recorded qualification reason', () => {
    render(<ProspectContext lead={{ full_name: 'Sarah Chen', title: 'CEO', profile_current_title: 'Founder', company: 'Northstar', icp_match: true, icp_match_reason: 'Design agency serving B2B teams', profile_headline: 'Design for complex products' } as CampaignLead} />);
    expect(screen.getByText('Founder · Northstar')).toBeInTheDocument();
    expect(screen.getByText('Design agency serving B2B teams')).toBeInTheDocument();
    expect(screen.getByText('Design for complex products')).toBeInTheDocument();
  });
});
