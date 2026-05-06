// FILE: src/x-actions.ts
// COMPLETE X (TWITTER) ACTIONS WITH ANTI-DETECTION, TEXT & IMAGE EXTRACTION, RANDOM CLICK

import { Page } from 'playwright';
import { HumanBehavior } from './human-behavior.js';
import { readFile } from 'node:fs/promises';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type TweetInfo = {
  id?: string;
  text: string;
  tweetText?: string;
  authorName: string;
  authorUsername: string;
  tweetUrl: string;
  timestamp: string;
  likes?: string;
  retweets?: string;
  replies?: string;
  views?: string;
  isVerified?: boolean;
  mediaUrls?: string[];
  videoPoster?: string;
};

export type UserProfileInfo = {
  displayName: string;
  username: string;
  bio?: string;
  location?: string;
  website?: string;
  joinDate?: string;
  followersCount: string;
  followingCount: string;
  tweetsCount: string;
  isVerified: boolean;
  avatarUrl?: string;
  bannerUrl?: string;
};

export type NotificationInfo = {
  type: 'like' | 'retweet' | 'reply' | 'follow' | 'mention';
  fromUsername: string;
  fromDisplayName: string;
  tweetText?: string;
  timestamp: string;
  isRead: boolean;
};

export type TweetActionResult = {
  success: boolean;
  tweetInfo?: TweetInfo;
};

export type ClickFirstTweetOptions = {
  scrollToLoad?: boolean;
  waitForTweets?: number;
  humanLike?: boolean;
  screenshot?: string;
  clickOnTextRandom?: boolean;
  randomOffsetPx?: number;
  extractMedia?: boolean;
};

export type FeedTab = 'for-you' | 'following';
export type FollowMode = 'yes' | 'no';
export type ToggleFollowAction = 'follow' | 'unfollow';
export type ToggleFollowResult = {
  success: boolean;
  action: ToggleFollowAction | 'none';
  username?: string;
  error?: string;
};
// =============================================================================
// TYPES & INTERFACES FOR COMMENT USERS
// =============================================================================

export type CommentUserInfo = {
  id: string;                    // User ID (rest_id)
  username: string;              // Username without @
  displayName: string;           // Display name
  isVerified: boolean;           // Has blue verification
  isGoldVerified: boolean;       // Has gold verification (organizations)
  isGreyVerified: boolean;       // Has grey verification (government)
  followersCount: number;        // Follower count
  followingCount: number;        // Following count
  tweetCount: number;            // Total tweets
  bio?: string;                  // User bio
  location?: string;             // Location
  avatarUrl?: string;            // Avatar URL
  commentText: string;           // The comment text
  commentTimestamp: string;      // Comment timestamp
  commentUrl: string;            // Link to comment
  isFollowing: boolean;          // Does current profile follow this user?
  status: 'pending' | 'followed' | 'skipped' | 'blocked';  // Action status
  upTime: Date;                  // When this record was created
};

export type ReadTweetFollowOptions = {
  maxComments?: number;          // Maximum comments to process (default: 50)
  onlyVerified?: boolean;        // Only collect verified users (default: true)
  scrollToLoadComments?: boolean; // Auto-scroll to load more comments (default: true)
  maxScrolls?: number;           // Maximum scrolls for loading comments (default: 5)
  timeoutMs?: number;            // Timeout for operations (default: 30000)
  follow?: FollowMode;           // yes/no follow action mode (default: no)
  followVerified?: boolean;      // Deprecated: compatibility with old callers
  extractDetailedInfo?: boolean; // Open profile pages and enrich follower/profile details
  maxUsersToProcess?: number;    // Limit users processed for detailed extraction
  excludeUsernames?: string[];   // Skip users already followed/synced in DB
  followProbabilityMin?: number; // Minimum follow probability per candidate (0..1)
  followProbabilityMax?: number; // Maximum follow probability per candidate (0..1)
  maxFollowsThisRun?: number;    // Hard cap of follows allowed in this run
};

export type ReadTweetFollowResult = {
  success: boolean;
  totalComments: number;
  verifiedUsers: CommentUserInfo[];
  followedUsers: string[];       // Usernames that were followed
  skippedUsers: string[];        // Usernames that were skipped
  error?: string;
};

export type ReplyToTweetOptions = {
  replyText: string;
  likeAfterReply?: boolean;
  stayOnPage?: boolean;
  maxReplyLength?: number;
  timeoutMs?: number;
};

export type AutoReplyMode = 'template' | 'ai' | 'hybrid';
export type AutoReplyOptions = {
  mode?: AutoReplyMode;
  templatePath?: string;
  deepseekApiKey?: string;
  deepseekModel?: string;
  likeBeforeReply?: boolean;
  stayOnPage?: boolean;
  maxReplyLength?: number;
  minTweetLength?: number;
  timeoutMs?: number;
  sourceTweetText?: string;
  excludeReplyTexts?: string[];
  onReplySubmitted?: (replyText: string) => void;
};

type FollowState = 'following' | 'not-following' | 'blocked' | 'unknown';
type FollowButtonInfo = {
  button: ReturnType<Page['locator']>;
  currentState: Exclude<FollowState, 'unknown'>;
  buttonText: string;
};

type FollowCandidate = {
  currentState: Exclude<FollowState, 'unknown'>;
  buttonText: string;
  testId: string;
  ariaLabel: string;
  score: number;
  top: number;
};
// =============================================================================
// CONSTANTS
// =============================================================================

const HOME_URL = 'https://x.com/home';
const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const TWEET_TEXTAREA_SELECTOR = '[data-testid="tweetTextarea_0"]';
const POST_TWEET_BUTTON_SELECTOR = '[data-testid="tweetButton"]';
const RESERVED_X_PATH_SEGMENTS = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'search',
  'settings',
  'compose',
  'i',
]);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function isHomeFeedUrl(url: string): boolean {
  return url.includes('x.com/home') || url.includes('twitter.com/home');
}

function normalizeUsername(username: string): string {
  return username.replace(/^@/, '');
}

// =============================================================================
// X ACTIONS CLASS
// =============================================================================

export class XActions {
  // ===========================================================================
  // READ TWEETS - LẤY THÔNG TIN TWEET
  // ===========================================================================

  static async waitForFeed(page: Page, timeout = 15000): Promise<void> {
    await page.waitForSelector(TWEET_SELECTOR, { timeout });
    await HumanBehavior.delay(500, 1000);
  }

  /**
   * Clicks "For you" or "Following" tab with robust fallback strategies.
   */
  static async clickNewFeedOrFollowingRobust(
    page: Page,
    tab: FeedTab,
    options?: {
      maxRetries?: number;
      usePositionFallback?: boolean;
    },
  ): Promise<boolean> {
    const maxRetries = options?.maxRetries ?? 3;
    const usePositionFallback = options?.usePositionFallback ?? true;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      console.log(`[feed-nav] Attempt ${attempt}/${maxRetries} to click "${tab}"`);

      const clicked = await this.clickNewFeedOrFollowing(page, tab);
      if (clicked) return true;

      if (attempt < maxRetries) {
        await page.waitForTimeout(1000 * attempt);
      }
    }

    if (usePositionFallback) {
      console.log('[feed-nav] Trying position-based fallback...');
      const clickedByPosition = await this.clickNewFeedOrFollowingByPosition(page, tab);
      if (clickedByPosition) return true;
    }

    console.error(`[feed-nav] Failed to switch to "${tab}"`);
    return false;
  }

  private static async clickNewFeedOrFollowing(page: Page, tab: FeedTab): Promise<boolean> {
    try {
      await page.waitForSelector('nav[role="navigation"][aria-live="polite"]', {
        state: 'visible',
        timeout: 10000,
      });

      const tabText = tab === 'for-you' ? 'For you' : 'Following';
      const result = await page.evaluate((targetText: string) => {
        const tabs = document.querySelectorAll('div[role="tab"]');

        for (const currentTab of Array.from(tabs)) {
          const span = currentTab.querySelector('span.css-1jxf684');
          if (span && span.textContent?.trim() === targetText) {
            const isSelected = currentTab.getAttribute('aria-selected') === 'true';
            if (isSelected) return 'already-selected';

            (currentTab as HTMLElement).click();
            return 'clicked';
          }
        }

        return 'not-found';
      }, tabText);

      if (result === 'already-selected') {
        console.log(`[feed-nav] Tab "${tabText}" already selected`);
        return true;
      }

      if (result === 'not-found') {
        console.warn(`[feed-nav] Tab "${tabText}" not found by text, trying fallback`);
        return this.fallbackClickByTestId(page, tab);
      }

      await page.waitForTimeout(500);

      const isNowSelected = await page.evaluate((targetText: string) => {
        const tabs = document.querySelectorAll('div[role="tab"]');
        for (const currentTab of Array.from(tabs)) {
          const span = currentTab.querySelector('span.css-1jxf684');
          if (span && span.textContent?.trim() === targetText) {
            return currentTab.getAttribute('aria-selected') === 'true';
          }
        }
        return false;
      }, tabText);

      if (isNowSelected) {
        console.log(`[feed-nav] Switched to "${tabText}"`);
        return true;
      }

      console.warn(`[feed-nav] Clicked "${tabText}" but could not confirm selection`);
      return false;
    } catch (error) {
      console.error('[feed-nav] Error when switching tab:', error);
      return false;
    }
  }

  private static async fallbackClickByTestId(page: Page, tab: FeedTab): Promise<boolean> {
    try {
      const tabList = await page.$('[data-testid="ScrollSnap-List"]');
      if (!tabList) {
        console.warn('[feed-nav] ScrollSnap-List not found');
        return false;
      }

      const tabs = await tabList.$$('div[role="presentation"] > div[role="tab"]');
      if (tabs.length < 2) {
        console.warn('[feed-nav] Not enough tabs found');
        return false;
      }

      const tabIndex = tab === 'for-you' ? 0 : 1;
      const targetTab = tabs[tabIndex];
      if (!targetTab) {
        console.warn(`[feed-nav] Tab index ${tabIndex} out of bounds`);
        return false;
      }

      const isSelected = await targetTab.getAttribute('aria-selected');
      if (isSelected === 'true') {
        console.log(`[feed-nav] Tab "${tab}" already selected (fallback)`);
        return true;
      }

      await targetTab.click();
      await page.waitForTimeout(500);
      console.log(`[feed-nav] Fallback click on "${tab}" succeeded`);
      return true;
    } catch (error) {
      console.error('[feed-nav] Fallback click failed:', error);
      return false;
    }
  }

  private static async clickNewFeedOrFollowingByPosition(
    page: Page,
    tab: FeedTab,
  ): Promise<boolean> {
    try {
      const navBar = await page.waitForSelector('nav[role="navigation"]', {
        state: 'visible',
        timeout: 10000,
      });

      if (!navBar) return false;

      const box = await navBar.boundingBox();
      if (!box) return false;

      const x = tab === 'for-you' ? box.x + box.width * 0.25 : box.x + box.width * 0.75;
      const y = box.y + box.height / 2;

      await HumanBehavior.mouseMove(page, x, y);
      await page.waitForTimeout(100);
      await page.mouse.click(x, y);
      await page.waitForTimeout(500);

      console.log(`[feed-nav] Position fallback click on "${tab}" at (${x.toFixed(0)}, ${y.toFixed(0)})`);
      return true;
    } catch (error) {
      console.error('[feed-nav] Position fallback failed:', error);
      return false;
    }
  }

  static async getFirstTweet(page: Page): Promise<TweetInfo | null> {
    await this.waitForFeed(page);
    return this.readTweetByIndex(page, 0);
  }

  static async getAllTweets(page: Page, maxTweets = 20): Promise<TweetInfo[]> {
    await this.waitForFeed(page);

    return page.evaluate((max) => {
      return Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
        .slice(0, max)
        .map((article) => {
          const textEl = article.querySelector('[data-testid="tweetText"]');
          const authorNameEl = article.querySelector('[data-testid="User-Name"] a span span');
          const authorUsernameEl = article.querySelector(
            '[data-testid="User-Name"] a[href*="/"]:last-child span',
          );
          const tweetLink = article.querySelector('a[href*="/status/"]')?.getAttribute('href');
          const timeEl = article.querySelector('time');
          const statsGroup = article.querySelector('div[role="group"][aria-label]');
          const ariaLabel = statsGroup?.getAttribute('aria-label') ?? '';
          const text = textEl?.textContent ?? '';

          const parseStatLocal = (label: string, name: string): string => {
            const match = label.match(new RegExp(`(\\d+(?:,\\d+)*(?:\\.\\d+)?[KkM]?)\\s*${name}`));
            return match?.[1] ?? '0';
          };

          return {
            text,
            tweetText: text,
            authorName: authorNameEl?.textContent ?? '',
            authorUsername: authorUsernameEl?.textContent?.replace('@', '') ?? '',
            tweetUrl: tweetLink ? `https://x.com${tweetLink}` : '',
            timestamp: timeEl?.getAttribute('datetime') ?? '',
            likes: parseStatLocal(ariaLabel, 'likes?'),
            retweets: parseStatLocal(ariaLabel, 'reposts?'),
            replies: parseStatLocal(ariaLabel, 'replies?'),
            views: parseStatLocal(ariaLabel, 'views?'),
            isVerified: Boolean(article.querySelector('[data-testid="icon-verified"]')),
            mediaUrls: Array.from(article.querySelectorAll<HTMLImageElement>('img[src]')).map(
              (image) => image.src,
            ),
          };
        });
    }, maxTweets);
  }

  static async getCurrentTweetDetail(page: Page): Promise<TweetInfo | null> {
    await page.waitForSelector(TWEET_SELECTOR, { timeout: 10000 });
    const tweet = await this.readTweetByIndex(page, 0);
    return tweet ? { ...tweet, tweetUrl: page.url() } : null;
  }

  // ===========================================================================
  // TEXT & IMAGE EXTRACTION - LẤY TEXT VÀ ẢNH TỪ TWEET
  // ===========================================================================

  static async getFirstTweetText(page: Page): Promise<string | null> {
    try {
      await this.waitForFeed(page);
      const tweetText = await page.locator('[data-testid="tweetText"]').first().textContent();
      return tweetText;
    } catch (error) {
      console.error('Error getting tweet text:', error);
      return null;
    }
  }

  static async getFirstTweetImage(page: Page): Promise<string | null> {
    try {
      await this.waitForFeed(page);
      const imageUrl = await page.locator('[data-testid="tweetPhoto"] img').first().getAttribute('src');
      return imageUrl;
    } catch (error) {
      console.error('Error getting tweet image:', error);
      return null;
    }
  }

  static async getAllTweetImages(page: Page): Promise<string[]> {
    try {
      await this.waitForFeed(page);
      const srcs = await page.$$eval('[data-testid="tweetPhoto"] img', imgs => 
        imgs.map(img => img.getAttribute('src')).filter(Boolean) as string[]
      );
      return srcs;
    } catch (error) {
      console.error('Error getting tweet images:', error);
      return [];
    }
  }

  static async extractFullTweetInfo(page: Page, tweetIndex: number = 0): Promise<TweetInfo | null> {
    try {
      await this.waitForFeed(page);
      
      const tweetInfo = await page.evaluate((idx) => {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        const article = articles[idx];
        if (!article) return null;
        
        const textElement = article.querySelector('[data-testid="tweetText"]');
        const tweetText = textElement?.textContent || '';
        
        const authorNameEl = article.querySelector('[data-testid="User-Name"] a span span');
        const authorName = authorNameEl?.textContent || '';
        
        const authorUsernameEl = article.querySelector('[data-testid="User-Name"] a[href*="/"]:last-child span');
        const authorUsername = authorUsernameEl?.textContent?.replace('@', '') || '';
        
        const tweetLink = article.querySelector('a[href*="/status/"]')?.getAttribute('href');
        const tweetUrl = tweetLink ? `https://x.com${tweetLink}` : '';
        
        const tweetIdMatch = tweetUrl.match(/\/status\/(\d+)/);
        const tweetId = tweetIdMatch?.[1];
        
        const timeElement = article.querySelector('time');
        const timestamp = timeElement?.getAttribute('datetime') || '';
        
        const statsGroup = article.querySelector('div[role="group"][aria-label]');
        const ariaLabel = statsGroup?.getAttribute('aria-label') || '';
        
        const images = Array.from(article.querySelectorAll('[data-testid="tweetPhoto"] img'))
          .map(img => img.getAttribute('src'))
          .filter(Boolean) as string[];
        
        const videoElement = article.querySelector('video');
        const videoPoster = videoElement?.getAttribute('poster');
        
        return {
          ...(tweetId ? { id: tweetId } : {}),
          text: tweetText,
          tweetText: tweetText,
          authorName,
          authorUsername,
          tweetUrl,
          timestamp,
          likes: ariaLabel.match(/(\d+(?:,\d+)*(?:\.\d+)?[KkM]?)\s*likes?/i)?.[1] ?? '0',
          retweets: ariaLabel.match(/(\d+(?:,\d+)*(?:\.\d+)?[KkM]?)\s*reposts?/i)?.[1] ?? '0',
          replies: ariaLabel.match(/(\d+(?:,\d+)*(?:\.\d+)?[KkM]?)\s*replies?/i)?.[1] ?? '0',
          views: ariaLabel.match(/(\d+(?:,\d+)*(?:\.\d+)?[KkM]?)\s*views?/i)?.[1] ?? '0',
          isVerified: Boolean(article.querySelector('[data-testid="icon-verified"]')),
          mediaUrls: images,
          ...(videoPoster ? { videoPoster } : {}),
        };
      }, tweetIndex);
      
      return tweetInfo;
    } catch (error) {
      console.error('Error extracting full tweet info:', error);
      return null;
    }
  }

  static async getFirstTweetInfoOnly(page: Page, waitForTweets = 15000): Promise<TweetInfo | null> {
    try {
      await this.waitForFeed(page, waitForTweets);
      return await this.extractFullTweetInfo(page, 0);
    } catch (error) {
      console.error('Error getting tweet info:', error);
      return null;
    }
  }

  static async getTweetInfoByIndex(page: Page, index = 0): Promise<TweetInfo | null> {
    try {
      await this.waitForFeed(page);
      return await this.extractFullTweetInfo(page, index);
    } catch (error) {
      console.error('Error getting tweet info by index:', error);
      return null;
    }
  }

  static async tweetHasImage(page: Page, tweetIndex = 0): Promise<boolean> {
    try {
      await this.waitForFeed(page);
      const hasImage = await page.locator(TWEET_SELECTOR).nth(tweetIndex).locator('[data-testid="tweetPhoto"]').count() > 0;
      return hasImage;
    } catch (error) {
      console.error('Error checking tweet image:', error);
      return false;
    }
  }

  static async tweetHasVideo(page: Page, tweetIndex = 0): Promise<boolean> {
    try {
      await this.waitForFeed(page);
      const hasVideo = await page.locator(TWEET_SELECTOR).nth(tweetIndex).locator('video').count() > 0;
      return hasVideo;
    } catch (error) {
      console.error('Error checking tweet video:', error);
      return false;
    }
  }

  static async getTweetMediaType(page: Page, tweetIndex = 0): Promise<'none' | 'image' | 'video' | 'mixed'> {
    const hasImage = await this.tweetHasImage(page, tweetIndex);
    const hasVideo = await this.tweetHasVideo(page, tweetIndex);
    
    if (hasImage && hasVideo) return 'mixed';
    if (hasImage) return 'image';
    if (hasVideo) return 'video';
    return 'none';
  }

  // ===========================================================================
  // BOUNDING BOX & RANDOM CLICK - LẤY TỌA ĐỘ VÀ CLICK NGẪU NHIÊN
  // ===========================================================================

  static async getTweetTextBoundingBox(page: Page): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      await this.waitForFeed(page);
      const tweetTextElement = page.locator('[data-testid="tweetText"]').first();
      const boundingBox = await tweetTextElement.boundingBox();
      return boundingBox;
    } catch (error) {
      console.error('Error getting tweet text bounding box:', error);
      return null;
    }
  }

  static async getTweetImageBoundingBox(page: Page, imageIndex = 0): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      await this.waitForFeed(page);
      const imageElement = page.locator('[data-testid="tweetPhoto"] img').nth(imageIndex);
      const boundingBox = await imageElement.boundingBox();
      return boundingBox;
    } catch (error) {
      console.error('Error getting tweet image bounding box:', error);
      return null;
    }
  }

  static async getTweetBoundingBox(page: Page, tweetIndex = 0): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      await this.waitForFeed(page);
      const tweetElement = page.locator(TWEET_SELECTOR).nth(tweetIndex);
      const boundingBox = await tweetElement.boundingBox();
      return boundingBox;
    } catch (error) {
      console.error('Error getting tweet bounding box:', error);
      return null;
    }
  }

  static async clickRandomOnTweetText(page: Page, randomOffsetPx = 30): Promise<boolean> {
    try {
      const textBox = await this.getTweetTextBoundingBox(page);
      if (!textBox) {
        console.warn('Cannot find tweet text element for random click');
        return false;
      }

      const randomX = textBox.x + (Math.random() * textBox.width);
      const randomY = textBox.y + (Math.random() * textBox.height);
      const offsetX = (Math.random() - 0.5) * randomOffsetPx;
      const offsetY = (Math.random() - 0.5) * randomOffsetPx;
      const clickX = Math.max(textBox.x, Math.min(textBox.x + textBox.width, randomX + offsetX));
      const clickY = Math.max(textBox.y, Math.min(textBox.y + textBox.height, randomY + offsetY));

      console.log(`🎯 Random click on tweet text at (${clickX.toFixed(0)}, ${clickY.toFixed(0)})`);
      
      await HumanBehavior.mouseMove(page, clickX, clickY);
      await HumanBehavior.delay(100, 300);
      await page.mouse.click(clickX, clickY);
      await HumanBehavior.delay(500, 1000);
      
      return true;
    } catch (error) {
      console.error('Error clicking random on tweet text:', error);
      return false;
    }
  }

  static async clickRandomOnTweetImage(page: Page, imageIndex = 0, randomOffsetPx = 30): Promise<boolean> {
    try {
      const imageBox = await this.getTweetImageBoundingBox(page, imageIndex);
      if (!imageBox) {
        console.warn('Cannot find tweet image element for random click');
        return false;
      }

      const randomX = imageBox.x + (Math.random() * imageBox.width);
      const randomY = imageBox.y + (Math.random() * imageBox.height);
      const offsetX = (Math.random() - 0.5) * randomOffsetPx;
      const offsetY = (Math.random() - 0.5) * randomOffsetPx;
      const clickX = Math.max(imageBox.x, Math.min(imageBox.x + imageBox.width, randomX + offsetX));
      const clickY = Math.max(imageBox.y, Math.min(imageBox.y + imageBox.height, randomY + offsetY));

      console.log(`🖼️ Random click on tweet image at (${clickX.toFixed(0)}, ${clickY.toFixed(0)})`);
      
      await HumanBehavior.mouseMove(page, clickX, clickY);
      await HumanBehavior.delay(100, 300);
      await page.mouse.click(clickX, clickY);
      await HumanBehavior.delay(500, 1000);
      
      return true;
    } catch (error) {
      console.error('Error clicking random on tweet image:', error);
      return false;
    }
  }

  static async clickRandomOnTweet(page: Page, tweetIndex = 0, randomOffsetPx = 30): Promise<boolean> {
    try {
      const tweetBox = await this.getTweetBoundingBox(page, tweetIndex);
      if (!tweetBox) {
        console.warn('Cannot find tweet element for random click');
        return false;
      }

      const randomX = tweetBox.x + (Math.random() * tweetBox.width);
      const randomY = tweetBox.y + (Math.random() * tweetBox.height);
      const offsetX = (Math.random() - 0.5) * randomOffsetPx;
      const offsetY = (Math.random() - 0.5) * randomOffsetPx;
      const clickX = Math.max(tweetBox.x, Math.min(tweetBox.x + tweetBox.width, randomX + offsetX));
      const clickY = Math.max(tweetBox.y, Math.min(tweetBox.y + tweetBox.height, randomY + offsetY));

      console.log(`🎲 Random click on tweet at (${clickX.toFixed(0)}, ${clickY.toFixed(0)})`);
      
      await HumanBehavior.mouseMove(page, clickX, clickY);
      await HumanBehavior.delay(100, 300);
      await page.mouse.click(clickX, clickY);
      await HumanBehavior.delay(500, 1000);
      
      return true;
    } catch (error) {
      console.error('Error clicking random on tweet:', error);
      return false;
    }
  }

  static async clickOnTweetArea(
    page: Page,
    area: 'text' | 'image' | 'random' | 'tweet',
    options?: { imageIndex?: number; randomOffsetPx?: number; tweetIndex?: number }
  ): Promise<boolean> {
    const randomOffset = options?.randomOffsetPx ?? 30;
    const imageIndex = options?.imageIndex ?? 0;
    const tweetIndex = options?.tweetIndex ?? 0;
    
    switch (area) {
      case 'text':
        return this.clickRandomOnTweetText(page, randomOffset);
      case 'image':
        return this.clickRandomOnTweetImage(page, imageIndex, randomOffset);
      case 'tweet':
        return this.clickRandomOnTweet(page, tweetIndex, randomOffset);
      case 'random':
        const choices: ('text' | 'image' | 'tweet')[] = ['text', 'image', 'tweet'];
        const randomChoice = choices[Math.floor(Math.random() * choices.length)];
        console.log(`🎲 Randomly choosing area: ${randomChoice}`);
        return this.clickOnTweetArea(page, randomChoice, options);
      default:
        console.warn(`Unknown area: ${area}`);
        return false;
    }
  }

  // ===========================================================================
  // CLICK TWEETS - CLICK VÀO TWEET
  // ===========================================================================

  static async clickFirstTweet(page: Page, humanLike = true): Promise<boolean> {
    return this.clickTweetByIndexBoolean(page, 0, humanLike);
  }

// FILE: src/x-actions.ts - CẬP NHẬT HÀM clickTweetByIndexBoolean

  static async clickTweetByIndexBoolean(
    page: Page, 
    index = 0, 
    humanLike = true,
    randomOffsetPx = 20
  ): Promise<boolean> {
    await this.waitForFeed(page);

    // Lấy tweet article
    const tweet = page.locator(TWEET_SELECTOR).nth(index);
    if ((await tweet.count()) === 0) {
      console.log(`Tweet index ${index} not found`);
      return false;
    }

    // Tìm link tweet bên trong article
    const tweetLink = tweet.locator('a[href*="/status/"]').first();
    const hasLink = await tweetLink.count() > 0;
    
    if (!hasLink) {
      console.log(`Tweet index ${index} has no valid link (possibly promoted content)`);
      return false;
    }

    // Lấy href để debug
    const href = await tweetLink.getAttribute('href');
    console.log(`🔗 Tweet link found: https://x.com${href}`);

    if (humanLike) {
      await tweetLink.scrollIntoViewIfNeeded();
      const viewport = page.viewportSize();
      const box = (await tweetLink.boundingBox()) ?? (await tweet.boundingBox());
      if (box && viewport) {
        const safePadding = 12;
        const innerPadding = 4;
        const minX = Math.max(safePadding, box.x + innerPadding);
        const maxX = Math.min(viewport.width - safePadding, box.x + box.width - innerPadding);
        const minY = Math.max(safePadding, box.y + innerPadding);
        const maxY = Math.min(viewport.height - safePadding, box.y + box.height - innerPadding);
        const hasVisibleArea = maxX > minX && maxY > minY;

        if (hasVisibleArea) {
          const randomX = minX + Math.random() * (maxX - minX);
          const randomY = minY + Math.random() * (maxY - minY);
          const offsetX = (Math.random() - 0.5) * randomOffsetPx;
          const offsetY = (Math.random() - 0.5) * randomOffsetPx;
          const clickX = Math.max(minX, Math.min(maxX, randomX + offsetX));
          const clickY = Math.max(minY, Math.min(maxY, randomY + offsetY));
          console.log(`Clicking tweet link at: (${clickX.toFixed(0)}, ${clickY.toFixed(0)})`);
          await HumanBehavior.mouseMove(page, clickX - 10, clickY - 8);
          await HumanBehavior.delay(120, 260);
          await HumanBehavior.mouseMove(page, clickX + 4, clickY + 3);
          await HumanBehavior.delay(120, 240);
          await HumanBehavior.mouseMove(page, clickX, clickY);
          await HumanBehavior.delay(200, 450);

          const shouldMissClick = Math.random() < 0.12;
          if (shouldMissClick) {
            const missX = Math.max(
              safePadding,
              Math.min(viewport.width - safePadding, clickX + (Math.random() - 0.5) * 80),
            );
            const missY = Math.max(
              safePadding,
              Math.min(viewport.height - safePadding, clickY + (Math.random() - 0.5) * 50),
            );
            console.log(`Miss click before real click at: (${missX.toFixed(0)}, ${missY.toFixed(0)})`);
            await page.mouse.click(missX, missY);
            await HumanBehavior.delay(250, 600);
          }

          await page.mouse.click(clickX, clickY);
        } else {
          await tweetLink.click();
        }
      } else {
        await tweetLink.click();
      }
    } else {
      await tweetLink.click();
    }
    
    // Wait for navigation with multiple possible URL patterns
    try {
      await page.waitForURL(/\/status\/\d+/, { timeout: 10000 });
      console.log(`✅ Navigated to tweet detail page`);
    } catch (error) {
      // Retry 1: direct link click then wait again
      try {
        await tweetLink.click({ timeout: 5000 });
        await page.waitForURL(/\/status\/\d+/, { timeout: 7000 });
        console.log(`✅ Navigated to tweet detail page (retry via direct link click)`);
      } catch {
        // continue with modal/final fallback checks
      }

      if (/\/status\/\d+/.test(page.url())) {
        console.log(`✅ Navigated to tweet detail page`);
        await HumanBehavior.delay(1500, 2500);
        console.log(`✅ Clicked tweet #${index + 1}`);
        return true;
      }

      // Check if modal opened instead of navigation
      const modal = page.locator('[role="presentation"][aria-modal="true"]');
      if (await modal.count() > 0) {
        console.log(`📱 Tweet opened in modal, closing modal and retrying...`);
        // Close modal and try click on link again
        const closeButton = page.locator('[data-testid="app-bar-close"]').first();
        if (await closeButton.count() > 0) {
          await closeButton.click();
          await HumanBehavior.delay(500, 1000);
        }
        // Try clicking the link directly
        await tweetLink.click();
        await page.waitForURL(/\/status\/\d+/, { timeout: 10000 });
      } else {
        // Retry 2: click whole tweet container then wait
        try {
          await tweet.click({ timeout: 5000 });
          await page.waitForURL(/\/status\/\d+/, { timeout: 7000 });
          console.log(`✅ Navigated to tweet detail page (retry via tweet container click)`);
        } catch {
          console.log(`⚠️ Navigation timeout - tweet may have opened in same tab or failed`);
          return false;
        }
      }
    }
    
    await HumanBehavior.delay(1500, 2500);
    console.log(`✅ Clicked tweet #${index + 1}`);
    return true;
  }

  static async clickTweetContaining(page: Page, searchText: string): Promise<boolean> {
    await this.waitForFeed(page);
    const tweet = page.locator(TWEET_SELECTOR).filter({ hasText: searchText }).first();
    if ((await tweet.count()) === 0) {
      return false;
    }

    const box = await tweet.boundingBox();
    if (box) {
      await HumanBehavior.mouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
      await HumanBehavior.delay(200, 400);
    }

    await tweet.click();
    await page.waitForURL('**/status/**', { timeout: 10000 });
    console.log(`Clicked tweet containing: ${searchText}`);
    return true;
  }

  static async clickFirstTweetInFeed(
    page: Page,
    options: ClickFirstTweetOptions = {},
  ): Promise<TweetActionResult> {
    const { scrollToLoad = true, waitForTweets = 15000, humanLike = true, screenshot } = options;

    try {
      if (!isHomeFeedUrl(page.url())) {
        await this.goToHome(page);
      } else {
        await this.waitForFeed(page, waitForTweets);
      }

      if (scrollToLoad) {
        await HumanBehavior.scroll(page, 300);
        await HumanBehavior.delay(800, 1200);
      }

      const tweetInfo = await this.getFirstTweet(page);
      if (screenshot) {
        await page.screenshot({ path: screenshot, fullPage: false });
      }

      const success = await this.clickFirstTweet(page, humanLike);
      return success && tweetInfo ? { success, tweetInfo } : { success };
    } catch (error) {
      console.error('Error clicking first tweet in feed:', error);
      return { success: false };
    }
  }

  static async clickFirstTweetInFeedEnhanced(
    page: Page,
    options: ClickFirstTweetOptions = {},
  ): Promise<TweetActionResult> {
    const {
      scrollToLoad = true,
      waitForTweets = 15000,
      humanLike = true,
      screenshot,
      clickOnTextRandom = false,
      randomOffsetPx = 30,
    } = options;

    try {
      if (!isHomeFeedUrl(page.url())) {
        await this.goToHome(page);
      } else {
        await this.waitForFeed(page, waitForTweets);
      }

      if (scrollToLoad) {
        await HumanBehavior.scroll(page, 300);
        await HumanBehavior.delay(800, 1200);
      }

      const tweetInfo = await this.extractFullTweetInfo(page, 0);
      
      if (!tweetInfo) {
        console.log('❌ No tweet found in feed');
        return { success: false };
      }

      console.log('\n📊 First tweet info:');
      console.log(`   👤 Author: @${tweetInfo.authorUsername}`);
      console.log(`   💬 Text: ${tweetInfo.text.substring(0, 100)}...`);
      console.log(`   🖼️ Media type: ${await this.getTweetMediaType(page)}`);
      if (tweetInfo.mediaUrls?.length) {
        console.log(`   📸 Images: ${tweetInfo.mediaUrls.length} image(s)`);
      }
      console.log(`   📊 Stats: ❤️ ${tweetInfo.likes} | 🔁 ${tweetInfo.retweets} | 💬 ${tweetInfo.replies} | 👁️ ${tweetInfo.views}`);

      if (screenshot) {
        await page.screenshot({ path: screenshot, fullPage: false });
        console.log(`📸 Screenshot saved: ${screenshot}`);
      }

      let clickSuccess = false;
      
      if (clickOnTextRandom && tweetInfo.text) {
        console.log(`🎯 Clicking randomly within tweet text area (offset: ±${randomOffsetPx}px)...`);
        clickSuccess = await this.clickRandomOnTweetText(page, randomOffsetPx);
      } else if (humanLike) {
        const firstTweet = page.locator(TWEET_SELECTOR).first();
        const box = await firstTweet.boundingBox();
        if (box) {
          const x = box.x + box.width / 2 + (Math.random() - 0.5) * 20;
          const y = box.y + box.height / 2 + (Math.random() - 0.5) * 20;
          await HumanBehavior.mouseMove(page, x, y);
          await HumanBehavior.delay(200, 400);
          await firstTweet.click();
          clickSuccess = true;
        } else {
          await firstTweet.click();
          clickSuccess = true;
        }
      } else {
        await page.locator(TWEET_SELECTOR).first().click();
        clickSuccess = true;
      }

      if (clickSuccess) {
        console.log('✅ Clicked on first tweet');
        await page.waitForURL('**/status/**', { timeout: 10000 });
        await HumanBehavior.delay(1000, 2000);
      }

      return { success: clickSuccess, tweetInfo };
      
    } catch (error) {
      console.error('❌ Error clicking first tweet in feed:', error);
      return { success: false };
    }
  }

  static async clickFirstTweetContainingText(
    page: Page,
    searchText: string,
  ): Promise<TweetActionResult> {
    const tweetInfo = await this.readTweetContainingText(page, searchText);
    const success = await this.clickTweetContaining(page, searchText);
    return success && tweetInfo ? { success, tweetInfo } : { success };
  }

  static async clickTweetByIndex(
    page: Page,
    index = 0,
    humanLike = true,
  ): Promise<TweetActionResult> {
    const tweetInfo = await this.readTweetByIndex(page, index);
    const success = await this.clickTweetByIndexBoolean(page, index, humanLike);
    return success && tweetInfo ? { success, tweetInfo } : { success };
  }

  static async readTweetFollow(
    page: Page,
    options: ReadTweetFollowOptions = {},
  ): Promise<ReadTweetFollowResult> {
    const {
      maxComments = 50,
      onlyVerified = true,
      scrollToLoadComments = true,
      maxScrolls = 5,
      follow,
      followVerified = false,
      extractDetailedInfo = false,
      maxUsersToProcess = 20,
      excludeUsernames = [],
      followProbabilityMin = 0.1,
      followProbabilityMax = 0.2,
      maxFollowsThisRun = Number.MAX_SAFE_INTEGER,
    } = options;
    const followMode: FollowMode = follow ?? (followVerified ? 'yes' : 'no');
    const shouldFollow = followMode === 'yes';
    const excludedUsernames = new Set(
      excludeUsernames.map((username) => normalizeUsername(username).toLowerCase()),
    );
    const normalizedFollowMin = Math.max(0, Math.min(1, followProbabilityMin));
    const normalizedFollowMax = Math.max(normalizedFollowMin, Math.min(1, followProbabilityMax));
    const followProbability =
      normalizedFollowMin + Math.random() * (normalizedFollowMax - normalizedFollowMin);
    const followCap = Math.max(0, Math.floor(maxFollowsThisRun));

    try {
      const tweetUrl = page.url();
      if (!/\/status\/\d+/.test(tweetUrl)) {
        return {
          success: false,
          totalComments: 0,
          verifiedUsers: [],
          followedUsers: [],
          skippedUsers: [],
          error: 'Current page is not a tweet detail URL',
        };
      }

      if (scrollToLoadComments) {
        let previousCount = 0;
        for (let i = 0; i < maxScrolls; i += 1) {
          const currentCount = await page.$$eval(TWEET_SELECTOR, (elements) => elements.length);
          if (currentCount === previousCount && i > 0) break;
          previousCount = currentCount;
          const scrollDistance = Math.floor(650 + Math.random() * 700);
          await HumanBehavior.scroll(page, scrollDistance);
          if (Math.random() < 0.3) {
            const backDistance = -Math.floor(120 + Math.random() * 320);
            await HumanBehavior.delay(300, 800);
            await HumanBehavior.scroll(page, backDistance);
          }
          await HumanBehavior.delay(1100, 2100);
        }
      }

      const users = await page.evaluate((max) => {
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        const replies = articles.slice(1, max + 1);

        return replies.map((article, index) => {
          let username = '';
          const userNameLink = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
          if (userNameLink) {
            const href = userNameLink.getAttribute('href');
            if (href && href.length > 1) {
              username = href.split('/')[1]?.split('?')[0] ?? '';
            }
          }

          if (!username) {
            const avatarLink = article.querySelector('[data-testid="Tweet-User-Avatar"] a[href^="/"]');
            const href = avatarLink?.getAttribute('href');
            if (href && href.length > 1) {
              username = href.split('/')[1]?.split('?')[0] ?? '';
            }
          }

          if (!username) {
            const anyUserLink = article.querySelector('a[href^="/"]:not([href*="/status/"])');
            const href = anyUserLink?.getAttribute('href');
            if (href && href.length > 1) {
              username = href.substring(1).split('/')[0] ?? '';
            }
          }

          const displayName =
            article.querySelector('[data-testid="User-Name"] a span span')?.textContent?.trim() ??
            username;
          const commentText =
            article.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '';
          const commentTimestamp =
            article.querySelector('time')?.getAttribute('datetime') ??
            new Date().toISOString();
          const commentPath =
            article.querySelector('a[href*="/status/"]')?.getAttribute('href') ?? '';
          const avatarUrl =
            article.querySelector<HTMLImageElement>('[data-testid="Tweet-User-Avatar"] img')?.src;
          const isVerified = Boolean(article.querySelector('[data-testid="icon-verified"]'));
          const isGoldVerified = Boolean(
            article.querySelector('[data-testid="icon-verified-gold"]'),
          );
          const isGreyVerified = Boolean(
            article.querySelector('[data-testid="icon-verified-grey"]'),
          );

          const id = `${username || 'unknown'}_${index}_${commentTimestamp}`;

          return {
            id,
            username,
            displayName,
            isVerified,
            isGoldVerified,
            isGreyVerified,
            followersCount: 0,
            followingCount: 0,
            tweetCount: 0,
            commentText,
            commentTimestamp,
            commentUrl: commentPath ? `https://x.com${commentPath}` : '',
            isFollowing: false,
            status: 'pending' as const,
            upTime: new Date(),
            ...(avatarUrl ? { avatarUrl } : {}),
          };
        });
      }, maxComments);

      const uniqueByUsername = new Map<string, CommentUserInfo>();
      for (const user of users) {
        if (!user.username) continue;
        if (!uniqueByUsername.has(user.username)) {
          uniqueByUsername.set(user.username, user);
        }
      }

      const allUsers = Array.from(uniqueByUsername.values());
      const verifiedUsers = allUsers.filter(
        (user) => user.isVerified || user.isGoldVerified || user.isGreyVerified,
      );
      const selectedUsers = (onlyVerified ? verifiedUsers : allUsers).filter(
        (user) => !excludedUsernames.has(normalizeUsername(user.username).toLowerCase()),
      );
      let enrichedUsers = selectedUsers;

      if (extractDetailedInfo) {
        const limitedUsers = selectedUsers.slice(0, Math.max(1, maxUsersToProcess));
        enrichedUsers = [];
        for (const user of limitedUsers) {
          try {
            await this.goToProfile(page, user.username);
            const profile = await this.getUserProfile(page, user.username);
            const parseCount = (value: string): number => {
              const cleaned = value.replace(/,/g, '').trim();
              const match = cleaned.match(/([\d.]+)\s*([KMB])?/i);
              if (!match) return 0;
              let num = Number.parseFloat(match[1]);
              const unit = match[2]?.toUpperCase();
              if (unit === 'K') num *= 1_000;
              if (unit === 'M') num *= 1_000_000;
              if (unit === 'B') num *= 1_000_000_000;
              return Number.isFinite(num) ? Math.floor(num) : 0;
            };

            enrichedUsers.push({
              ...user,
              followersCount: profile ? parseCount(profile.followersCount) : user.followersCount,
              followingCount: profile ? parseCount(profile.followingCount) : user.followingCount,
              tweetCount: profile ? parseCount(profile.tweetsCount) : user.tweetCount,
              ...(profile?.bio ? { bio: profile.bio } : {}),
              ...(profile?.location ? { location: profile.location } : {}),
              ...(profile?.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
              isFollowing: false,
            });
          } catch {
            enrichedUsers.push(user);
          }
          await HumanBehavior.delay(1200, 2200);
        }

        await page.goto(tweetUrl, { waitUntil: 'domcontentloaded' });
        await HumanBehavior.delay(1200, 1800);
      }

      const followedUsers: string[] = [];
      const skippedUsers: string[] = [];

      if (shouldFollow) {
        for (const user of enrichedUsers) {
          if (followedUsers.length >= followCap) {
            console.log(`[follow] Reached run cap (${followCap}). Stopping follow actions.`);
            break;
          }

          if (!user.username) {
            skippedUsers.push('unknown');
            user.status = 'skipped';
            continue;
          }

          if (excludedUsernames.has(normalizeUsername(user.username).toLowerCase())) {
            skippedUsers.push(user.username);
            user.status = 'skipped';
            console.log(`[follow] Skip @${user.username}: already followed in verified_users (is_fl=1)`);
            continue;
          }

          if (Math.random() > followProbability) {
            skippedUsers.push(user.username);
            user.status = 'skipped';
            console.log(
              `[follow] Skip @${user.username}: random policy (${Math.round(followProbability * 100)}% follow rate)`,
            );
            continue;
          }

          try {
            await this.goToProfile(page, user.username);
            const toggleResult = await this.toggleFollowOnProfile(page, {
              action: 'follow',
              waitAfterClickMs: 1200,
              confirmAction: true,
            });

            if (toggleResult.success && (toggleResult.action === 'follow' || toggleResult.action === 'none')) {
              followedUsers.push(user.username);
              user.isFollowing = true;
              user.status = 'followed';
              const followMessage =
                toggleResult.action === 'follow'
                  ? `[follow] Followed @${user.username}`
                  : `[follow] Already following @${user.username}`;
              console.log(followMessage);
            } else {
              skippedUsers.push(user.username);
              user.isFollowing = toggleResult.success;
              user.status =
                !toggleResult.success &&
                (toggleResult.error?.toLowerCase().includes('blocked') ?? false)
                  ? 'blocked'
                  : 'skipped';
              console.log(
                `[follow] Skipped @${user.username}: ${toggleResult.error ?? 'unknown reason'}`,
              );
            }
          } catch {
            skippedUsers.push(user.username);
            user.status = 'skipped';
            console.log(`[follow] Skipped @${user.username}: unexpected error`);
          }

          await HumanBehavior.delay(1500, 2600);
        }

        if (page.url() !== tweetUrl) {
          await page.goto(tweetUrl, { waitUntil: 'domcontentloaded' });
          await HumanBehavior.delay(1200, 1800);
        }
      }

      return {
        success: true,
        totalComments: allUsers.length,
        verifiedUsers: enrichedUsers,
        followedUsers,
        skippedUsers,
      };
    } catch (error) {
      return {
        success: false,
        totalComments: 0,
        verifiedUsers: [],
        followedUsers: [],
        skippedUsers: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ===========================================================================
  // INTERACT WITH TWEET - TƯƠNG TÁC VỚI TWEET (LIKE, RETWEET, REPLY, ...)
  // ===========================================================================

  static async likeCurrentTweet(
    page: Page, 
    options: {
      timeoutMs?: number;
      navigateToHomeOnSuccess?: boolean;
      waitAfterLikeMs?: number;
    } = {}
  ): Promise<boolean> {
    const {
      timeoutMs = 15000,
      navigateToHomeOnSuccess = true,
      waitAfterLikeMs = 1500
    } = options;

    try {
      console.log('[likeCurrentTweet] Starting...');
      
      const likeButton = page.locator('[data-testid="like"]').first();
      await likeButton.waitFor({ state: 'visible', timeout: timeoutMs });
      
      const initialLabel = await likeButton.getAttribute('aria-label');
      const wasLiked = initialLabel?.includes('Unlike') ?? false;
      
      if (wasLiked) {
        console.log('✅ Tweet already liked');
        if (navigateToHomeOnSuccess) {
          await this.goToHome(page).catch((error) => {
            console.warn('[likeCurrentTweet] Go home after already-liked state failed:', error);
          });
        }
        return true;
      }

      const likeResponsePromise = page.waitForResponse(
        response => response.url().includes('/like') && response.status() === 200,
        { timeout: 5000 }
      ).catch(() => null);

      await HumanBehavior.clickLikeHuman(page, '[data-testid="like"]');
      console.log('[likeCurrentTweet] Clicked like button');
      
      const response = await likeResponsePromise;
      
      let success = false;
      
      if (response) {
        console.log('❤️ Like API confirmed');
        await HumanBehavior.delay(300, 500);
        success = true;
      } else {
        await HumanBehavior.delay(1000, 1500);
        const finalLabel = await likeButton.getAttribute('aria-label');
        success = finalLabel?.includes('Unlike') ?? false;
        
        if (success) {
          console.log('❤️ Liked tweet (UI confirmed)');
        } else {
          console.warn('⚠️ Like may have failed - API timeout');
        }
      }
      
      if (success && navigateToHomeOnSuccess) {
        console.log('[likeCurrentTweet] Navigating to home feed...');
        await this.goToHome(page).catch((error) => {
          console.warn('[likeCurrentTweet] Go home after like success failed:', error);
        });
        await HumanBehavior.delay(waitAfterLikeMs, waitAfterLikeMs + 500);
      }
      
      return success;
      
    } catch (error) {
      console.error('❌ Failed to like tweet:', error);
      return false;
    }
  }

  static async likeCurrentTweetAndStay(page: Page, timeoutMs = 15000): Promise<boolean> {
    return this.likeCurrentTweet(page, { navigateToHomeOnSuccess: false, timeoutMs });
  }

  static async likeCurrentTweetAndGoHome(page: Page, timeoutMs = 15000): Promise<boolean> {
    return this.likeCurrentTweet(page, { navigateToHomeOnSuccess: true, timeoutMs });
  }

  static async unlikeCurrentTweet(page: Page): Promise<boolean> {
    const likeButton = page.locator('[data-testid="like"]').first();
    if ((await likeButton.count()) === 0) return false;

    const label = await likeButton.getAttribute('aria-label');
    if (!label?.includes('Unlike')) return false;

    await HumanBehavior.clickLikeHuman(page, '[data-testid="like"]');
    await HumanBehavior.delay(500, 1000);
    console.log('Unliked tweet');
    return true;
  }

  static async retweetCurrentTweet(page: Page): Promise<boolean> {
    const retweetButton = page.locator('[data-testid="retweet"]').first();
    if ((await retweetButton.count()) === 0) return false;

    await HumanBehavior.clickLikeHuman(page, '[data-testid="retweet"]');
    await HumanBehavior.delay(800, 1200);

    const confirmButton = page.locator('[data-testid="retweetConfirm"]').first();
    if ((await confirmButton.count()) > 0) {
      await HumanBehavior.clickLikeHuman(page, '[data-testid="retweetConfirm"]');
      await HumanBehavior.delay(500, 1000);
    }

    console.log('Retweeted');
    return true;
  }

  static async replyToTweet(
    page: Page,
    replyInput: string | ReplyToTweetOptions,
  ): Promise<boolean> {
    const options: ReplyToTweetOptions =
      typeof replyInput === 'string' ? { replyText: replyInput } : replyInput;
    const {
      replyText,
      likeAfterReply = false,
      stayOnPage = false,
      maxReplyLength = 280,
      timeoutMs = 15000,
    } = options;

    if (!replyText || replyText.trim().length === 0) {
      console.error('[replyToTweet] Reply text cannot be empty.');
      return false;
    }

    if (replyText.length > maxReplyLength) {
      console.warn(
        `[replyToTweet] Reply text exceeds ${maxReplyLength} characters. It may be truncated by X.`,
      );
    }

    try {
      const replyButton = page.locator('[data-testid="reply"]').first();
      await replyButton.waitFor({ state: 'visible', timeout: timeoutMs });
      await replyButton.hover();
      await HumanBehavior.delay(300, 600);
      await replyButton.click();
      await HumanBehavior.delay(800, 1200);
      console.log('[replyToTweet] Opened reply composer.');

      const textarea = page.locator(TWEET_TEXTAREA_SELECTOR).first();
      await textarea.waitFor({ state: 'visible', timeout: timeoutMs });
      await textarea.click();
      await HumanBehavior.delay(200, 400);
      await textarea.fill(replyText);

      const postButton = page
        .locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')
        .first();
      await postButton.waitFor({ state: 'visible', timeout: timeoutMs });
      await HumanBehavior.delay(500, 1000);
      await postButton.click();
      console.log('[replyToTweet] Reply posted.');

      await HumanBehavior.delay(2000, 3000);

      if (likeAfterReply) {
        console.log('[replyToTweet] Attempting to like original tweet.');
        await this.likeCurrentTweet(page, { navigateToHomeOnSuccess: false, timeoutMs });
      }

      if (!stayOnPage) {
        await this.goToHome(page);
      }

      return true;
    } catch (error) {
      console.error('[replyToTweet] Failed to reply:', error);
      return false;
    }
  }

  static async autoReplyToTweet(
    page: Page,
    options: AutoReplyOptions = {},
  ): Promise<boolean> {
    const {
      mode = 'template',
      templatePath = './reply-templates.txt',
      deepseekApiKey = process.env.DEEPSEEK_API_KEY ?? '',
      deepseekModel = 'deepseek-chat',
      likeBeforeReply = false,
      stayOnPage = false,
      maxReplyLength = 280,
      minTweetLength = 5,
      timeoutMs = 30000,
      sourceTweetText = '',
      excludeReplyTexts = [],
      onReplySubmitted = () => undefined,
    } = options;

    const timeoutPromise = new Promise<boolean>((_, reject) => {
      setTimeout(() => reject(new Error('Auto-reply timeout')), timeoutMs);
    });

    try {
      const run = this.autoReplyCore(page, {
        mode,
        templatePath,
        deepseekApiKey,
        deepseekModel,
        likeBeforeReply,
        stayOnPage,
        maxReplyLength,
        minTweetLength,
        sourceTweetText,
        excludeReplyTexts,
        onReplySubmitted,
      });
      return await Promise.race([run, timeoutPromise]);
    } catch (error) {
      console.error('[autoReply] Failed:', error);
      return false;
    }
  }

  private static async autoReplyCore(
    page: Page,
    options: Required<
      Pick<
        AutoReplyOptions,
        | 'mode'
        | 'templatePath'
        | 'deepseekApiKey'
        | 'deepseekModel'
        | 'likeBeforeReply'
        | 'stayOnPage'
        | 'maxReplyLength'
        | 'minTweetLength'
        | 'sourceTweetText'
        | 'excludeReplyTexts'
        | 'onReplySubmitted'
      >
    >,
  ): Promise<boolean> {
    const {
      mode,
      templatePath,
      deepseekApiKey,
      deepseekModel,
      likeBeforeReply,
      stayOnPage,
      maxReplyLength,
      minTweetLength,
      sourceTweetText,
      excludeReplyTexts,
      onReplySubmitted,
    } = options;

    let tweetText = sourceTweetText.trim();
    if (!tweetText) {
      tweetText = (await this.getCurrentTweetText(page)) ?? '';
    }
    if (!tweetText || tweetText.length < minTweetLength) {
      console.log(`[autoReply] Skip: tweet too short (len=${tweetText.length})`);
      return false;
    }

    let replyContent = '';
    if (mode === 'template' || mode === 'hybrid') {
      replyContent = await this.generateTemplateReply(tweetText, templatePath, excludeReplyTexts);
      if (replyContent) {
        console.log('[autoReply] Template reply selected');
      } else if (mode === 'template') {
        console.warn('[autoReply] No template matched in template mode');
        return false;
      }
    }

    if (!replyContent && (mode === 'ai' || mode === 'hybrid')) {
      if (!deepseekApiKey) {
        if (mode === 'ai') {
          console.error('[autoReply] Missing DeepSeek API key in ai mode');
          return false;
        }
        replyContent = 'Thanks for sharing!';
      } else {
        replyContent = await this.generateDeepSeekReply(
          tweetText,
          deepseekApiKey,
          deepseekModel,
          maxReplyLength,
        );
        if (!replyContent) replyContent = 'Interesting, thanks for sharing.';
      }
    }

    if (!replyContent) {
      console.error('[autoReply] Could not generate reply content');
      return false;
    }

    const uniqueReplyContent = this.ensureUniqueReplyContent(replyContent, excludeReplyTexts);
    if (!uniqueReplyContent) {
      console.log('[autoReply] Skip: generated reply is duplicate of recent replies');
      return false;
    }
    replyContent = uniqueReplyContent;

    if (replyContent.length > maxReplyLength) {
      replyContent = `${replyContent.slice(0, maxReplyLength - 3)}...`;
    }

    if (likeBeforeReply) {
      const liked = await this.likeCurrentTweet(page, { navigateToHomeOnSuccess: false });
      console.log(liked ? '[autoReply] Liked before reply' : '[autoReply] Like-before-reply skipped/failed');
      await HumanBehavior.delay(800, 1600);
    }

    const submitted = await this.replyToTweet(page, {
      replyText: replyContent,
      likeAfterReply: false,
      stayOnPage,
      maxReplyLength,
      timeoutMs: 15000,
    });
    if (submitted) onReplySubmitted?.(replyContent);
    return submitted;
  }

  private static async generateTemplateReply(
    tweetText: string,
    templatePath: string,
    excludeReplyTexts: string[] = [],
  ): Promise<string> {
    try {
      const content = await readFile(templatePath, 'utf8');
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

      const keywordTemplates: Array<{ keyword: string; replies: string[] }> = [];
      const genericReplies: string[] = [];
      const recentSet = new Set(
        excludeReplyTexts
          .map((text) => this.normalizeReplyText(text))
          .filter((text) => text.length > 0),
      );

      for (const line of lines) {
        const sepIndex = line.indexOf('=>');
        if (sepIndex === -1) {
          genericReplies.push(line);
          continue;
        }
        const keyword = line.slice(0, sepIndex).trim().toLowerCase();
        const replyPart = line.slice(sepIndex + 2).trim();
        const replies = replyPart.split('|').map((r) => r.trim()).filter(Boolean);
        if (!keyword || replies.length === 0) continue;
        keywordTemplates.push({ keyword, replies });
      }

      const normalizedTweet = tweetText.toLowerCase();
      for (const item of keywordTemplates) {
        if (normalizedTweet.includes(item.keyword)) {
          return this.pickReplyAvoidingRecent(item.replies, recentSet);
        }
      }

      if (genericReplies.length > 0) {
        return this.pickReplyAvoidingRecent(genericReplies, recentSet);
      }

      return '';
    } catch {
      return '';
    }
  }

  private static normalizeReplyText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private static pickReplyAvoidingRecent(candidates: string[], recentSet: Set<string>): string {
    const uniqueCandidates = Array.from(new Set(candidates.map((item) => item.trim()).filter(Boolean)));
    if (uniqueCandidates.length === 0) return '';

    const freshCandidates = uniqueCandidates.filter(
      (item) => !recentSet.has(this.normalizeReplyText(item)),
    );
    const pickPool = freshCandidates.length > 0 ? freshCandidates : uniqueCandidates;
    return pickPool[Math.floor(Math.random() * pickPool.length)] ?? '';
  }

  private static ensureUniqueReplyContent(
    replyContent: string,
    excludeReplyTexts: string[],
  ): string {
    const normalizedReply = this.normalizeReplyText(replyContent);
    if (!normalizedReply) return '';

    const recentSet = new Set(
      excludeReplyTexts
        .map((text) => this.normalizeReplyText(text))
        .filter((text) => text.length > 0),
    );
    if (!recentSet.has(normalizedReply)) return replyContent.trim();

    const fallbackCandidates = [
      'Great point, thanks for sharing.',
      'Interesting perspective, appreciate the post.',
      'This is helpful, thanks for posting.',
      'Valuable insight, thank you.',
      'Good take, thanks for the update.',
    ];
    return this.pickReplyAvoidingRecent(fallbackCandidates, recentSet);
  }

  static async getCurrentTweetText(page: Page): Promise<string | null> {
    try {
      const statusId = page.url().match(/\/status\/(\d+)/)?.[1] ?? '';
      await page.waitForSelector('article[data-testid="tweet"], [data-testid="tweetText"]', {
        timeout: 10000,
      });

      return await page.evaluate((targetStatusId) => {
        const getText = (article: Element): string =>
          article.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '';

        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
        if (targetStatusId) {
          for (const article of articles) {
            const link = article.querySelector('a[href*="/status/"]')?.getAttribute('href') ?? '';
            if (link.includes(`/status/${targetStatusId}`)) {
              const txt = getText(article);
              if (txt) return txt;
            }
          }
        }

        for (const article of articles) {
          const txt = getText(article);
          if (txt) return txt;
        }

        const fallback = document.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '';
        return fallback || null;
      }, statusId);
    } catch {
      return null;
    }
  }

  private static async generateDeepSeekReply(
    tweetText: string,
    apiKey: string,
    model: string,
    maxLength: number,
  ): Promise<string> {
    const prompt = `You are a friendly X user. Reply naturally under ${maxLength} characters. Do not repeat the tweet.\nTweet: "${tweetText}"\nReply:`;
    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You write concise and natural replies on X.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.8,
          max_tokens: 100,
          top_p: 0.9,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DeepSeek] API error ${response.status}: ${errorText}`);
        return '';
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content?.trim() ?? '';
    } catch (error) {
      console.error('[DeepSeek] Generation failed:', error);
      return '';
    }
  }

  static async bookmarkCurrentTweet(page: Page): Promise<boolean> {
    const bookmarkButton = page.locator('[data-testid="bookmark"]').first();
    if ((await bookmarkButton.count()) === 0) return false;

    await HumanBehavior.clickLikeHuman(page, '[data-testid="bookmark"]');
    await HumanBehavior.delay(500, 1000);
    console.log('Bookmarked tweet');
    return true;
  }

  static async quoteTweet(page: Page, quoteText: string): Promise<boolean> {
    const shareButton = page.locator('[data-testid="share"]').first();
    if ((await shareButton.count()) === 0) return false;

    await HumanBehavior.clickLikeHuman(page, '[data-testid="share"]');
    await HumanBehavior.delay(500, 800);

    const quoteOption = page.locator('[data-testid="quote"]').first();
    if ((await quoteOption.count()) === 0) return false;

    await HumanBehavior.clickLikeHuman(page, '[data-testid="quote"]');
    await HumanBehavior.delay(800, 1200);
    await HumanBehavior.type(page, TWEET_TEXTAREA_SELECTOR, quoteText);
    await HumanBehavior.delay(500, 1000);
    await HumanBehavior.clickLikeHuman(page, POST_TWEET_BUTTON_SELECTOR);
    await HumanBehavior.delay(1500, 2500);

    console.log(`Quoted with: ${quoteText.substring(0, 50)}...`);
    return true;
  }

  // ===========================================================================
  // NAVIGATION - ĐIỀU HƯỚNG
  // ===========================================================================

  static async goToHome(page: Page): Promise<void> {
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
    try {
      await this.waitForFeed(page);
    } catch {
      const hasTweets = (await page.locator(TWEET_SELECTOR).count()) > 0;
      if (!hasTweets) {
        throw new Error('Home feed did not become visible after navigation');
      }
      await HumanBehavior.delay(800, 1400);
    }
    await HumanBehavior.delay(1500, 2500);
    console.log('Navigated to Home');
  }

  static async goToExplore(page: Page): Promise<void> {
    await page.goto('https://x.com/explore', { waitUntil: 'domcontentloaded' });
    await HumanBehavior.delay(1500, 2500);
    console.log('Navigated to Explore');
  }

  static async goToNotifications(page: Page): Promise<void> {
    await page.goto('https://x.com/notifications', { waitUntil: 'domcontentloaded' });
    await HumanBehavior.delay(1500, 2500);
    console.log('Navigated to Notifications');
  }

  static async goToMessages(page: Page): Promise<void> {
    await page.goto('https://x.com/messages', { waitUntil: 'domcontentloaded' });
    await HumanBehavior.delay(1500, 2500);
    console.log('Navigated to Messages');
  }

  static async goToProfile(page: Page, username: string): Promise<void> {
    await page.goto(`https://x.com/${normalizeUsername(username)}`, {
      waitUntil: 'domcontentloaded',
    });
    try {
      await page.waitForSelector('[data-testid="UserName"]', { timeout: 10000 });
    } catch {
      await page.waitForSelector('[data-testid="primaryColumn"], main', { timeout: 8000 });
    }
    await HumanBehavior.delay(1500, 2500);
    console.log(`Navigated to profile: @${normalizeUsername(username)}`);
  }

  static async goBack(page: Page): Promise<void> {
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await HumanBehavior.delay(1000, 1500);
    console.log('Went back');
  }

  // ===========================================================================
  // SCROLL ACTIONS - CUỘN TRANG
  // ===========================================================================

  static async scrollFeed(page: Page, times = 1): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      await HumanBehavior.scroll(page, 500);
      await HumanBehavior.delay(1000, 1500);
    }

    console.log(`Scrolled feed ${times} time(s)`);
  }

  static async loadMoreTweets(page: Page, maxScrolls = 5): Promise<number> {
    let previousCount = 0;
    let scrolls = 0;

    for (let i = 0; i < maxScrolls; i += 1) {
      const currentCount = await page.$$eval(TWEET_SELECTOR, (elements) => elements.length);
      if (currentCount === previousCount && i > 0) break;

      previousCount = currentCount;
      await HumanBehavior.scroll(page, 800);
      await HumanBehavior.delay(1500, 2000);
      scrolls += 1;
    }

    console.log(`Loaded more tweets: ${scrolls} scrolls`);
    return scrolls;
  }

  static async scrollToTop(page: Page): Promise<void> {
    await page.evaluate(() => window.scrollTo(0, 0));
    await HumanBehavior.delay(500, 800);
    console.log('Scrolled to top');
  }

  // ===========================================================================
  // SEARCH ACTIONS - TÌM KIẾM
  // ===========================================================================

  static async search(page: Page, query: string): Promise<void> {
    await page.goto(`https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query`, {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForFeed(page);
    await HumanBehavior.delay(1500, 2500);
    console.log(`Searched: ${query}`);
  }

  static async searchPeople(page: Page, query: string): Promise<void> {
    await page.goto(`https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=user`, {
      waitUntil: 'domcontentloaded',
    });
    await HumanBehavior.delay(1500, 2500);
    console.log(`Searched people: ${query}`);
  }

  static async typeSearch(page: Page, query: string): Promise<void> {
    const selector = '[data-testid="SearchBox_Search_Input"]';
    if ((await page.locator(selector).count()) === 0) return;

    await HumanBehavior.clickLikeHuman(page, selector);
    await HumanBehavior.type(page, selector, query);
    await page.keyboard.press('Enter');
    await HumanBehavior.delay(1500, 2500);
    console.log(`Typed search: ${query}`);
  }

  // ===========================================================================
  // USER PROFILE ACTIONS - TƯƠNG TÁC VỚI USER
  // ===========================================================================

  static async getUserProfile(page: Page, username: string): Promise<UserProfileInfo | null> {
    const normalizedUsername = normalizeUsername(username);
    await this.goToProfile(page, normalizedUsername);

    return page.evaluate((currentUsername) => {
      const displayName =
        document.querySelector('[data-testid="UserName"] span')?.textContent ?? '';
      const bioEl = document.querySelector('[data-testid="UserDescription"]');
      const locationEl = document.querySelector('[data-testid="UserLocation"]');
      const websiteEl = document.querySelector('[data-testid="UserUrl"]');
      const joinDateEl = document.querySelector('[data-testid="UserJoinDate"]');
      const statsText = Array.from(document.querySelectorAll('[data-testid="UserStats"]')).map(
        (element) => element.textContent ?? '',
      );
      const avatarUrl = document.querySelector<HTMLImageElement>(
        'img[alt][src*="profile_images"]',
      )?.src;
      const bannerUrl = document.querySelector<HTMLImageElement>(
        'img[src*="profile_banners"]',
      )?.src;

      return {
        displayName,
        username: currentUsername,
        bio: bioEl?.textContent ?? '',
        location: locationEl?.textContent ?? '',
        website: websiteEl?.textContent ?? '',
        joinDate: joinDateEl?.textContent ?? '',
        followersCount: statsText.find((text) => text.includes('Followers')) ?? '0',
        followingCount: statsText.find((text) => text.includes('Following')) ?? '0',
        tweetsCount: statsText.find((text) => text.includes('Posts')) ?? '0',
        isVerified: Boolean(document.querySelector('[data-testid="icon-verified"]')),
        ...(avatarUrl === undefined ? {} : { avatarUrl }),
        ...(bannerUrl === undefined ? {} : { bannerUrl }),
      };
    }, normalizedUsername);
  }

  static async toggleFollowOnProfile(
    page: Page,
    options?: {
      action?: ToggleFollowAction;
      waitAfterClickMs?: number;
      confirmAction?: boolean;
    },
  ): Promise<ToggleFollowResult> {
    const waitAfterClickMs = options?.waitAfterClickMs ?? 1000;
    const confirmAction = options?.confirmAction ?? true;

    try {
      const username = await this.extractUsernameFromProfile(page);
      if (!username) {
        return {
          success: false,
          action: 'none',
          error: 'Could not extract username from profile page',
        };
      }

      const buttonInfo = await this.findFollowButton(page, username);
      if (!buttonInfo) {
        return {
          success: false,
          action: 'none',
          username,
          error: 'Could not detect follow button in current profile UI',
        };
      }

      const { button, currentState, buttonText } = buttonInfo;
      console.log(`[toggle-follow] @${username}: state=${currentState}, text="${buttonText}"`);

      if (currentState === 'blocked') {
        return {
          success: false,
          action: 'none',
          username,
          error: 'User is blocked or follow action is unavailable',
        };
      }

      const actionToTake: ToggleFollowAction =
        options?.action ?? (currentState === 'following' ? 'unfollow' : 'follow');

      if (
        (actionToTake === 'follow' && currentState === 'following') ||
        (actionToTake === 'unfollow' && currentState === 'not-following')
      ) {
        return {
          success: true,
          action: 'none',
          username,
        };
      }

      if (actionToTake === 'unfollow') {
        await button.click();
        await page.waitForTimeout(500);
        const confirmed = await this.handleUnfollowConfirmation(page);
        if (!confirmed) {
          return {
            success: false,
            action: 'unfollow',
            username,
            error: 'Unfollow confirmation failed',
          };
        }
      } else {
        await button.click();
      }

      await page.waitForTimeout(waitAfterClickMs);

      if (confirmAction) {
        const newState = await this.checkFollowState(page, username);
        const expectedState: FollowState =
          actionToTake === 'follow' ? 'following' : 'not-following';
        if (newState !== expectedState) {
          return {
            success: false,
            action: actionToTake,
            username,
            error: `State mismatch after click: expected ${expectedState}, got ${newState}`,
          };
        }
      }

      return {
        success: true,
        action: actionToTake,
        username,
      };
    } catch (error) {
      return {
        success: false,
        action: 'none',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  static async extractUsernameFromProfile(page: Page): Promise<string | null> {
    return page.evaluate((reservedPathSegments) => {
      const userNameSection = document.querySelector('[data-testid="UserName"]');
      if (userNameSection) {
        const spans = userNameSection.querySelectorAll('span');
        for (const span of Array.from(spans)) {
          const text = span.textContent?.trim();
          if (text && text.startsWith('@') && text.length > 1) {
            return text.replace('@', '');
          }
        }
      }

      const heading = document.querySelector('[data-testid="UserName"] span.css-1jxf684');
      if (heading) {
        const text = heading.textContent?.trim();
        if (text && text.startsWith('@') && text.length > 1) {
          return text.replace('@', '');
        }
      }

      const path = window.location.pathname.split('/')[1]?.trim() ?? '';
      if (path && !reservedPathSegments.includes(path.toLowerCase())) {
        return path;
      }

      return null;
    }, Array.from(RESERVED_X_PATH_SEGMENTS));
  }

  static async checkFollowState(page: Page, username?: string): Promise<FollowState> {
    const detectedUsername = username ?? (await this.extractUsernameFromProfile(page)) ?? '';
    const buttonInfo = await this.findFollowButton(page, detectedUsername);
    return buttonInfo?.currentState ?? 'unknown';
  }

  private static async findFollowButton(
    page: Page,
    username: string,
  ): Promise<FollowButtonInfo | null> {
    try {
      const selection = await page.evaluate((rawUsername) => {
        const normalizedUsername = rawUsername.trim().replace(/^@/, '').toLowerCase();
        const container = document.querySelector('[data-testid="primaryColumn"]') ?? document;
        const buttons = Array.from(container.querySelectorAll('button[role="button"]'));
        const followTerms = ['follow', 'follow back', 'theo doi'];
        const followingTerms = ['following', 'dang theo doi'];
        const blockedTerms = ['blocked', 'da chan'];

        let winner: FollowCandidate | null = null;

        for (const buttonEl of buttons) {
          const button = buttonEl as HTMLButtonElement;
          const style = window.getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          const isVisible =
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0;
          if (!isVisible) continue;

          const testId = button.getAttribute('data-testid') ?? '';
          const ariaLabel = (button.getAttribute('aria-label') ?? '').trim();
          const buttonText =
            button.querySelector('span')?.textContent?.trim() ?? button.textContent?.trim() ?? '';
          const lowerText = buttonText
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
          const lowerAria = ariaLabel
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

          const top = rect.top;
          let score = 0;
          let currentState: FollowState = 'unknown';

          if (testId.endsWith('-unfollow')) {
            currentState = 'following';
            score += 90;
          } else if (testId.endsWith('-follow')) {
            currentState = 'not-following';
            score += 90;
          } else if (testId.endsWith('-blocked')) {
            currentState = 'blocked';
            score += 90;
          }

          if (lowerAria.includes(`@${normalizedUsername}`)) score += 60;
          if (lowerAria.includes('following @') || lowerAria.includes('dang theo doi @')) {
            currentState = 'following';
            score += 50;
          } else if (
            lowerAria.includes('follow @') ||
            lowerAria.includes('theo doi @') ||
            lowerAria.includes('follow back @')
          ) {
            currentState = 'not-following';
            score += 50;
          }

          for (const term of followingTerms) {
            if (lowerText === term) {
              currentState = 'following';
              score += 30;
              break;
            }
          }

          if (currentState === 'unknown') {
            for (const term of followTerms) {
              if (lowerText === term) {
                currentState = 'not-following';
                score += 30;
                break;
              }
            }
          }

          if (currentState === 'unknown') {
            for (const term of blockedTerms) {
              if (lowerText.includes(term)) {
                currentState = 'blocked';
                score += 30;
                break;
              }
            }
          }

          if (button.closest('[data-testid="userActions"]')) score += 120;
          if (top > 0 && top < 700) score += 10;
          if (currentState === 'unknown') continue;

          const candidate: FollowCandidate = {
            currentState,
            buttonText: buttonText || currentState,
            testId,
            ariaLabel,
            score,
            top,
          };

          if (!winner || candidate.score > winner.score || (candidate.score === winner.score && candidate.top < winner.top)) {
            winner = candidate;
          }
        }

        return winner;
      }, username);

      if (!selection) return null;

      let button =
        selection.testId.length > 0
          ? page.locator(`button[role="button"][data-testid="${selection.testId}"]`).first()
          : page
              .locator('button[role="button"]')
              .filter({ hasText: selection.buttonText })
              .first();

      let visible = await button.isVisible({ timeout: 2000 }).catch(() => false);
      if (!visible && selection.ariaLabel.length > 0) {
        button = page
          .locator(`button[role="button"][aria-label="${selection.ariaLabel.replace(/"/g, '\\"')}"]`)
          .first();
        visible = await button.isVisible({ timeout: 2000 }).catch(() => false);
      }

      if (!visible) return null;

      return {
        button,
        currentState: selection.currentState,
        buttonText: selection.buttonText,
      };
    } catch {
      return null;
    }
  }

  private static async handleUnfollowConfirmation(page: Page): Promise<boolean> {
    try {
      const confirmButton = page.locator('[data-testid="confirmationSheetConfirm"]').first();
      if (await confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmButton.click();
        await page.waitForTimeout(500);
        return true;
      }

      const unfollowButton = page.getByRole('button', { name: /^Unfollow$/i }).first();
      if (await unfollowButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await unfollowButton.click();
        await page.waitForTimeout(500);
        return true;
      }

      return true;
    } catch {
      return false;
    }
  }

  static async followUser(page: Page, username: string): Promise<boolean> {
    const normalizedUsername = normalizeUsername(username);
    await this.goToProfile(page, normalizedUsername);

    const result = await this.toggleFollowOnProfile(page, {
      action: 'follow',
      waitAfterClickMs: 1200,
      confirmAction: true,
    });

    if (!result.success) return false;
    return result.action === 'follow' || result.action === 'none';
  }

  static async unfollowUser(page: Page, username: string): Promise<boolean> {
    const normalizedUsername = normalizeUsername(username);
    await this.goToProfile(page, normalizedUsername);

    const result = await this.toggleFollowOnProfile(page, {
      action: 'unfollow',
      waitAfterClickMs: 1200,
      confirmAction: true,
    });

    if (!result.success) return false;
    return result.action === 'unfollow' || result.action === 'none';
  }

  // ===========================================================================
  // NOTIFICATION ACTIONS - THÔNG BÁO
  // ===========================================================================

  static async getUnreadCount(page: Page): Promise<number> {
    await this.goToNotifications(page);
    const count = await page.evaluate(() => {
      const badge = document.querySelector('[data-testid="AppTabBar_Notifications_Count"]');
      return Number.parseInt(badge?.textContent ?? '0', 10) || 0;
    });

    console.log(`Unread notifications: ${count}`);
    return count;
  }

  static async getRecentNotifications(page: Page, limit = 10): Promise<NotificationInfo[]> {
    await this.goToNotifications(page);
    await HumanBehavior.delay(1000, 1500);

    return page.evaluate((max): NotificationInfo[] => {
      return Array.from(document.querySelectorAll('[data-testid="notification"]'))
        .slice(0, max)
        .map((notification) => {
          const text = notification.textContent ?? '';
          let type: NotificationInfo['type'] = 'mention';
          if (text.includes('liked')) type = 'like';
          else if (text.includes('retweeted')) type = 'retweet';
          else if (text.includes('followed')) type = 'follow';
          else if (text.includes('replied')) type = 'reply';

          return {
            type,
            fromUsername: text.match(/@(\w+)/)?.[1] ?? '',
            fromDisplayName: '',
            tweetText: text,
            timestamp: '',
            isRead: false,
          };
        });
    }, limit);
  }

  static async markAllAsRead(page: Page): Promise<void> {
    await this.goToNotifications(page);

    const settingsSelector = '[data-testid="settings"]';
    if ((await page.locator(settingsSelector).count()) === 0) return;

    await HumanBehavior.clickLikeHuman(page, settingsSelector);
    await HumanBehavior.delay(500, 800);

    const markRead = page.getByText('Mark all as read').first();
    if ((await markRead.count()) === 0) return;

    await markRead.click();
    await HumanBehavior.delay(500, 800);
    console.log('Marked all as read');
  }

  // ===========================================================================
  // COMPOSE TWEET - ĐĂNG TWEET MỚI
  // ===========================================================================

  static async composeTweet(page: Page, tweetText: string): Promise<boolean> {
    const composeSelector = '[data-testid="SideNav_NewTweet_Button"]';
    if ((await page.locator(composeSelector).count()) === 0) return false;

    await HumanBehavior.clickLikeHuman(page, composeSelector);
    await HumanBehavior.delay(800, 1200);
    await HumanBehavior.type(page, TWEET_TEXTAREA_SELECTOR, tweetText);
    await HumanBehavior.delay(500, 1000);
    await HumanBehavior.clickLikeHuman(page, POST_TWEET_BUTTON_SELECTOR);
    await HumanBehavior.delay(1500, 2500);

    console.log(`Posted tweet: ${tweetText.substring(0, 50)}...`);
    return true;
  }

  static async composeTweetWithMedia(
    page: Page,
    tweetText: string,
    imagePath: string,
  ): Promise<boolean> {
    const composeSelector = '[data-testid="SideNav_NewTweet_Button"]';
    if ((await page.locator(composeSelector).count()) === 0) return false;

    await HumanBehavior.clickLikeHuman(page, composeSelector);
    await HumanBehavior.delay(800, 1200);
    await HumanBehavior.type(page, TWEET_TEXTAREA_SELECTOR, tweetText);

    const fileInput = page.locator('input[type="file"]').first();
    if ((await fileInput.count()) === 0) return false;

    await fileInput.setInputFiles(imagePath);
    await HumanBehavior.delay(1500, 2000);
    await HumanBehavior.clickLikeHuman(page, POST_TWEET_BUTTON_SELECTOR);
    await HumanBehavior.delay(1500, 2500);

    console.log('Posted tweet with media');
    return true;
  }

  // ===========================================================================
  // UTILITY FUNCTIONS - TIỆN ÍCH
  // ===========================================================================

  static async isLoggedIn(page: Page): Promise<boolean> {
    if (page.url().includes('/login')) return false;

    const hasHomeFeed = (await page.locator(TWEET_SELECTOR).count()) > 0;
    const hasProfileIcon =
      (await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').count()) > 0;

    return hasHomeFeed || hasProfileIcon;
  }

  static async waitForLogin(page: Page, timeout = 120000): Promise<boolean> {
    console.log('Waiting for manual login...');
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await this.isLoggedIn(page)) {
        console.log('Login detected');
        await HumanBehavior.delay(2000, 3000);
        return true;
      }

      await HumanBehavior.delay(2000, 3000);
    }

    console.log('Login timeout');
    return false;
  }

  static getCurrentUrl(page: Page): string {
    return page.url();
  }

  static async screenshot(page: Page, name = 'screenshot'): Promise<void> {
    const path = `${name}-${Date.now()}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(`Screenshot saved: ${path}`);
  }

  static async randomDelay(): Promise<void> {
    await HumanBehavior.delay(500, 1500);
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private static async readTweetByIndex(page: Page, index: number): Promise<TweetInfo | null> {
    return page.evaluate((idx) => {
      const article = document.querySelectorAll('article[data-testid="tweet"]')[idx];
      if (!article) return null;

      const textEl = article.querySelector('[data-testid="tweetText"]');
      const authorNameEl = article.querySelector('[data-testid="User-Name"] a span span');
      const authorUsernameEl = article.querySelector(
        '[data-testid="User-Name"] a[href*="/"]:last-child span',
      );
      const tweetLink = article.querySelector('a[href*="/status/"]')?.getAttribute('href');
      const timeEl = article.querySelector('time');
      const statsGroup = article.querySelector('div[role="group"][aria-label]');
      const ariaLabel = statsGroup?.getAttribute('aria-label') ?? '';
      const text = textEl?.textContent ?? '';

      return {
        text,
        tweetText: text,
        authorName: authorNameEl?.textContent ?? '',
        authorUsername: authorUsernameEl?.textContent?.replace('@', '') ?? '',
        tweetUrl: tweetLink ? `https://x.com${tweetLink}` : '',
        timestamp: timeEl?.getAttribute('datetime') ?? '',
        likes: ariaLabel.match(/(\d+(?:,\d+)*(?:\.\d+)?[KkM]?)\s*likes?/i)?.[1] ?? '0',
        retweets: ariaLabel.match(/(\d+(?:,\d+)*(?:\.\d+)?[KkM]?)\s*reposts?/i)?.[1] ?? '0',
        replies: ariaLabel.match(/(\d+(?:,\d+)*(?:\.\d+)?[KkM]?)\s*replies?/i)?.[1] ?? '0',
        views: ariaLabel.match(/(\d+(?:,\d+)*(?:\.\d+)?[KkM]?)\s*views?/i)?.[1] ?? '0',
        isVerified: Boolean(article.querySelector('[data-testid="icon-verified"]')),
        mediaUrls: Array.from(article.querySelectorAll<HTMLImageElement>('img[src]')).map(
          (image) => image.src,
        ),
      };
    }, index);
  }

  private static async readTweetContainingText(
    page: Page,
    searchText: string,
  ): Promise<TweetInfo | undefined> {
    const tweets = await this.getAllTweets(page, 50);
    return tweets.find((tweet) => tweet.text.includes(searchText));
  }
}

export default XActions;

