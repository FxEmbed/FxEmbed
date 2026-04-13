import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';

export default defineConfig({
  integrations: [
    starlight({
      title: 'FxEmbed',
      logo: {
        src: './src/assets/fxembed.svg'
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/FxEmbed/FxEmbed' }
      ],
      customCss: ['./src/styles/custom.css'],
      plugins: [
        starlightOpenAPI([
          {
            base: 'api/twitter',
            label: 'FxTwitter API',
            schema: './specs/fxtwitter-openapi.json'
          },
          {
            base: 'api/bluesky',
            label: 'FxBluesky API',
            schema: './specs/fxbluesky-openapi.json'
          }
        ])
      ],
      sidebar: [
        {
          label: 'User Guide',
          items: [
            { label: 'Getting Started', slug: 'guide/getting-started' },
            { label: 'URL Modifiers', slug: 'guide/url-modifiers' },
            { label: 'Embedding Media', slug: 'guide/embedding-media' },
            { label: 'Advanced Features', slug: 'guide/advanced-features' },
            { label: 'FAQ', slug: 'guide/faq' }
          ]
        },
        {
          label: 'API Reference',
          items: [
            { label: 'Overview', slug: 'api/overview' },
            ...openAPISidebarGroups
          ]
        },
        {
          label: 'Deployment',
          items: [
            { label: 'Self-Hosting', slug: 'deployment/self-hosting' },
            { label: 'Configuration', slug: 'deployment/configuration' },
            { label: 'Credentials', slug: 'deployment/credentials' }
          ]
        }
      ]
    })
  ]
});
