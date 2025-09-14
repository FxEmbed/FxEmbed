export const sanitizeText = (text: string) => {
  return text
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

export const unescapeText = (text: string) => {
  return text
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
};

export const truncateWithEllipsis = (str: string, maxLength: number): string => {
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const segments = segmenter.segment(str);
  let truncated = '';
  let length = 0;

  for (const segment of segments) {
    if (length + segment.segment.length > maxLength) {
      break;
    }
    truncated += segment.segment;
    length += segment.segment.length;
  }

  return truncated.length < str.length ? truncated + '…' : truncated;
};

export async function withTimeout<T>(
  asyncTask: (signal: AbortSignal) => Promise<T>,
  timeout: number = 3500,
  retries: number = 3
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const result = await asyncTask(controller.signal);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      if (retries > 0) {
        // Try again, reducing the retries count
        return withTimeout(asyncTask, timeout, retries - 1);
      }
      throw new Error('Request has timed out too many times');
    } else {
      throw error as Error;
    }
  }
}

export const formatNumber = (num: number) => {
  if (num >= 1e6) {
    return (num / 1e6).toFixed(2) + 'M';
  } else if (num >= 1e3) {
    return (num / 1e3).toFixed(1) + 'K';
  } else {
    return num.toString();
  }
};

export const generateSnowflake = () => {
  const epoch = 1288834974657n; /* Twitter snowflake epoch */
  const timestamp = BigInt(Date.now()) - epoch;
  return String((timestamp << 22n) | BigInt(Math.floor(Math.random() * 696969)));
};

export const escapeRegex = (text: string) => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const formatImageUrl = (url: string, name = 'orig') => {
  try {
    // remove existing name in url in case of conflicting
    // e.g. https://pbs.twimg.com/media/foobar.jpg:orig
    const urlObj = new URL(url.replace(/:\w+$/, ''));

    if (name) {
      // add name parameter to url
      urlObj.searchParams.set('name', name);
    } else {
      urlObj.searchParams.delete('name');
    }
    return urlObj.toString();
  } catch (_e) {
    return url;
  }
};
