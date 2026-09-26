import { useState } from 'react';

export function Avatar({ name, url }: { name: string; url: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className="avatar" aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
      {url && url !== failedUrl && (
        <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      )}
    </span>
  );
}
