const LOCAL_MODE_META = 'draftspace-mode';

function getModeMeta(): HTMLMetaElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.querySelector(`meta[name="${LOCAL_MODE_META}"]`);
}

export function isLocalMode(): boolean {
  return getModeMeta()?.content === 'local';
}

export function getApiBaseUrl(): string {
  if (isLocalMode() && typeof window !== 'undefined') {
    return `${window.location.origin}/api/github`;
  }

  return 'https://api.github.com';
}
