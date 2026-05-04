import { ProfileManager } from './profile-manager.js';
import { SQLiteProfileStorage } from './sqlite-profile-storage.js';

import type { BrowserContext, Page } from '@playwright/test';
import type { XProfileData } from './sqlite-profile-storage.js';

type LaunchWithRestoreOptions = {
  headless?: boolean;
  targetUrl?: string;
};

type ExtractedXProfile = {
  displayName: string;
  username: string;
  isVerified: boolean;
  avatarUrl?: string;
};

export class ProfileManagerWithSQLite extends ProfileManager {
  private readonly storage: SQLiteProfileStorage;
  private readonly sessionIds = new Map<string, number>();

  constructor(basePath = './browser_profiles', dbPath = './x_profiles.db') {
    super(basePath);
    this.storage = new SQLiteProfileStorage(dbPath);
  }

  async launchProfileWithRestore(
    profileId: string,
    options: LaunchWithRestoreOptions = {},
  ): Promise<{ context: BrowserContext; page: Page }> {
    const savedProfile = this.storage.getProfileById(profileId);
    const launched = await super.launchProfile(profileId, options);

    if (savedProfile && savedProfile.cookies.length > 0) {
      console.log(`Restoring SQLite session for @${savedProfile.username}`);
      await launched.context.addCookies(savedProfile.cookies);

      if (options.targetUrl) {
        await launched.page.goto(options.targetUrl, { waitUntil: 'domcontentloaded' });
      } else {
        await launched.page.reload({ waitUntil: 'domcontentloaded' });
      }
    }

    return { context: launched.context, page: launched.page };
  }

  async extractXProfileFromPage(page: Page, profileId: string): Promise<XProfileData | undefined> {
    try {
      const config = await this.getProfile(profileId);
      if (!config) return undefined;

      const cookies = await page.context().cookies();
      const storageState = await page.context().storageState();
      const userInfo = await this.extractXProfileDom(page);
      const urlUsername = page.url().match(/x\.com\/([^/?#]+)/)?.[1];
      const username = userInfo.username || urlUsername || `user_${profileId}`;

      const profileData: XProfileData = {
        id: profileId,
        username,
        displayName: userInfo.displayName || username,
        cookies,
        storageState,
        userDataDir: config.userDataDir,
        isVerified: userInfo.isVerified,
        followersCount: 0,
        followingCount: 0,
        tweetCount: 0,
        ...(userInfo.avatarUrl === undefined ? {} : { avatarUrl: userInfo.avatarUrl }),
        metadata: {
          lastExtractedAt: new Date().toISOString(),
          url: page.url(),
        },
      };

      this.storage.saveProfile(profileData);
      this.startSession(profileId, await page.evaluate(() => navigator.userAgent));

      return profileData;
    } catch (error) {
      console.error('Failed to extract X profile:', error);
      return undefined;
    }
  }

  getStoredProfiles(): XProfileData[] {
    return this.storage.getAllProfiles();
  }

  getStoredProfile(profileId: string): XProfileData | undefined {
    return this.storage.getProfileById(profileId);
  }

  getStorage(): SQLiteProfileStorage {
    return this.storage;
  }

  override async closeProfile(profileId: string): Promise<void> {
    this.finishSession(profileId);
    await super.closeProfile(profileId);
  }

  override async closeAll(): Promise<void> {
    for (const profileId of this.sessionIds.keys()) {
      this.finishSession(profileId);
    }

    await super.closeAll();
    this.storage.close();
  }

  private startSession(profileId: string, userAgent: string): void {
    if (this.sessionIds.has(profileId)) return;

    const sessionId = this.storage.saveSession({
      profileId,
      loginTime: new Date(),
      userAgent,
      status: 'active',
    });

    this.sessionIds.set(profileId, sessionId);
  }

  private finishSession(profileId: string): void {
    const sessionId = this.sessionIds.get(profileId);
    if (sessionId === undefined) return;

    this.storage.updateSessionLogout(sessionId, profileId);
    this.sessionIds.delete(profileId);
  }

  private async extractXProfileDom(page: Page): Promise<ExtractedXProfile> {
    return page.evaluate(() => {
      const userNameNode = document.querySelector('[data-testid="UserName"]');
      const displayName =
        userNameNode?.querySelector('span')?.textContent?.trim() ??
        document
          .querySelector('[data-testid="SideNav_AccountSwitcher_Button"] div[dir="ltr"] span')
          ?.textContent?.trim() ??
        '';
      const usernameText =
        Array.from(document.querySelectorAll('span'))
          .map((element) => element.textContent?.trim() ?? '')
          .find((text) => /^@[\w]+$/.test(text)) ?? '';
      const avatarUrl =
        document.querySelector<HTMLImageElement>('[data-testid="Tweet-User-Avatar"] img')?.src ??
        document.querySelector<HTMLImageElement>(
          '[data-testid="SideNav_AccountSwitcher_Button"] img',
        )?.src;

      return {
        displayName,
        username: usernameText.replace('@', ''),
        isVerified: Boolean(document.querySelector('[data-testid="icon-verified"]')),
        ...(avatarUrl === undefined ? {} : { avatarUrl }),
      };
    });
  }
}
