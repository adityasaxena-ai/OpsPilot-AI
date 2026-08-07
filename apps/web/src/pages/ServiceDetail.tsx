import { Link } from 'react-router-dom';

export function ServiceDetail() {
  return (
    <div className="text-center py-16 fade-in">
      <p style={{ color: 'hsl(var(--text-tertiary))' }}>Service Detail — coming in Sprint 1.3</p>
      <Link to="/services" className="text-sm mt-2 block" style={{ color: 'hsl(220 90% 65%)' }}>
        ← Back to Services
      </Link>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="text-center py-16 fade-in">
      <p className="text-2xl font-bold mb-2" style={{ color: 'hsl(var(--text-primary))' }}>404</p>
      <p style={{ color: 'hsl(var(--text-tertiary))' }}>Page not found</p>
      <Link to="/" className="text-sm mt-3 block" style={{ color: 'hsl(220 90% 65%)' }}>
        ← Return to Command Center
      </Link>
    </div>
  );
}
