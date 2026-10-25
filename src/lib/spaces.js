import { Sun, ListChecks, Flame, Target, NotebookPen, Library, StickyNote } from 'lucide-react'

export const SPACES = [
  { to: '/',        label: 'Today',   icon: Sun,         hue: 'var(--c-accent)',  key: '1' },
  { to: '/tasks',   label: 'Tasks',   icon: ListChecks,  hue: 'var(--m-tasks)',   key: '2' },
  { to: '/habits',  label: 'Habits',  icon: Flame,       hue: 'var(--m-habits)',  key: '3' },
  { to: '/goals',   label: 'Goals',   icon: Target,      hue: 'var(--m-goals)',   key: '4' },
  { to: '/journal', label: 'Journal', icon: NotebookPen, hue: 'var(--m-journal)', key: '5' },
  { to: '/library', label: 'Library', icon: Library,     hue: 'var(--m-library)', key: '6' },
  { to: '/notes',   label: 'Notes',   icon: StickyNote,  hue: 'var(--m-notes)',   key: '7' },
]
