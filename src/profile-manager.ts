import { chromium, firefox, webkit } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';

import type { BrowserContext, BrowserType, Page } from '@playwright/test';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';

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
  colorDepth: number;
  screenResolution: { width: number; height: number };
  deviceScaleFactor: number;
  touchPoints: number;
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
  browserEngine: BrowserEngine;
  tags: string[];
  metadata: Record<string, unknown>;
};

export type ProfileStats = {
  profileId: string;
  pagesOpened: number;
  requestsSent: number;
  sessionStarted: string;
  lastActivity: string;
  errors: number;
};

type PersistentContextOptions = NonNullable<
  Parameters<typeof chromium.launchPersistentContext>[1]
>;

type LaunchProfileOptions = {
  headless?: boolean;
  targetUrl?: string;
  browserEngine?: BrowserEngine;
  warmup?: boolean;
  enableNetworkIntercept?: boolean;
  geolocation?: { latitude: number; longitude: number };
  proxy?: { server: string; username?: string; password?: string };
};

type StoredProfileConfig = Partial<ProfileConfig> & {
  id: string;
  userDataDir: string;
  createdAt?: string;
  updatedAt?: string;
};

type Persona = {
  name: string;
  platform: string;
  userAgents: readonly string[];
  webglVendors: readonly string[];
  webglRenderers: readonly string[];
  memoryOptions: readonly number[];
  cpuOptions: readonly number[];
  screenOptions: ReadonlyArray<{ width: number; height: number }>;
  colorDepth: number;
  deviceScaleFactor: number;
  touchPoints: number;
};

// ============================================================================
// CONSTANTS & PERSONAS
// ============================================================================

const DEFAULT_BASE_PATH = './browser_profiles';
const DEFAULT_PROFILE_PREFIX = 'profile';
const DEFAULT_LOCALE = 'vi-VN';
const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Realistic browser personas to ensure fingerprint consistency.
 * Each persona bundles coherent OS, GPU, memory, and CPU specs.
 */
const PERSONAS: readonly Persona[] = [
  {
    name: 'Windows Laptop - Office',
    platform: 'Win32',
    userAgents: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    ],
    webglVendors: ['Intel Inc.', 'Google Inc. (Intel)'],
    webglRenderers: [
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)',
    ],
    memoryOptions: [8, 16],
    cpuOptions: [4, 8],
    screenOptions: [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
    ],
    colorDepth: 24,
    deviceScaleFactor: 1,
    touchPoints: 0,
  },
  {
    name: 'MacBook Pro - Creative',
    platform: 'MacIntel',
    userAgents: [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    ],
    webglVendors: ['Intel Inc.', 'Apple Inc.', 'Google Inc. (Apple)'],
    webglRenderers: [
      'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 655 OpenGL 4.1)',
      'ANGLE (Apple, Apple M1 OpenGL 4.1)',
      'ANGLE (Apple, Apple M2 OpenGL 4.1)',
    ],
    memoryOptions: [8, 16, 32],
    cpuOptions: [8, 10, 12],
    screenOptions: [
      { width: 1680, height: 1050 },
      { width: 2560, height: 1600 },
      { width: 1440, height: 900 },
    ],
    colorDepth: 30,
    deviceScaleFactor: 2,
    touchPoints: 0,
  },
  {
    name: 'Linux Developer - Casual',
    platform: 'Linux x86_64',
    userAgents: [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    ],
    webglVendors: ['Intel Inc.', 'NVIDIA Corporation', 'AMD'],
    webglRenderers: [
      'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (WHL GT2))',
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB)',
      'ANGLE (AMD, AMD Radeon RX 580 (POLARIS10, DRM 3.42.0, LLVM 15.0.7))',
    ],
    memoryOptions: [4, 8, 16],
    cpuOptions: [4, 6, 8, 12],
    screenOptions: [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
    ],
    colorDepth: 24,
    deviceScaleFactor: 1,
    touchPoints: 0,
  },
  {
    name: 'Mobile Android - Chrome',
    platform: 'Linux armv8l',
    userAgents: [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
    ],
    webglVendors: ['Qualcomm', 'ARM', 'Google Inc. (Qualcomm)'],
    webglRenderers: [
      'ANGLE (Qualcomm, Adreno (TM) 750)',
      'ANGLE (ARM, Mali-G78)',
      'ANGLE (Google, Vulkan 1.3.0)',
    ],
    memoryOptions: [4, 6, 8],
    cpuOptions: [8],
    screenOptions: [
      { width: 412, height: 915 },
      { width: 384, height: 854 },
      { width: 360, height: 800 },
    ],
    colorDepth: 24,
    deviceScaleFactor: 2.75,
    touchPoints: 5,
  },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function pickRandom<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from an empty array');
  }
  return items[Math.floor(Math.random() * items.length)]!;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Generates a cryptographically secure random integer between min and max (inclusive).
 */
function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  const randomBuffer = new Uint32Array(1);
  crypto.getRandomValues(randomBuffer);
  const randomValue = randomBuffer[0]! / (0xffffffff + 1);
  return Math.floor(randomValue * range) + min;
}

// ============================================================================
// HUMAN BEHAVIOR SIMULATION
// ============================================================================

export class HumanBehaviorSimulator {
  /**
   * Generates a Bezier curve path between two points for realistic mouse movement.
   */
  static generateMousePath(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    steps: number = 40,
  ): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    // Control points with slight randomization
    const cp1x = fromX + (toX - fromX) * 0.25 + (Math.random() - 0.5) * 200;
    const cp1y = fromY + (toY - fromY) * 0.1 + (Math.random() - 0.5) * 100;
    const cp2x = fromX + (toX - fromX) * 0.75 + (Math.random() - 0.5) * 200;
    const cp2y = fromY + (toY - fromY) * 0.9 + (Math.random() - 0.5) * 100;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Cubic Bezier formula
      const x =
        Math.pow(1 - t, 3) * fromX +
        3 * Math.pow(1 - t, 2) * t * cp1x +
        3 * (1 - t) * Math.pow(t, 2) * cp2x +
        Math.pow(t, 3) * toX;
      const y =
        Math.pow(1 - t, 3) * fromY +
        3 * Math.pow(1 - t, 2) * t * cp1y +
        3 * (1 - t) * Math.pow(t, 2) * cp2y +
        Math.pow(t, 3) * toY;
      points.push({ x: Math.round(x), y: Math.round(y) });
    }
    return points;
  }

  /**
   * Simulates human-like typing with variable delays.
   */
  static async humanType(
    page: Page,
    selector: string,
    text: string,
    options?: { minDelay?: number; maxDelay?: number; typoRate?: number },
  ): Promise<void> {
    const minDelay = options?.minDelay ?? 30;
    const maxDelay = options?.maxDelay ?? 150;
    const typoRate = options?.typoRate ?? 0.02;

    await page.click(selector);

    for (const char of text) {
      // Introduce random typos
      if (Math.random() < typoRate) {
        const typoChar = String.fromCharCode(
          char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1),
        );
        await page.keyboard.type(typoChar);
        await page.waitForTimeout(randomInt(100, 300));
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(randomInt(50, 150));
      }

      await page.keyboard.type(char);
      await page.waitForTimeout(randomInt(minDelay, maxDelay));
    }
  }

  /**
   * Simulates human-like scrolling behavior.
   */
  static async humanScroll(
    page: Page,
    direction: 'up' | 'down' = 'down',
    distance?: number,
  ): Promise<void> {
    const scrollDistance = distance ?? randomInt(300, 900);
    const delta = direction === 'down' ? scrollDistance : -scrollDistance;

    // Simulate multiple small scrolls with pauses
    const steps = randomInt(3, 8);
    const stepDistance = Math.round(delta / steps);

    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, stepDistance);
      await page.waitForTimeout(randomInt(50, 200));
    }

    // Random pause for "reading"
    await page.waitForTimeout(randomInt(500, 3000));
  }

  /**
   * Moves mouse along a Bezier curve path.
   */
  static async humanMouseMove(
    page: Page,
    toX: number,
    toY: number,
  ): Promise<void> {
    const fromPosition = await page.evaluate(() => {
      const browserWindow = window as Window & { mouseX?: number; mouseY?: number };
      return {
        x: browserWindow.mouseX ?? 100,
        y: browserWindow.mouseY ?? 100,
      };
    });

    const path = this.generateMousePath(fromPosition.x, fromPosition.y, toX, toY);

    for (const point of path) {
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(randomInt(5, 20));
    }

    // Update stored position
    await page.evaluate(
      ({ x, y }) => {
        (window as any).mouseX = x;
        (window as any).mouseY = y;
      },
      { x: toX, y: toY },
    );
  }
}

// ============================================================================
// PROFILE MANAGER
// ============================================================================

export class ProfileManager extends EventEmitter {
  private readonly basePath: string;
  private readonly activeContexts = new Map<string, BrowserContext>();
  private readonly profileStats = new Map<string, ProfileStats>();

  constructor(basePath: string = DEFAULT_BASE_PATH) {
    super();
    this.basePath = path.resolve(basePath);
  }

  // ==========================================================================
  // PROFILE CREATION & MANAGEMENT
  // ==========================================================================

  async createProfile(
    customId?: string,
    options?: {
      targetUrl?: string;
      browserEngine?: BrowserEngine;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<ProfileConfig> {
    const id = customId ?? `${DEFAULT_PROFILE_PREFIX}_${randomUUID().slice(0, 8)}`;
    const profileDir = this.getProfilePath(id);
    const userDataDir = path.join(profileDir, 'user_data');

    if (await this.profileExists(id)) {
      throw new Error(`Profile with ID "${id}" already exists`);
    }

    await mkdir(userDataDir, { recursive: true });

    const createdAt = nowIso();
    const config: ProfileConfig = {
      id,
      name: `Profile_${id}`,
      userDataDir,
      createdAt,
      lastUsed: createdAt,
      fingerprint: this.generateConsistentFingerprint(),
      browserEngine: options?.browserEngine ?? 'chromium',
      tags: options?.tags ?? [],
      metadata: options?.metadata ?? {},
      ...(options?.targetUrl !== undefined ? { targetUrl: options.targetUrl } : {}),
    };

    await this.writeProfileConfig(id, config);
    return config;
  }

  async ensureProfile(
    profileId: string,
    options?: {
      targetUrl?: string;
      browserEngine?: BrowserEngine;
      tags?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<ProfileConfig> {
    const existing = await this.getProfile(profileId);
    if (existing) {
      const updated: ProfileConfig = {
        ...existing,
        ...(options?.targetUrl !== undefined && { targetUrl: options.targetUrl }),
        ...(options?.browserEngine !== undefined && { browserEngine: options.browserEngine }),
        ...(options?.tags !== undefined && { tags: options.tags }),
        ...(options?.metadata !== undefined && { metadata: options.metadata }),
      };
      await this.writeProfileConfig(profileId, updated);
      return updated;
    }

    return this.createProfile(profileId, options);
  }

  // ==========================================================================
  // BROWSER LAUNCH
  // ==========================================================================

  async launchProfile(
    profileId: string,
    options: LaunchProfileOptions = {},
  ): Promise<{
    context: BrowserContext;
    page: Page;
    config: ProfileConfig;
    stats: ProfileStats;
  }> {
    if (this.activeContexts.has(profileId)) {
      throw new Error(`Profile "${profileId}" is already running`);
    }

    const config = await this.requireProfile(profileId);
    const resolvedTargetUrl = options.targetUrl ?? config.targetUrl;

    const updatedConfig: ProfileConfig = {
      ...config,
      lastUsed: nowIso(),
      updatedAt: nowIso(),
      browserEngine: options.browserEngine ?? config.browserEngine,
      ...(resolvedTargetUrl !== undefined ? { targetUrl: resolvedTargetUrl } : {}),
    };

    await this.writeProfileConfig(profileId, updatedConfig);

    // Initialize stats
    const stats: ProfileStats = {
      profileId,
      pagesOpened: 0,
      requestsSent: 0,
      sessionStarted: nowIso(),
      lastActivity: nowIso(),
      errors: 0,
    };
    this.profileStats.set(profileId, stats);

    // Select browser engine
    const browserType = this.getBrowserType(updatedConfig.browserEngine);

    // Launch context
    await this.cleanupStaleProfileLocks(updatedConfig.userDataDir);
    const launchOptions = this.buildLaunchOptions(updatedConfig, options);
    const context = await browserType.launchPersistentContext(
      updatedConfig.userDataDir,
      launchOptions as any,
    );

    // Apply stealth enhancements
    await context.addInitScript(this.buildStealthScript(updatedConfig.fingerprint));

    // Network monitoring for research
    if (options.enableNetworkIntercept) {
      await this.setupNetworkMonitoring(context, stats);
    }

    // Setup page event tracking
    context.on('page', () => {
      stats.pagesOpened++;
      stats.lastActivity = nowIso();
    });

    context.on('close', () => {
      this.activeContexts.delete(profileId);
      this.emit('profileClosed', profileId);
    });

    // Get or create page
    const page = context.pages()[0] ?? (await context.newPage());
    this.activeContexts.set(profileId, context);

    // Initialize mouse position tracking
    await page.evaluate(() => {
      (window as any).mouseX = 100;
      (window as any).mouseY = 100;
    });

    // Session warmup for anti-detection
    if (options.warmup !== false) {
      await this.warmupSession(page);
    }

    // Navigate to target
    if (updatedConfig.targetUrl) {
      await page.goto(updatedConfig.targetUrl, { waitUntil: 'domcontentloaded' });
    }

    this.emit('profileLaunched', profileId, stats);
    return { context, page, config: updatedConfig, stats };
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  async closeProfile(profileId: string): Promise<void> {
    const context = this.activeContexts.get(profileId);
    if (!context) return;

    try {
      await context.close();
    } catch (_error) {
      // Force cleanup
      this.activeContexts.delete(profileId);
    }
  }

  async closeAll(): Promise<void> {
    const ids = Array.from(this.activeContexts.keys());
    await Promise.allSettled(ids.map((id) => this.closeProfile(id)));
    this.activeContexts.clear();
  }

  async deleteProfile(profileId: string, force = false): Promise<void> {
    if (this.activeContexts.has(profileId) && !force) {
      throw new Error(
        `Profile "${profileId}" is currently running. Close it first or use force=true.`,
      );
    }

    await this.closeProfile(profileId);
    const profilePath = this.getProfilePath(profileId);
    await rm(profilePath, { recursive: true, force: true });
    this.profileStats.delete(profileId);
    this.emit('profileDeleted', profileId);
  }

  // ==========================================================================
  // QUERY METHODS
  // ==========================================================================

  async listProfiles(): Promise<ProfileConfig[]> {
    await mkdir(this.basePath, { recursive: true });

    const entries = await readdir(this.basePath, { withFileTypes: true });
    const profiles = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.getProfile(entry.name)),
    );

    return profiles.filter((p): p is ProfileConfig => p !== undefined);
  }

  async listProfilesByTag(tag: string): Promise<ProfileConfig[]> {
    const all = await this.listProfiles();
    return all.filter((p) => p.tags.includes(tag));
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

  getProfileStats(profileId: string): ProfileStats | undefined {
    return this.profileStats.get(profileId);
  }

  isProfileRunning(profileId: string): boolean {
    return this.activeContexts.has(profileId);
  }

  getActiveProfilesCount(): number {
    return this.activeContexts.size;
  }

  // ==========================================================================
  // PRIVATE: PROFILE PATH HELPERS
  // ==========================================================================

  private getProfilePath(profileId: string): string {
    return path.join(this.basePath, profileId);
  }

  private getConfigPath(profileId: string): string {
    return path.join(this.getProfilePath(profileId), 'config.json');
  }

  private async profileExists(profileId: string): Promise<boolean> {
    return (await this.getProfile(profileId)) !== undefined;
  }

  private async requireProfile(profileId: string): Promise<ProfileConfig> {
    const profile = await this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile "${profileId}" not found. Use createProfile() first.`);
    }
    await mkdir(profile.userDataDir, { recursive: true });
    return profile;
  }

  private async cleanupStaleProfileLocks(userDataDir: string): Promise<void> {
    const lockFiles = [
      'lockfile',
      'SingletonLock',
      'SingletonCookie',
      'SingletonSocket',
      'DevToolsActivePort',
    ];

    await Promise.allSettled(
      lockFiles.map((file) => rm(path.join(userDataDir, file), { force: true })),
    );
  }

  private async writeProfileConfig(
    profileId: string,
    config: ProfileConfig,
  ): Promise<void> {
    const configPath = this.getConfigPath(profileId);
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
      fingerprint: this.normalizeFingerprint(stored.fingerprint),
      browserEngine: stored.browserEngine ?? 'chromium',
      tags: stored.tags ?? [],
      metadata: stored.metadata ?? {},
      ...(stored.targetUrl !== undefined ? { targetUrl: stored.targetUrl } : {}),
      ...(stored.updatedAt !== undefined ? { updatedAt: stored.updatedAt } : {}),
    };
  }

  private normalizeFingerprint(raw: unknown): Fingerprint {
    const defaults = this.generateConsistentFingerprint();
    if (!raw || typeof raw !== 'object') {
      return defaults;
    }

    const partial = raw as Partial<Fingerprint>;
    return {
      userAgent: typeof partial.userAgent === 'string' ? partial.userAgent : defaults.userAgent,
      viewport: this.normalizeResolution(partial.viewport, defaults.viewport),
      locale: typeof partial.locale === 'string' ? partial.locale : defaults.locale,
      timezone: typeof partial.timezone === 'string' ? partial.timezone : defaults.timezone,
      platform: typeof partial.platform === 'string' ? partial.platform : defaults.platform,
      hardwareConcurrency: this.normalizePositiveNumber(
        partial.hardwareConcurrency,
        defaults.hardwareConcurrency,
      ),
      deviceMemory: this.normalizePositiveNumber(partial.deviceMemory, defaults.deviceMemory),
      languages:
        Array.isArray(partial.languages) && partial.languages.every((lang) => typeof lang === 'string')
          ? partial.languages
          : defaults.languages,
      webglVendor:
        typeof partial.webglVendor === 'string' ? partial.webglVendor : defaults.webglVendor,
      webglRenderer:
        typeof partial.webglRenderer === 'string' ? partial.webglRenderer : defaults.webglRenderer,
      colorDepth: this.normalizePositiveNumber(partial.colorDepth, defaults.colorDepth),
      screenResolution: this.normalizeResolution(
        partial.screenResolution,
        this.normalizeResolution(partial.viewport, defaults.screenResolution),
      ),
      deviceScaleFactor: this.normalizePositiveNumber(
        partial.deviceScaleFactor,
        defaults.deviceScaleFactor,
      ),
      touchPoints: this.normalizeNonNegativeNumber(partial.touchPoints, defaults.touchPoints),
    };
  }

  private normalizeResolution(
    value: unknown,
    fallback: { width: number; height: number },
  ): { width: number; height: number } {
    if (!value || typeof value !== 'object') {
      return fallback;
    }

    const resolution = value as { width?: unknown; height?: unknown };
    return {
      width: this.normalizePositiveNumber(resolution.width, fallback.width),
      height: this.normalizePositiveNumber(resolution.height, fallback.height),
    };
  }

  private normalizePositiveNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private normalizeNonNegativeNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  // ==========================================================================
  // PRIVATE: FINGERPRINT GENERATION (CONSISTENT PERSONA-BASED)
  // ==========================================================================

  private generateConsistentFingerprint(): Fingerprint {
    const persona = pickRandom(PERSONAS);
    const screen = pickRandom(persona.screenOptions);

    return {
      userAgent: pickRandom(persona.userAgents),
      viewport: { width: screen.width, height: screen.height },
      screenResolution: { width: screen.width, height: screen.height },
      locale: DEFAULT_LOCALE,
      timezone: DEFAULT_TIMEZONE,
      platform: persona.platform,
      hardwareConcurrency: pickRandom(persona.cpuOptions),
      deviceMemory: pickRandom(persona.memoryOptions),
      languages: [DEFAULT_LOCALE, 'vi', 'en-US', 'en'],
      webglVendor: pickRandom(persona.webglVendors),
      webglRenderer: pickRandom(persona.webglRenderers),
      colorDepth: persona.colorDepth,
      deviceScaleFactor: persona.deviceScaleFactor,
      touchPoints: persona.touchPoints,
    };
  }

  // ==========================================================================
  // PRIVATE: BROWSER ENGINE SELECTION
  // ==========================================================================

  private getBrowserType(engine: BrowserEngine): BrowserType {
    switch (engine) {
      case 'chromium':
        return chromium;
      case 'firefox':
        return firefox;
      case 'webkit':
        return webkit;
      default:
        return chromium;
    }
  }

  // ==========================================================================
  // PRIVATE: LAUNCH OPTIONS BUILDER
  // ==========================================================================

  private buildLaunchOptions(
    config: ProfileConfig,
    options: LaunchProfileOptions,
  ): PersistentContextOptions {
    const fingerprint = config.fingerprint;

    const launchArgs: string[] = [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=ChromeWhatsNewUI,TranslateUI,OptimizationHints',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--no-first-run',
      '--disable-dev-shm-usage',
      '--disable-notifications',
      '--disable-sync',
      '--disable-breakpad',
      '--disable-crash-reporter',
      '--disable-domain-reliability',
      '--disable-background-networking',
      '--disable-ipc-flooding-protection',
      `--window-size=${fingerprint.viewport.width},${fingerprint.viewport.height}`,
    ];

    // Only add proxy args if configured
    if (options.proxy) {
      launchArgs.push(`--proxy-server=${options.proxy.server}`);
    }

    const contextOptions: PersistentContextOptions & {
      proxy?: { server: string; username?: string; password?: string };
      geolocation?: { latitude: number; longitude: number };
    } = {
      headless: options.headless ?? false,
      viewport: fingerprint.viewport,
      userAgent: fingerprint.userAgent,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezone,
      colorScheme: 'light',
      deviceScaleFactor: fingerprint.deviceScaleFactor,
      ignoreHTTPSErrors: true,
      args: launchArgs,
      timeout: 60_000,
    };

    // Apply proxy
    if (options.proxy) {
      contextOptions.proxy = options.proxy;
    }

    // Apply geolocation
    if (options.geolocation) {
      contextOptions.geolocation = options.geolocation;
      contextOptions.permissions = ['geolocation'];
    }

    return contextOptions;
  }

  // ==========================================================================
  // PRIVATE: NETWORK MONITORING (FOR AI RESEARCH DATA COLLECTION)
  // ==========================================================================

  private async setupNetworkMonitoring(
    context: BrowserContext,
    stats: ProfileStats,
  ): Promise<void> {
    context.on('request', (request) => {
      stats.requestsSent++;
      stats.lastActivity = nowIso();

      // Emit event for external data collectors
      this.emit('networkRequest', {
        profileId: stats.profileId,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        timestamp: nowIso(),
      });
    });

    context.on('requestfailed', (request) => {
      stats.errors++;
      this.emit('networkError', {
        profileId: stats.profileId,
        url: request.url(),
        failure: request.failure()?.errorText ?? 'Unknown',
        timestamp: nowIso(),
      });
    });
  }

  // ==========================================================================
  // PRIVATE: COMPREHENSIVE STEALTH SCRIPT
  // ==========================================================================

  private buildStealthScript(fingerprint: Fingerprint): string {
    return `
      (() => {
        // ====================================================================
        // FIX 1: Properly remove webdriver flag (do NOT set to undefined)
        // ====================================================================
        delete Object.getPrototypeOf(navigator).webdriver;
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
          configurable: true,
          enumerable: true,
        });

        // ====================================================================
        // FIX 2: Comprehensive Chrome runtime spoofing
        // ====================================================================
        window.chrome = {
          runtime: {
            platform: '${fingerprint.platform}',
            connect: () => ({ onMessage: { addListener: () => {} }, onDisconnect: { addListener: () => {} }, postMessage: () => {}, disconnect: () => {} }),
            sendMessage: () => {},
            onMessage: { addListener: () => {} },
            onConnect: { addListener: () => {} },
            getPlatformInfo: (cb) => cb({ os: '${fingerprint.platform === 'MacIntel' ? 'mac' : fingerprint.platform === 'Win32' ? 'win' : 'linux'}' }),
            id: '${randomUUID().replace(/-/g, '')}',
            getManifest: () => ({}),
            getURL: (path) => 'chrome-extension://default/' + path,
          },
          app: {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
            getDetails: () => null,
            getIsInstalled: () => false,
            runningState: () => 'cannot_run',
          },
          loadTimes: () => ({
            requestTime: Date.now() / 1000,
            startLoadTime: Date.now() / 1000,
            commitLoadTime: Date.now() / 1000,
            finishDocumentLoadTime: Date.now() / 1000,
            finishLoadTime: Date.now() / 1000,
            firstPaintTime: Date.now() / 1000,
            firstPaintAfterLoadTime: Date.now() / 1000,
            navigationType: 'Other',
            wasFetchedViaSpdy: true,
            wasNpnNegotiated: true,
            npnNegotiatedProtocol: 'http/1.1',
            connectionInfo: 'http/1.1',
          }),
        };

        // ====================================================================
        // FIX 3: Notification permission spoofing
        // ====================================================================
        const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
        if (originalQuery) {
          window.navigator.permissions.query = (parameters) => {
            if (parameters.name === 'notifications') {
              return Promise.resolve({
                state: Notification.permission || 'prompt',
                onchange: null,
              });
            }
            if (parameters.name === 'clipboard-read' || parameters.name === 'clipboard-write') {
              return Promise.resolve({ state: 'prompt', onchange: null });
            }
            return originalQuery(parameters);
          };
        }

        // ====================================================================
        // FIX 4: Realistic plugins array
        // ====================================================================
        const pluginArray = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2 },
        ];

        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const plugins = [...pluginArray];
            plugins.item = (i) => plugins[i] || null;
            plugins.namedItem = (name) => plugins.find(p => p.name === name) || null;
            plugins.refresh = () => {};
            Object.setPrototypeOf(plugins, PluginArray.prototype);
            return plugins;
          },
          enumerable: true,
        });

        Object.defineProperty(navigator, 'mimeTypes', {
          get: () => {
            const mimes = [
              { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: pluginArray[0] },
              { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: pluginArray[0] },
            ];
            mimes.item = (i) => mimes[i] || null;
            mimes.namedItem = (name) => mimes.find(m => m.type === name) || null;
            Object.setPrototypeOf(mimes, MimeTypeArray.prototype);
            return mimes;
          },
          enumerable: true,
        });

        // ====================================================================
        // FIX 5: Navigator properties
        // ====================================================================
        Object.defineProperty(navigator, 'languages', {
          get: () => ${JSON.stringify(fingerprint.languages)},
        });
        Object.defineProperty(navigator, 'language', {
          get: () => '${fingerprint.languages[0]}',
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
          get: () => ${fingerprint.touchPoints},
        });
        Object.defineProperty(navigator, 'vendor', {
          get: () => 'Google Inc.',
        });
        Object.defineProperty(navigator, 'vendorSub', {
          get: () => '',
        });
        Object.defineProperty(navigator, 'productSub', {
          get: () => '20030107',
        });

        // ====================================================================
        // FIX 6: Screen properties
        // ====================================================================
        Object.defineProperty(screen, 'colorDepth', {
          get: () => ${fingerprint.colorDepth},
        });
        Object.defineProperty(screen, 'pixelDepth', {
          get: () => ${fingerprint.colorDepth},
        });
        Object.defineProperty(screen, 'width', {
          get: () => ${fingerprint.screenResolution.width},
        });
        Object.defineProperty(screen, 'height', {
          get: () => ${fingerprint.screenResolution.height},
        });

        // ====================================================================
        // FIX 7: COMPREHENSIVE WebGL SPOOFING (including OffscreenCanvas)
        // ====================================================================
        const vendor = '${fingerprint.webglVendor}';
        const renderer = '${fingerprint.webglRenderer}';
        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
        const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;

        const patchedGetParameter = function(parameter) {
          if (parameter === 37445) return vendor; // UNMASKED_VENDOR_WEBGL
          if (parameter === 37446) return renderer; // UNMASKED_RENDERER_WEBGL
          if (parameter === 7936) return vendor; // VENDOR (WebGL2)
          if (parameter === 7937) return renderer; // RENDERER (WebGL2)
          return originalGetParameter.call(this, parameter);
        };

        WebGLRenderingContext.prototype.getParameter = patchedGetParameter;
        WebGL2RenderingContext.prototype.getParameter = patchedGetParameter;

        // Patch OffscreenCanvas to prevent GPU fingerprinting in Workers
        if (typeof OffscreenCanvas !== 'undefined') {
          const originalGetContext = OffscreenCanvas.prototype.getContext;
          OffscreenCanvas.prototype.getContext = function(contextType, contextAttributes) {
            const ctx = originalGetContext.call(this, contextType, contextAttributes);
            if (ctx && (ctx instanceof WebGLRenderingContext || ctx instanceof WebGL2RenderingContext)) {
              ctx.getParameter = patchedGetParameter;
              // Override getExtension to prevent debug info leak
              const originalGetExtension = ctx.getExtension;
              ctx.getExtension = function(name) {
                if (name === 'WEBGL_debug_renderer_info') return null;
                return originalGetExtension.call(this, name);
              };
            }
            return ctx;
          };
        }

        // Patch HTMLCanvasElement for completeness
        const originalGetContext2 = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(contextType, contextAttributes) {
          const ctx = originalGetContext2.call(this, contextType, contextAttributes);
          if (ctx && (ctx instanceof WebGLRenderingContext || ctx instanceof WebGL2RenderingContext)) {
            ctx.getParameter = patchedGetParameter;
            const originalGetExtension = ctx.getExtension;
            ctx.getExtension = function(name) {
              if (name === 'WEBGL_debug_renderer_info') return null;
              return originalGetExtension.call(this, name);
            };
          }
          return ctx;
        };

        // ====================================================================
        // FIX 8: Prevent WebDriver detection via iframe
        // ====================================================================
        const originalAttachShadow = Element.prototype.attachShadow;
        Element.prototype.attachShadow = function(init) {
          return originalAttachShadow.call(this, { ...init, mode: init.mode || 'closed' });
        };

        // ====================================================================
        // FIX 9: Canvas fingerprint randomization
        // ====================================================================
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
          const ctx = this.getContext('2d');
          if (ctx) {
            const imageData = ctx.getImageData(0, 0, 1, 1);
            // Add tiny noise to prevent exact fingerprint matching
            imageData.data[3] = imageData.data[3] ^ 1;
            ctx.putImageData(imageData, 0, 0);
          }
          return originalToDataURL.call(this, type, quality);
        };

        // ====================================================================
        // FIX 10: Override Intl.DateTimeFormat for timezone consistency
        // ====================================================================
        const originalDateTimeFormat = Intl.DateTimeFormat;
        Intl.DateTimeFormat = function(locales, options) {
          const opts = options || {};
          if (!opts.timeZone) {
            opts.timeZone = '${fingerprint.timezone}';
          }
          return new originalDateTimeFormat(locales, opts);
        };
        Intl.DateTimeFormat.prototype = originalDateTimeFormat.prototype;
        Intl.DateTimeFormat.supportedLocalesOf = originalDateTimeFormat.supportedLocalesOf;

        console.debug('[Stealth] Anti-detection initialized for profile');
      })();
    `;
  }

  // ==========================================================================
  // PRIVATE: SESSION WARMUP (SIMULATES HUMAN BROWSING)
  // ==========================================================================

  private async warmupSession(page: Page): Promise<void> {
    try {
      // Navigate to neutral site to establish "human" browsing patterns
      await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });

      // Simulate mouse movements
      const viewport = page.viewportSize();
      if (viewport) {
        for (let i = 0; i < 3; i++) {
          const x = randomInt(100, viewport.width - 100);
          const y = randomInt(100, viewport.height - 100);
          await HumanBehaviorSimulator.humanMouseMove(page, x, y);
        }
      }

      // Random scrolling
      await HumanBehaviorSimulator.humanScroll(page, 'down', randomInt(200, 500));
      await page.waitForTimeout(randomInt(1000, 3000));
      await HumanBehaviorSimulator.humanScroll(page, 'up', randomInt(100, 300));

      console.debug(`[Warmup] Session warmed up for profile`);
    } catch (error) {
      console.warn('[Warmup] Session warmup failed, continuing anyway:', (error as Error).message);
    }
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default ProfileManager;
