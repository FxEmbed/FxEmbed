import { UnicodeString } from './unicodestring';

/* Helps replace t.co links with their originals */
export const linkFixer = (entities: TcoExpansion[] | undefined, text: string): string => {
  // console.log('got entities', {
  //   entities: tweet.legacy.entities
  // });
  if (Array.isArray(entities) && entities.length) {
    entities.forEach((url: TcoExpansion) => {
      let newURL = url.expanded_url ?? url.url ?? '';

      if (newURL.match(/^https:\/\/(x\.com|twitter\.com)\/i\/web\/status\/\w+/g) !== null) {
        newURL = '';
      }
      text = text.replace(url.url, newURL);
    });
  }

  /* Remove any link with unavailable original.
     This means that stuff like the t.co link to pic.twitter.com
     will get removed in image/video Tweets */
  text = text.replace(/ ?https?:\/\/t\.co\/\w{10}/g, '');

  return text;
};

export const linkFixerBsky = (facets: BlueskyFacet[], text: string): string => {
  let offset = 0;
  if (Array.isArray(facets) && facets.length) {
    console.log('facets', facets);
    facets.forEach((facet: BlueskyFacet) => {
      console.log('facet', facet);
      for (const feature of facet.features) {
        if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
          const pos = [facet.index.byteStart, facet.index.byteEnd];
          // Replace shortened link with original
          const unicodeText = new UnicodeString(text);
          text =
            unicodeText.slice(0, pos[0] + offset) +
            feature.uri +
            unicodeText.slice(pos[1] + offset);
          offset += feature.uri.length - (pos[1] - pos[0]);
        }
      }
    });
  }

  return text;
};
