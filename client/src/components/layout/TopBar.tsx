import { Link, NavLink } from 'react-router-dom';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import { useThemeStore } from '../../store/useThemeStore';
import { cn } from '../../lib/cn';

/** A packet on a wire — the one mark the product needs. */
function Mark() {
  return (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden="true">
      <rect x="1.5" y="5.5" width="6" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="12.5" y="5.5" width="6" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 10h5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="1.9" fill="rgb(var(--accent))" />
    </svg>
  );
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn('rounded px-2.5 py-1.5', isActive ? 'bg-surface text-ink' : 'text-ink-muted hover:text-ink');

export function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-sm">
      <button onClick={onMenu} aria-label="Open navigation" className="rounded p-1.5 text-ink-muted hover:bg-surface lg:hidden">
        <Menu size={18} />
      </button>

      <Link to="/" className="flex items-center gap-2 text-ink">
        <Mark />
        <span className="font-display text-[16px] font-semibold tracking-[-0.005em]">
          <span className="hidden sm:inline">Interactive System Design</span>
          <span className="sm:hidden">ISD</span>
        </span>
      </Link>

      <button
        onClick={onSearch}
        className="ml-3 hidden w-60 items-center gap-2 rounded border border-line px-2.5 py-1.5 text-left text-[13px] text-ink-faint hover:border-ink-faint md:flex"
      >
        <Search size={13} />
        <span className="flex-1">Search topics</span>
        <kbd className="rounded-sm border border-line px-1.5 font-mono text-[10.5px]">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>

      <nav className="ml-auto flex items-center gap-1 text-[14px]">
        <button onClick={onSearch} aria-label="Search topics" className="rounded p-2 text-ink-muted hover:bg-surface md:hidden">
          <Search size={16} />
        </button>
        <NavLink to="/dashboard" className={navLink}>
          Progress
        </NavLink>
        <NavLink to="/notes" className={navLink}>
          Notes
        </NavLink>
        <button
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="ml-1 rounded p-2 text-ink-muted hover:bg-surface hover:text-ink"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </nav>
    </header>
  );
}
