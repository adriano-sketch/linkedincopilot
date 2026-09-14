import { Link } from 'react-router-dom';
export default function Brand({ light = false }: { light?: boolean }) {
  return <Link to="/" aria-label="LinkedIn Copilot home" className={`copilot-brand ${light ? 'copilot-brand-light' : ''}`}>
    <span className="copilot-mark" aria-hidden="true"><span /><span /></span>
    <span>copilot<span className="copilot-brand-caption">FOR LINKEDIN</span></span>
  </Link>;
}
