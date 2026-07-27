import { Link, NavLink } from 'react-router-dom';
import { Network, StickyNote } from 'lucide-react';

export function TopBar() {
  return (
    <header className="h-14 shrink-0 border-b border-slate-200 flex items-center px-4 gap-4 bg-white">
      <Link to="/" className="flex items-center gap-2 font-semibold text-slate-800">
        <Network size={18} className="text-blue-600" />
        Interactive System Design
      </Link>
      <nav className="ml-auto flex items-center gap-4 text-sm">
        <NavLink
          to="/notes"
          className={({ isActive }) =>
            `flex items-center gap-1.5 ${isActive ? 'text-blue-700 font-medium' : 'text-slate-500 hover:text-slate-800'}`
          }
        >
          <StickyNote size={15} /> My notes
        </NavLink>
        <span className="text-slate-400">Local learner</span>
      </nav>
    </header>
  );
}
