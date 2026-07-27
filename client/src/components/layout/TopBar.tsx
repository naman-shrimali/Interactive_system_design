import { Link, NavLink } from 'react-router-dom';
import { Menu, Moon, Sun, StickyNote, Boxes } from 'lucide-react';
import { useThemeStore } from '../../store/useThemeStore';
import { cn } from '../../lib/cn';

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur">
      <button
        onClick={onMenu}
        aria-label="Open navigation"
        className="rounded-lg p-1.5 text-ink-muted hover:bg-surface lg:hidden"
      >
        <Menu size={18} />
      </button>

      <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <Boxes size={18} className="text-sky-500" />
        <span className="hidden sm:inline">Interactive System Design</span>
        <span className="sm:hidden">ISD</span>
      </Link>

      <nav className="ml-auto flex items-center gap-1 text-sm">
        <NavLink
          to="/notes"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5',
              isActive ? 'bg-surface text-ink' : 'text-ink-muted hover:bg-surface',
            )
          }
        >
          <StickyNote size={15} />
          <span className="hidden sm:inline">Notes</span>
        </NavLink>
        <button
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="rounded-lg p-2 text-ink-muted hover:bg-surface"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </nav>
    </header>
  );
}
