import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Bitbucket PR Review (AI)',
  version: '0.1.0',
  description:
    'Pending Bitbucket pull requests assigned to you, with AI-assisted reviews.',
  icons: {
    '16': 'icon16.png',
    '32': 'icon32.png',
    '48': 'icon48.png',
    '128': 'icon128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'PR Review',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['storage', 'alarms', 'notifications'],
  host_permissions: [
    'https://api.bitbucket.org/*',
    'https://api.anthropic.com/*',
    'https://generativelanguage.googleapis.com/*',
    'http://localhost/*',
    'http://127.0.0.1/*',
  ],
})
