export type IconName = 'image' | 'plane' | 'compass' | 'chat' | 'list';

const PATHS: Record<IconName, React.ReactNode> = {
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 16l-5-5-8 8" />
    </>
  ),
  plane: <path d="M10.5 13.5L3 11l1.5-1.5 8 .5L17 5.5a2 2 0 013 3L16 13l.5 8L15 22.5l-2.5-7.5-3 3 .3 3-1.3 1.3-2-3.3-3.3-2 1.3-1.3 3 .3 3-3z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  chat: <path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1h-9l-5 4v-4H4a1 1 0 01-1-1V6a1 1 0 011-1z" />,
  list: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {PATHS[name]}
    </svg>
  );
}
