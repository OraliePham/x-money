import { chromium } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserContext, Page } from '@playwright/test';

export type Fingerprint = {
  userAgent: string;
  viewport: { width: number; height: number };
  locale: string;
  timezone: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number;
  languages: string[];
  webglVendor: string;
  webglRenderer: string;
};

export type ProfileConfig = {
  id: string;
  name: string;
  userDataDir: string;
  createdAt: string;
  lastUsed: string;
  fingerprint: Fingerprint;
  targetUrl?: string;
  updatedAt?: string;
};

type PersistentContextOptions = NonNullable<Parameters<typeof chromium.launchPersistentContext>[1]>;

type LaunchProfileOptions = {
  headless?: boolean;
  targetUrl?: string;
};

type StoredProfileConfig = Partial<ProfileConfig> & {
  id: string;
  userDataDir: string;
  createdAt?: string;
  updatedAt?: string;
};

const DEFAULT_BASE_PATH = './browser_profiles';
const DEFAULT_PROFILE_PREFIX = 'profile';
const DEFAULT_LOCALE = 'vi-VN';
const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

const WEBGL_VENDORS = [
  'Intel Inc.',
  'NVIDIA Corporation',
  'Google Inc. (Intel)',
  'Advanced Micro Devices, Inc.',
];

const WEBGL_RENDERERS = [
  'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
];

const PLATFORMS = ['Win32', 'Win64', 'MacIntel', 'Linux x86_64'];
const HARDWARE_OPTIONS = [4, 6, 8, 10, 12];
const MEMORY_OPTIONS = [4, 8, 16];

function pickRandom<T>(items: readonly T[]): T {
  const value = items[Math.floor(Math.random() * items.length)];
  if (value === undefined) {
    throw new Error('Cannot pick from an empty list');
  }

  return value;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class ProfileManager {
  private readonly basePath: string;
  private readonly activeContexts = new Map<string, BrowserContext>();

  constructor(basePath: string = DEFAULT_BASE_PATH) {
    this.basePath = path.resolve(basePath);
  }

  async createProfile(customId?: string, targetUrl?: string): Promise<ProfileConfig> {
    const id = customId ?? `${DEFAULT_PROFILE_PREFIX}_${randomUUID().slice(0, 8)}`;
    const profileDir = this.getProfilePath(id);
    const configPath = this.getConfigPath(id);
    const userDataDir = path.join(profileDir, 'user_data');

    if (await this.profileExists(id)) {
      throw new Error(`Profile with ID ${id} already exists`);
    }

    await mkdir(userDataDir, { recursive: true });

    const createdAt = nowIso();
    const config: ProfileConfig = {
      id,
      name: `Profile_${id}`,
      userDataDir,
      createdAt,
      lastUsed: createdAt,
      fingerprint: this.generateFingerprint(),
      ...(targetUrl === undefined ? {} : { targetUrl }),
    };

    await this.writeProfileConfig(configPath, config);
    return config;
  }

  async ensureProfile(profileId: string, targetUrl?: string): Promise<ProfileConfig> {
    const existing = await this.getProfile(profileId);
    if (existing) {
      const nextConfig = targetUrl === undefined ? existing : { ...existing, targetUrl };
      await this.writeProfileConfig(this.getConfigPath(profileId), nextConfig);
      return nextConfig;
    }

    return this.createProfile(profileId, targetUrl);
  }

  async launchProfile(
    profileId: string,
    options: LaunchProfileOptions = {},
  ): Promise<{ context: BrowserContext; page: Page; config: ProfileConfig }> {
    const config = await this.requireProfile(profileId);
    const updatedConfig = {
      ...config,
      ...(options.targetUrl === undefined ? {} : { targetUrl: options.targetUrl }),
      lastUsed: nowIso(),
      updatedAt: nowIso(),
    };

    await this.writeProfileConfig(this.getConfigPath(profileId), updatedConfig);

    const context = await chromium.launchPersistentContext(updatedConfig.userDataDir, {
      ...this.getLaunchOptions(updatedConfig, options),
    });

    await context.addInitScript(this.getStealthScript(updatedConfig.fingerprint));

    const page = context.pages()[0] ?? (await context.newPage());
    this.activeContexts.set(profileId, context);
    context.once('close', () => {
      this.activeContexts.delete(profileId);
    });

    if (updatedConfig.targetUrl) {
      await page.goto(updatedConfig.targetUrl, { waitUntil: 'domcontentloaded' });
    }

    return { context, page, config: updatedConfig };
  }

  async closeProfile(profileId: string): Promise<void> {
    const context = this.activeContexts.get(profileId);
    if (!context) return;

    await context.close();
    this.activeContexts.delete(profileId);
  }

  async closeAll(): Promise<void> {
    await Promise.all(Array.from(this.activeContexts.keys(), (id) => this.closeProfile(id)));
  }

  async listProfiles(): Promise<ProfileConfig[]> {
    await mkdir(this.basePath, { recursive: true });

    const entries = await readdir(this.basePath, { withFileTypes: true });
    const profiles = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => this.getProfile(entry.name)),
    );

    return profiles.filter((profile): profile is ProfileConfig => profile !== undefined);
  }

  async getProfile(profileId: string): Promise<ProfileConfig | undefined> {
    try {
      const content = await readFile(this.getConfigPath(profileId), 'utf8');
      const parsed: unknown = JSON.parse(content);
      return this.normalizeProfileConfig(parsed);
    } catch {
      return undefined;
    }
  }

  async deleteProfile(profileId: string, force = false): Promise<void> {
    if (this.activeContexts.has(profileId) && !force) {
      throw new Error(`Profile ${profileId} is running. Close it first or use force=true`);
    }

    await this.closeProfile(profileId);
    await rm(this.getProfilePath(profileId), { recursive: true, force: true });
  }

  isProfileRunning(profileId: string): boolean {
    return this.activeContexts.has(profileId);
  }

  getActiveProfilesCount(): number {
    return this.activeContexts.size;
  }

  private async profileExists(profileId: string): Promise<boolean> {
    return (await this.getProfile(profileId)) !== undefined;
  }

  private async requireProfile(profileId: string): Promise<ProfileConfig> {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile ${profileId} not found. Use createProfile() first.`);
    }

    await mkdir(profile.userDataDir, { recursive: true });
    return profile;
  }

  private getProfilePath(profileId: string): string {
    return path.join(this.basePath, profileId);
  }

  private getConfigPath(profileId: string): string {
    return path.join(this.getProfilePath(profileId), 'config.json');
  }

  private async writeProfileConfig(configPath: string, config: ProfileConfig): Promise<void> {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  }

  private normalizeProfileConfig(raw: unknown): ProfileConfig {
    const stored = raw as StoredProfileConfig;
    const createdAt = stored.createdAt ?? nowIso();
    const lastUsed = stored.lastUsed ?? stored.updatedAt ?? createdAt;

    return {
      id: stored.id,
      name: stored.name ?? `Profile_${stored.id}`,
      userDataDir: path.resolve(stored.userDataDir),
      createdAt,
      lastUsed,
      fingerprint: stored.fingerprint ?? this.generateFingerprint(),
      ...(stored.targetUrl === undefined ? {} : { targetUrl: stored.targetUrl }),
      ...(stored.updatedAt === undefined ? {} : { updatedAt: stored.updatedAt }),
    };
  }

  private generateFingerprint(): Fingerprint {
    return {
      userAgent: pickRandom(USER_AGENTS),
      viewport: { width: 1920, height: 1080 },
      locale: DEFAULT_LOCALE,
      timezone: DEFAULT_TIMEZONE,
      platform: pickRandom(PLATFORMS),
      hardwareConcurrency: pickRandom(HARDWARE_OPTIONS),
      deviceMemory: pickRandom(MEMORY_OPTIONS),
      languages: [DEFAULT_LOCALE, 'vi', 'en-US', 'en'],
      webglVendor: pickRandom(WEBGL_VENDORS),
      webglRenderer: pickRandom(WEBGL_RENDERERS),
    };
  }

  private getLaunchOptions(
    config: ProfileConfig,
    options: LaunchProfileOptions,
  ): PersistentContextOptions {
    return {
      headless: options.headless ?? false,
      viewport: config.fingerprint.viewport,
      userAgent: config.fingerprint.userAgent,
      locale: config.fingerprint.locale,
      timezoneId: config.fingerprint.timezone,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=ChromeWhatsNewUI,TranslateUI,OptimizationHints',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--no-first-run',
        '--disable-dev-shm-usage',
        '--disable-notifications',
        `--window-size=${config.fingerprint.viewport.width},${config.fingerprint.viewport.height}`,
        '--start-maximized',
      ],
      ignoreHTTPSErrors: true,
      timeout: 60_000,
    };
  }

  private getStealthScript(fingerprint: Fingerprint): string {
    return `
      (() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

        window.chrome = {
          runtime: {
            connect: () => ({ onMessage: { addListener: () => undefined }, disconnect: () => undefined }),
            sendMessage: () => undefined,
            onMessage: { addListener: () => undefined },
            onConnect: { addListener: () => undefined },
            id: '${randomUUID()}',
          },
          app: {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run' },
          },
        };

        const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
        if (originalQuery) {
          window.navigator.permissions.query = (parameters) => {
            if (parameters.name === 'notifications') {
              return Promise.resolve({ state: Notification.permission, onchange: null });
            }

            return originalQuery(parameters);
          };
        }

        const pluginArray = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];

        Object.defineProperty(navigator, 'plugins', {
          get: () => pluginArray,
        });

        Object.defineProperty(navigator, 'languages', {
          get: () => ${JSON.stringify(fingerprint.languages)},
        });

        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => ${fingerprint.hardwareConcurrency},
        });

        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => ${fingerprint.deviceMemory},
        });

        Object.defineProperty(navigator, 'platform', {
          get: () => '${fingerprint.platform}',
        });

        Object.defineProperty(navigator, 'maxTouchPoints', {
          get: () => 0,
        });

        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function getParameter(parameter) {
          if (parameter === 37445) return '${fingerprint.webglVendor}';
          if (parameter === 37446) return '${fingerprint.webglRenderer}';
          return originalGetParameter.call(this, parameter);
        };
      })();
    `;
  }
}
