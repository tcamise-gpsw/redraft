export function Avatar({
  login,
  avatarUrl,
  size,
}: {
  login: string;
  avatarUrl: string;
  size: 'sm' | 'md';
}) {
  const sizeClass = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const base = `${sizeClass} rounded-full border border-slate-700`;
  if (avatarUrl) {
    return <img src={avatarUrl} alt={`${login} avatar`} className={base} />;
  }
  return (
    <span
      className={`flex ${sizeClass} items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-medium select-none`}
    >
      {login[0]?.toUpperCase() ?? '?'}
    </span>
  );
}
