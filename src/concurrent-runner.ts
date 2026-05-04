import { ProfileManager } from './profile-manager.js';

import type { Page } from '@playwright/test';

export type TaskResult = {
  profileId: string;
  success: boolean;
  duration: number;
  error?: string;
};

type ProfileTask = (page: Page, profileId: string) => Promise<void>;

export class ConcurrentRunner {
  private readonly manager: ProfileManager;
  private readonly maxConcurrent: number;
  private results: TaskResult[] = [];

  constructor(maxConcurrent = 5, manager = new ProfileManager()) {
    if (maxConcurrent < 1) {
      throw new Error('maxConcurrent must be at least 1');
    }

    this.manager = manager;
    this.maxConcurrent = maxConcurrent;
  }

  async runProfiles(profileIds: string[], task: ProfileTask): Promise<TaskResult[]> {
    this.results = [];

    for (let index = 0; index < profileIds.length; index += this.maxConcurrent) {
      const batch = profileIds.slice(index, index + this.maxConcurrent);
      await Promise.all(batch.map((profileId) => this.runSingleProfile(profileId, task)));
    }

    return this.getResults();
  }

  async runWithLimit<T>(profileId: string, task: (page: Page) => Promise<T>): Promise<T> {
    const { page } = await this.manager.launchProfile(profileId);
    try {
      return await task(page);
    } finally {
      await this.manager.closeProfile(profileId);
    }
  }

  getResults(): TaskResult[] {
    return [...this.results];
  }

  getSuccessRate(): number {
    if (this.results.length === 0) return 0;

    const successes = this.results.filter((result) => result.success).length;
    return (successes / this.results.length) * 100;
  }

  async closeAll(): Promise<void> {
    await this.manager.closeAll();
  }

  private async runSingleProfile(profileId: string, task: ProfileTask): Promise<void> {
    const startTime = Date.now();

    try {
      const { page } = await this.manager.launchProfile(profileId);
      await task(page, profileId);

      this.results.push({
        profileId,
        success: true,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      this.results.push({
        profileId,
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await this.manager.closeProfile(profileId);
    }
  }
}
