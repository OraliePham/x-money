// FILE: src/x-actions.ts
// COMPLETE X (TWITTER) ACTIONS WITH ANTI-DETECTION, TEXT & IMAGE EXTRACTION, RANDOM CLICK

import { Page } from 'playwright';
import { HumanBehavior } from './human-behavior.js';

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
  followVerified?: boolean;      // Automatically follow verified users (default: false)
  extractDetailedInfo?: boolean; // Open profile pages and enrich follower/profile details
  maxUsersToProcess?: number;    // Limit users processed for detailed extraction
};

export type ReadTweetFollowResult = {
  success: boolean;
  totalComments: number;
  verifiedUsers: CommentUserInfo[];
  followedUsers: string[];       // Usernames that were followed
  skippedUsers: string[];        // Usernames that were skipped
  error?: string;
};
// =============================================================================
// CONSTANTS
// =============================================================================

const HOME_URL = 'https://x.com/home';
const TWEET_SELECTOR = 'article[data-testid="tweet"]';
const TWEET_TEXTAREA_SELECTOR = '[data-testid="tweetTextarea_0"]';
const POST_TWEET_BUTTON_SELECTOR = '[data-testid="tweetButton"]';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function isHomeFeedUrl(url: string): boolean {
  return url.includes('x.com/home') || url.includes('twitter.com/home');
}

function normalizeUsername(username: string): string {
  return username.replace(/^@/, '');
}

function parseStat(label: string, name: string): string {
  const match = label.match(new RegExp(`(\\d+(?:,\\d+)*(?:\\.\\d+)?[KkM]?)\\s*${name}`));
  return match?.[1] ?? '0';
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
        const tweetText = textElement?.innerText || '';
        
        const authorNameEl = article.querySelector('[data-testid="User-Name"] a span span');
        const authorName = authorNameEl?.innerText || '';
        
        const authorUsernameEl = article.querySelector('[data-testid="User-Name"] a[href*="/"]:last-child span');
        const authorUsername = authorUsernameEl?.innerText?.replace('@', '') || '';
        
        const tweetLink = article.querySelector('a[href*="/status/"]')?.getAttribute('href');
        const tweetUrl = tweetLink ? `https://x.com${tweetLink}` : '';
        
        const tweetIdMatch = tweetUrl.match(/\/status\/(\d+)/);
        const tweetId = tweetIdMatch ? tweetIdMatch[1] : undefined;
        
        const timeElement = article.querySelector('time');
        const timestamp = timeElement?.getAttribute('datetime') || '';
        
        const statsGroup = article.querySelector('div[role="group"][aria-label]');
        const ariaLabel = statsGroup?.getAttribute('aria-label') || '';
        
        const parseStatLocal = (label: string, name: string): string => {
          const match = label.match(new RegExp(`(\\d+(?:,\\d+)*(?:\\.\\d+)?[KkM]?)\\s*${name}`));
          return match?.[1] ?? '0';
        };
        
        const images = Array.from(article.querySelectorAll('[data-testid="tweetPhoto"] img'))
          .map(img => img.getAttribute('src'))
          .filter(Boolean) as string[];
        
        const videoElement = article.querySelector('video');
        const hasVideo = !!videoElement;
        const videoPoster = videoElement?.getAttribute('poster') || undefined;
        
        return {
          id: tweetId,
          text: tweetText,
          tweetText: tweetText,
          authorName,
          authorUsername,
          tweetUrl,
          timestamp,
          likes: parseStatLocal(ariaLabel, 'likes?'),
          retweets: parseStatLocal(ariaLabel, 'reposts?'),
          replies: parseStatLocal(ariaLabel, 'replies?'),
          views: parseStatLocal(ariaLabel, 'views?'),
          isVerified: Boolean(article.querySelector('[data-testid="icon-verified"]')),
          mediaUrls: images,
          ...(hasVideo && { videoPoster })
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
      // Lấy bounding box của LINK (chính xác hơn là của cả tweet)
      const box = await tweet.boundingBox();
      if (box) {
        // Random position within tweet bounds
        const randomX = box.x + (Math.random() * box.width);
        const randomY = box.y + (Math.random() * box.height);
        const offsetX = (Math.random() - 0.5) * randomOffsetPx;
        const offsetY = (Math.random() - 0.5) * randomOffsetPx;
        const clickX = Math.max(box.x, Math.min(box.x + box.width, randomX + offsetX));
        const clickY = Math.max(box.y, Math.min(box.y + box.height, randomY + offsetY));
        
        console.log(`🎯 Clicking tweet at random position: (${clickX.toFixed(0)}, ${clickY.toFixed(0)})`);
        
        await HumanBehavior.mouseMove(page, clickX, clickY);
        await HumanBehavior.delay(200, 400);
        await page.mouse.click(clickX, clickY);
      } else {
        // Fallback: click on the link directly
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
        console.log(`⚠️ Navigation timeout - tweet may have opened in same tab or failed`);
        return false;
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
      extractMedia = true
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
      followVerified = false,
      extractDetailedInfo = false,
      maxUsersToProcess = 20,
    } = options;

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
          await HumanBehavior.scroll(page, 900);
          await HumanBehavior.delay(1400, 1900);
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
      const selectedUsers = onlyVerified ? verifiedUsers : allUsers;
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

      if (followVerified) {
        for (const user of enrichedUsers) {
          if (!user.username) {
            skippedUsers.push(user.username);
            continue;
          }

          try {
            const followed = await this.followUser(page, user.username);
            if (followed) {
              followedUsers.push(user.username);
            } else {
              skippedUsers.push(user.username);
            }
          } catch {
            skippedUsers.push(user.username);
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
          await this.goToHome(page);
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
        await this.goToHome(page);
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

  static async replyToTweet(page: Page, replyText: string): Promise<boolean> {
    const replyButton = page.locator('[data-testid="reply"]').first();
    if ((await replyButton.count()) === 0) return false;

    await HumanBehavior.clickLikeHuman(page, '[data-testid="reply"]');
    await HumanBehavior.delay(800, 1200);
    await HumanBehavior.type(page, TWEET_TEXTAREA_SELECTOR, replyText);
    await HumanBehavior.delay(500, 1000);

    const postButton = page.locator(POST_TWEET_BUTTON_SELECTOR).first();
    if ((await postButton.count()) === 0) return false;

    await HumanBehavior.clickLikeHuman(page, POST_TWEET_BUTTON_SELECTOR);
    await HumanBehavior.delay(1500, 2500);
    console.log(`Replied: ${replyText.substring(0, 50)}...`);
    return true;
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
    await this.waitForFeed(page);
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
    await page.waitForSelector('[data-testid="UserName"]', { timeout: 10000 });
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

  static async followUser(page: Page, username: string): Promise<boolean> {
    const normalizedUsername = normalizeUsername(username);
    await this.goToProfile(page, normalizedUsername);

    const followButton = page.locator('[data-testid="followButton"]').first();
    if ((await followButton.count()) === 0) return false;

    const label = await followButton.getAttribute('aria-label');
    if (label?.includes('Following')) {
      console.log(`Already following @${normalizedUsername}`);
      return false;
    }

    await HumanBehavior.clickLikeHuman(page, '[data-testid="followButton"]');
    await HumanBehavior.delay(800, 1200);
    console.log(`Followed @${normalizedUsername}`);
    return true;
  }

  static async unfollowUser(page: Page, username: string): Promise<boolean> {
    const normalizedUsername = normalizeUsername(username);
    await this.goToProfile(page, normalizedUsername);

    const followButton = page.locator('[data-testid="followButton"]').first();
    if ((await followButton.count()) === 0) return false;

    const label = await followButton.getAttribute('aria-label');
    if (!label?.includes('Following')) return false;

    await HumanBehavior.clickLikeHuman(page, '[data-testid="followButton"]');
    await HumanBehavior.delay(500, 800);

    const confirmSelector = '[data-testid="confirmationSheetConfirm"]';
    if ((await page.locator(confirmSelector).count()) > 0) {
      await HumanBehavior.clickLikeHuman(page, confirmSelector);
    }

    await HumanBehavior.delay(800, 1200);
    console.log(`Unfollowed @${normalizedUsername}`);
    return true;
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
        likes: parseStat(ariaLabel, 'likes?'),
        retweets: parseStat(ariaLabel, 'reposts?'),
        replies: parseStat(ariaLabel, 'replies?'),
        views: parseStat(ariaLabel, 'views?'),
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
