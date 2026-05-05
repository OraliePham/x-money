// FILE: src/x-actions-enhanced.ts
// ENHANCED X (TWITTER) ACTIONS WITH ADVANCED HUMAN-LIKE BEHAVIOR
// Includes: smart scroll, random offsets, hesitation, miss clicks, micro-breaks, session tracking

import { Page } from 'playwright';
import { HumanBehavior } from './human-behavior.js';

// =============================================================================
// TYPES & INTERFACES (giữ nguyên từ phiên bản cũ)
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

export type CommentUserInfo = {
    id: string;
    username: string;
    displayName: string;
    isVerified: boolean;
    isGoldVerified: boolean;
    isGreyVerified: boolean;
    followersCount: number;
    followingCount: number;
    tweetCount: number;
    bio?: string;
    location?: string;
    avatarUrl?: string;
    commentText: string;
    commentTimestamp: string;
    commentUrl: string;
    isFollowing: boolean;
    status: 'pending' | 'followed' | 'skipped' | 'blocked';
    upTime: Date;
};

export type ReadTweetFollowOptions = {
    maxComments?: number;
    onlyVerified?: boolean;
    scrollToLoadComments?: boolean;
    maxScrolls?: number;
    timeoutMs?: number;
    follow?: FollowMode;
    followVerified?: boolean;
    extractDetailedInfo?: boolean;
    maxUsersToProcess?: number;
};

export type ReadTweetFollowResult = {
    success: boolean;
    totalComments: number;
    verifiedUsers: CommentUserInfo[];
    followedUsers: string[];
    skippedUsers: string[];
    error?: string;
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
    'home', 'explore', 'notifications', 'messages', 'search', 'settings', 'compose', 'i',
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
// SESSION HUMANIZER - QUẢN LÝ MICRO-BREAKS VÀ THỐNG KÊ HÀNH ĐỘNG
// =============================================================================

class SessionHumanizer {
    private actionCount = 0;
    private lastBreakTime = Date.now();
    private dailyActiveStart = 0;
    private isNightTime = false;

    constructor() {
        // Giả lập thời gian hoạt động trong ngày (8h-22h)
        const hour = new Date().getHours();
        this.isNightTime = hour < 8 || hour > 22;
        this.dailyActiveStart = Date.now();
    }

    /**
     * Gọi trước mỗi hành động tương tác quan trọng (click, scroll, navigate)
     */
    async beforeAction(page: Page, actionName?: string): Promise<void> {
        this.actionCount++;
        // Micro-pause trước mỗi hành động: 100-400ms
        await HumanBehavior.delay(100, 400);

        // Sau mỗi 5-10 hành động, nghỉ giải lao dài
        const interval = Math.floor(Math.random() * 6) + 5; // 5-10
        if (this.actionCount % interval === 0) {
            const breakDuration = this.isNightTime
                ? Math.floor(Math.random() * 90000) + 60000  // 60-150s vào ban đêm
                : Math.floor(Math.random() * 45000) + 15000; // 15-60s ban ngày
            console.log(`🚶 [SessionHumanizer] Taking a micro-break for ${Math.round(breakDuration / 1000)}s (action #${this.actionCount})`);
            await HumanBehavior.delay(breakDuration, breakDuration + 5000);
            this.lastBreakTime = Date.now();
        }

        // Thỉnh thoảng (10%) di chuyển chuột ngẫu nhiên trước khi hành động
        if (Math.random() < 0.1 && actionName !== 'scroll') {
            await HumanBehavior.randomMouseMovement(page);
        }
    }

    reset(): void {
        this.actionCount = 0;
        this.lastBreakTime = Date.now();
    }
}

// Khởi tạo session humanizer toàn cục (dùng chung cho tất cả hành động)
const sessionHumanizer = new SessionHumanizer();

// =============================================================================
// ENHANCED X ACTIONS CLASS
// =============================================================================

export class XActionsEnhanced {
    // ---------------------------------------------------------------------------
    // 1. SMART SCROLL & FEED INTERACTION
    // ---------------------------------------------------------------------------

    /**
     * Smart scroll with random distance and occasional reverse scroll
     * @param page Page object
     * @param minDistance Minimum scroll distance (default: 300)
     * @param maxDistance Maximum scroll distance (default: 1000)
     */
    static async smartScroll(page: Page, minDistance: number = 300, maxDistance: number = 1000): Promise<void> {
        await sessionHumanizer.beforeAction(page, 'scroll');
        const distance = Math.floor(Math.random() * (maxDistance - minDistance + 1) + minDistance);
        await HumanBehavior.scroll(page, distance);

        // 25% chance to scroll back a little (user re-reading)
        if (Math.random() < 0.25) {
            await HumanBehavior.delay(600, 1200);
            const backDistance = -Math.floor(Math.random() * 200) - 50;
            await HumanBehavior.scroll(page, backDistance);
        }
    }

    static async waitForFeed(page: Page, timeout = 15000): Promise<void> {
        await page.waitForSelector(TWEET_SELECTOR, { timeout });
        await sessionHumanizer.beforeAction(page, 'waitForFeed');
        await HumanBehavior.delay(500, 1000);
    }

    /**
     * Scroll feed multiple times with reading pauses
     */
    static async scrollFeedNatural(page: Page, times: number = 2): Promise<void> {
        for (let i = 0; i < times; i++) {
            await this.smartScroll(page);
            // Dừng đọc sau mỗi lần scroll
            const readTime = Math.floor(Math.random() * 3000) + 2000;
            await HumanBehavior.delay(readTime, readTime + 1000);
        }
    }

    // ---------------------------------------------------------------------------
    // 2. CLICK TWEET WITH HESITATION AND MISS CLICK
    // ---------------------------------------------------------------------------

    /**
     * Click tweet by index with human-like hesitation and occasional miss click
     */
    static async clickTweetByIndexBoolean(
        page: Page,
        index = 0,
        humanLike = true,
        randomOffsetPx = 30
    ): Promise<boolean> {
        await this.waitForFeed(page);
        await sessionHumanizer.beforeAction(page, 'clickTweet');

        const tweet = page.locator(TWEET_SELECTOR).nth(index);
        if ((await tweet.count()) === 0) {
            console.log(`Tweet index ${index} not found`);
            return false;
        }

        const tweetLink = tweet.locator('a[href*="/status/"]').first();
        if ((await tweetLink.count()) === 0) {
            console.log(`Tweet index ${index} has no valid link`);
            return false;
        }

        const href = await tweetLink.getAttribute('href');
        console.log(`🔗 Tweet link found: https://x.com${href}`);

        if (humanLike) {
            await tweetLink.scrollIntoViewIfNeeded();
            const viewport = page.viewportSize();
            const box = (await tweetLink.boundingBox()) ?? (await tweet.boundingBox());
            if (box && viewport) {
                const minX = Math.max(2, box.x);
                const maxX = Math.min(viewport.width - 2, box.x + box.width);
                const minY = Math.max(2, box.y);
                const maxY = Math.min(viewport.height - 2, box.y + box.height);
                const hasVisibleArea = maxX > minX && maxY > minY;

                if (hasVisibleArea) {
                    // Random point inside the tweet
                    let clickX = minX + Math.random() * (maxX - minX);
                    let clickY = minY + Math.random() * (maxY - minY);
                    const offsetX = (Math.random() - 0.5) * randomOffsetPx;
                    const offsetY = (Math.random() - 0.5) * randomOffsetPx;
                    clickX = Math.max(minX, Math.min(maxX, clickX + offsetX));
                    clickY = Math.max(minY, Math.min(maxY, clickY + offsetY));

                    // Hesitation: move mouse around before clicking
                    await HumanBehavior.mouseMove(page, clickX - 15, clickY - 10);
                    await HumanBehavior.delay(200, 400);
                    await HumanBehavior.mouseMove(page, clickX + 5, clickY + 5);
                    await HumanBehavior.delay(150, 300);
                    await HumanBehavior.mouseMove(page, clickX, clickY);
                    await HumanBehavior.delay(250, 500);

                    // 5% chance to miss click (click slightly outside)
                    const willMiss = Math.random() < 0.05;
                    if (!willMiss) {
                        await page.mouse.click(clickX, clickY);
                    } else {
                        const missX = clickX + (Math.random() - 0.5) * 60;
                        const missY = clickY + (Math.random() - 0.5) * 40;
                        console.log(`🎯 Miss click at (${missX.toFixed(0)}, ${missY.toFixed(0)})`);
                        await page.mouse.click(missX, missY);
                    }
                } else {
                    await tweetLink.click();
                }
            } else {
                await tweetLink.click();
            }
        } else {
            await tweetLink.click();
        }

        // Wait for navigation or modal
        try {
            await page.waitForURL(/\/status\/\d+/, { timeout: 10000 });
            console.log(`✅ Navigated to tweet detail page`);
        } catch {
            const modal = page.locator('[role="presentation"][aria-modal="true"]');
            if (await modal.count() > 0) {
                console.log(`📱 Tweet opened in modal, closing and retrying...`);
                const closeButton = page.locator('[data-testid="app-bar-close"]').first();
                if (await closeButton.count() > 0) {
                    await closeButton.click();
                    await HumanBehavior.delay(500, 1000);
                }
                await tweetLink.click();
                await page.waitForURL(/\/status\/\d+/, { timeout: 10000 });
            } else {
                console.log(`⚠️ Navigation timeout`);
                return false;
            }
        }

        await HumanBehavior.delay(1500, 2500);
        console.log(`✅ Clicked tweet #${index + 1}`);
        return true;
    }

    static async clickFirstTweet(page: Page, humanLike = true): Promise<boolean> {
        return this.clickTweetByIndexBoolean(page, 0, humanLike);
    }

    // ---------------------------------------------------------------------------
    // 3. LIKE WITH HESITATION AND OCCASIONAL UNDO
    // ---------------------------------------------------------------------------

    static async likeCurrentTweet(
        page: Page,
        options: {
            timeoutMs?: number;
            navigateToHomeOnSuccess?: boolean;
            waitAfterLikeMs?: number;
        } = {}
    ): Promise<boolean> {
        const { timeoutMs = 15000, navigateToHomeOnSuccess = true, waitAfterLikeMs = 1500 } = options;
        await sessionHumanizer.beforeAction(page, 'like');

        try {
            const likeButton = page.locator('[data-testid="like"]').first();
            await likeButton.waitFor({ state: 'visible', timeout: timeoutMs });

            const initialLabel = await likeButton.getAttribute('aria-label');
            const wasLiked = initialLabel?.includes('Unlike') ?? false;
            if (wasLiked) {
                console.log('✅ Tweet already liked');
                if (navigateToHomeOnSuccess) await this.goToHome(page);
                return true;
            }

            // Hesitation: hover over like button, move away, come back
            const box = await likeButton.boundingBox();
            if (box) {
                const centerX = box.x + box.width / 2;
                const centerY = box.y + box.height / 2;
                await HumanBehavior.mouseMove(page, centerX - 30, centerY);
                await HumanBehavior.delay(200, 400);
                await HumanBehavior.mouseMove(page, centerX + 20, centerY - 10);
                await HumanBehavior.delay(300, 600);
                await HumanBehavior.mouseMove(page, centerX, centerY);
                await HumanBehavior.delay(250, 500);
            }

            // Click like
            await HumanBehavior.clickLikeHuman(page, '[data-testid="like"]');
            console.log('[likeCurrentTweet] Clicked like button');

            // Wait for API response
            const likeResponse = page.waitForResponse(
                (resp) => resp.url().includes('/like') && resp.status() === 200,
                { timeout: 5000 }
            ).catch(() => null);
            const response = await likeResponse;

            let success = false;
            if (response) {
                console.log('❤️ Like API confirmed');
                await HumanBehavior.delay(300, 500);
                success = true;
            } else {
                await HumanBehavior.delay(1000, 1500);
                const finalLabel = await likeButton.getAttribute('aria-label');
                success = finalLabel?.includes('Unlike') ?? false;
                if (success) console.log('❤️ Liked tweet (UI confirmed)');
                else console.warn('⚠️ Like may have failed');
            }

            // 5% chance to unlike immediately (human hesitation)
            if (success && Math.random() < 0.05) {
                await HumanBehavior.delay(800, 1500);
                await HumanBehavior.clickLikeHuman(page, '[data-testid="like"]');
                console.log('🤷‍♂️ Unliked immediately - human hesitation');
                success = false;
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

    // ---------------------------------------------------------------------------
    // 4. FOLLOW WITH CONFIRMATION AND NATURAL DELAYS
    // ---------------------------------------------------------------------------

    static async toggleFollowOnProfile(
        page: Page,
        options?: {
            action?: ToggleFollowAction;
            waitAfterClickMs?: number;
            confirmAction?: boolean;
        }
    ): Promise<ToggleFollowResult> {
        const waitAfterClickMs = options?.waitAfterClickMs ?? 1200;
        const confirmAction = options?.confirmAction ?? true;
        await sessionHumanizer.beforeAction(page, 'follow');

        try {
            const username = await this.extractUsernameFromProfile(page);
            if (!username) {
                return { success: false, action: 'none', error: 'Could not extract username' };
            }

            const buttonInfo = await this.findFollowButton(page, username);
            if (!buttonInfo) {
                return { success: false, action: 'none', username, error: 'No follow button found' };
            }

            const { button, currentState, buttonText } = buttonInfo;
            console.log(`[toggle-follow] @${username}: state=${currentState}, text="${buttonText}"`);

            if (currentState === 'blocked') {
                return { success: false, action: 'none', username, error: 'User is blocked' };
            }

            const actionToTake = options?.action ?? (currentState === 'following' ? 'unfollow' : 'follow');
            if (
                (actionToTake === 'follow' && currentState === 'following') ||
                (actionToTake === 'unfollow' && currentState === 'not-following')
            ) {
                return { success: true, action: 'none', username };
            }

            // Hover before click
            await button.hover();
            await HumanBehavior.delay(300, 600);

            if (actionToTake === 'unfollow') {
                await button.click();
                await page.waitForTimeout(500);
                const confirmed = await this.handleUnfollowConfirmation(page);
                if (!confirmed) {
                    return { success: false, action: 'unfollow', username, error: 'Unfollow confirmation failed' };
                }
            } else {
                await button.click();
            }

            await page.waitForTimeout(waitAfterClickMs);

            if (confirmAction) {
                const newState = await this.checkFollowState(page, username);
                const expectedState = actionToTake === 'follow' ? 'following' : 'not-following';
                if (newState !== expectedState) {
                    return { success: false, action: actionToTake, username, error: `State mismatch: expected ${expectedState}, got ${newState}` };
                }
            }

            return { success: true, action: actionToTake, username };
        } catch (error) {
            return { success: false, action: 'none', error: error instanceof Error ? error.message : String(error) };
        }
    }

    static async followUser(page: Page, username: string): Promise<boolean> {
        const normalized = normalizeUsername(username);
        await this.goToProfile(page, normalized);
        const result = await this.toggleFollowOnProfile(page, { action: 'follow', waitAfterClickMs: 1200, confirmAction: true });
        return result.success && (result.action === 'follow' || result.action === 'none');
    }

    // ---------------------------------------------------------------------------
    // 5. NAVIGATION WITH NATURAL BEHAVIOR (scroll before leaving)
    // ---------------------------------------------------------------------------

    static async goToProfile(page: Page, username: string): Promise<void> {
        const normalized = normalizeUsername(username);
        const currentUrl = page.url();
        if (currentUrl.includes(`/x.com/${normalized}`) || currentUrl.includes(`/twitter.com/${normalized}`)) {
            // Already on profile, maybe reload
            if (Math.random() < 0.1) {
                await page.reload({ waitUntil: 'domcontentloaded' });
                await HumanBehavior.delay(1000, 2000);
            }
            return;
        }

        // Scroll to top before leaving (human behavior)
        await page.evaluate(() => window.scrollTo(0, 0));
        await HumanBehavior.delay(300, 600);

        await page.goto(`https://x.com/${normalized}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-testid="UserName"]', { timeout: 10000 });
        // Simulate reading profile
        const readTime = Math.floor(Math.random() * 2000) + 1000;
        await HumanBehavior.delay(readTime, readTime + 500);
    }

    static async goToHome(page: Page): Promise<void> {
        await sessionHumanizer.beforeAction(page, 'navigate');
        await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
        await this.waitForFeed(page);
        await HumanBehavior.delay(1500, 2500);
        console.log('Navigated to Home');
    }

    static async goBack(page: Page): Promise<void> {
        await sessionHumanizer.beforeAction(page, 'navigate');
        await page.goBack({ waitUntil: 'domcontentloaded' });
        await HumanBehavior.delay(1000, 1500);
    }

    // ---------------------------------------------------------------------------
    // 6. ENHANCED readTweetFollow WITH RANDOMIZED ORDER AND MICRO-BREAKS
    // ---------------------------------------------------------------------------

    static async readTweetFollow(
        page: Page,
        options: ReadTweetFollowOptions = {}
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
        } = options;
        const followMode: FollowMode = follow ?? (followVerified ? 'yes' : 'no');
        const shouldFollow = followMode === 'yes';

        try {
            const tweetUrl = page.url();
            if (!/\/status\/\d+/.test(tweetUrl)) {
                return { success: false, totalComments: 0, verifiedUsers: [], followedUsers: [], skippedUsers: [], error: 'Not a tweet detail URL' };
            }

            if (scrollToLoadComments) {
                let previousCount = 0;
                for (let i = 0; i < maxScrolls; i++) {
                    const currentCount = await page.$$eval(TWEET_SELECTOR, els => els.length);
                    if (currentCount === previousCount && i > 0) break;
                    previousCount = currentCount;
                    await this.smartScroll(page);
                    // Pause to read comments
                    const pause = Math.floor(Math.random() * 2500) + 1500;
                    await HumanBehavior.delay(pause, pause + 500);
                    // Occasionally hover a random comment
                    if (Math.random() < 0.1) {
                        const randomIndex = Math.floor(Math.random() * Math.min(5, currentCount)) + 1;
                        const randomComment = page.locator(TWEET_SELECTOR).nth(randomIndex);
                        await randomComment.hover();
                        await HumanBehavior.delay(800, 1500);
                    }
                }
            }

            // Extract basic user info
            const users = await page.evaluate((max) => {
                const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
                const replies = articles.slice(1, max + 1);
                return replies.map((article, idx) => {
                    let username = '';
                    const userNameLink = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
                    if (userNameLink) {
                        const href = userNameLink.getAttribute('href');
                        if (href && href.length > 1) username = href.split('/')[1]?.split('?')[0] ?? '';
                    }
                    if (!username) {
                        const avatarLink = article.querySelector('[data-testid="Tweet-User-Avatar"] a[href^="/"]');
                        const href = avatarLink?.getAttribute('href');
                        if (href && href.length > 1) username = href.split('/')[1]?.split('?')[0] ?? '';
                    }
                    if (!username) {
                        const anyUserLink = article.querySelector('a[href^="/"]:not([href*="/status/"])');
                        const href = anyUserLink?.getAttribute('href');
                        if (href && href.length > 1) username = href.substring(1).split('/')[0] ?? '';
                    }
                    const displayName = article.querySelector('[data-testid="User-Name"] a span span')?.textContent?.trim() ?? username;
                    const commentText = article.querySelector('[data-testid="tweetText"]')?.textContent?.trim() ?? '';
                    const commentTimestamp = article.querySelector('time')?.getAttribute('datetime') ?? new Date().toISOString();
                    const commentPath = article.querySelector('a[href*="/status/"]')?.getAttribute('href') ?? '';
                    const avatarUrl = article.querySelector<HTMLImageElement>('[data-testid="Tweet-User-Avatar"] img')?.src;
                    const isVerified = Boolean(article.querySelector('[data-testid="icon-verified"]'));
                    const isGoldVerified = Boolean(article.querySelector('[data-testid="icon-verified-gold"]'));
                    const isGreyVerified = Boolean(article.querySelector('[data-testid="icon-verified-grey"]'));
                    const id = `${username || 'unknown'}_${idx}_${commentTimestamp}`;
                    return {
                        id, username, displayName, isVerified, isGoldVerified, isGreyVerified,
                        followersCount: 0, followingCount: 0, tweetCount: 0,
                        commentText, commentTimestamp, commentUrl: commentPath ? `https://x.com${commentPath}` : '',
                        isFollowing: false, status: 'pending' as const, upTime: new Date(),
                        ...(avatarUrl ? { avatarUrl } : {}),
                    };
                });
            }, maxComments);

            // Deduplicate
            const uniqueMap = new Map<string, CommentUserInfo>();
            for (const user of users) if (user.username) uniqueMap.set(user.username, user);
            const allUsers = Array.from(uniqueMap.values());
            const verifiedUsers = allUsers.filter(u => u.isVerified || u.isGoldVerified || u.isGreyVerified);
            let selectedUsers = onlyVerified ? verifiedUsers : allUsers;

            // Shuffle users for natural processing order
            for (let i = selectedUsers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [selectedUsers[i], selectedUsers[j]] = [selectedUsers[j], selectedUsers[i]];
            }

            let enrichedUsers = selectedUsers;
            if (extractDetailedInfo) {
                const limit = Math.min(maxUsersToProcess, selectedUsers.length);
                const toProcess = selectedUsers.slice(0, limit);
                enrichedUsers = [];
                for (const user of toProcess) {
                    try {
                        await this.goToProfile(page, user.username);
                        const profile = await this.getUserProfile(page, user.username);
                        const parseCount = (val: string): number => {
                            const cleaned = val.replace(/,/g, '').trim();
                            const match = cleaned.match(/([\d.]+)\s*([KMB])?/i);
                            if (!match) return 0;
                            let num = parseFloat(match[1]);
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
                            bio: profile?.bio,
                            location: profile?.location,
                            avatarUrl: profile?.avatarUrl ?? user.avatarUrl,
                        });
                    } catch (err) {
                        enrichedUsers.push(user);
                    }
                    await HumanBehavior.delay(2000, 4000);
                }
                await page.goto(tweetUrl, { waitUntil: 'domcontentloaded' });
                await HumanBehavior.delay(1500, 2500);
            }

            const followedUsers: string[] = [];
            const skippedUsers: string[] = [];
            if (shouldFollow) {
                for (const user of enrichedUsers) {
                    if (!user.username) {
                        skippedUsers.push('unknown');
                        continue;
                    }
                    try {
                        await this.goToProfile(page, user.username);
                        const toggleResult = await this.toggleFollowOnProfile(page, { action: 'follow', waitAfterClickMs: 1200, confirmAction: true });
                        if (toggleResult.success && (toggleResult.action === 'follow' || toggleResult.action === 'none')) {
                            followedUsers.push(user.username);
                            user.isFollowing = true;
                            user.status = 'followed';
                            console.log(`[follow] Followed @${user.username}`);
                        } else {
                            skippedUsers.push(user.username);
                            user.status = toggleResult.error?.includes('blocked') ? 'blocked' : 'skipped';
                            console.log(`[follow] Skipped @${user.username}: ${toggleResult.error ?? 'unknown'}`);
                        }
                    } catch {
                        skippedUsers.push(user.username);
                        user.status = 'skipped';
                    }
                    // Longer delay between follows: 2-5 seconds
                    await HumanBehavior.delay(2000, 5000);
                }
                if (page.url() !== tweetUrl) {
                    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded' });
                    await HumanBehavior.delay(1500, 2500);
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

    // ---------------------------------------------------------------------------
    // 7. PROFILE UTILITIES (giữ nguyên từ bản cũ)
    // ---------------------------------------------------------------------------

    static async getUserProfile(page: Page, username: string): Promise<UserProfileInfo | null> {
        const normalized = normalizeUsername(username);
        await this.goToProfile(page, normalized);
        return page.evaluate((currentUsername) => {
            const displayName = document.querySelector('[data-testid="UserName"] span')?.textContent ?? '';
            const bioEl = document.querySelector('[data-testid="UserDescription"]');
            const locationEl = document.querySelector('[data-testid="UserLocation"]');
            const websiteEl = document.querySelector('[data-testid="UserUrl"]');
            const joinDateEl = document.querySelector('[data-testid="UserJoinDate"]');
            const statsText = Array.from(document.querySelectorAll('[data-testid="UserStats"]')).map(el => el.textContent ?? '');
            const avatarUrl = document.querySelector<HTMLImageElement>('img[alt][src*="profile_images"]')?.src;
            const bannerUrl = document.querySelector<HTMLImageElement>('img[src*="profile_banners"]')?.src;
            return {
                displayName,
                username: currentUsername,
                bio: bioEl?.textContent ?? '',
                location: locationEl?.textContent ?? '',
                website: websiteEl?.textContent ?? '',
                joinDate: joinDateEl?.textContent ?? '',
                followersCount: statsText.find(t => t.includes('Followers')) ?? '0',
                followingCount: statsText.find(t => t.includes('Following')) ?? '0',
                tweetsCount: statsText.find(t => t.includes('Posts')) ?? '0',
                isVerified: Boolean(document.querySelector('[data-testid="icon-verified"]')),
                ...(avatarUrl && { avatarUrl }),
                ...(bannerUrl && { bannerUrl }),
            };
        }, normalized);
    }

    static async extractUsernameFromProfile(page: Page): Promise<string | null> {
        return page.evaluate((reserved) => {
            const userNameSection = document.querySelector('[data-testid="UserName"]');
            if (userNameSection) {
                const spans = userNameSection.querySelectorAll('span');
                for (const span of Array.from(spans)) {
                    const text = span.textContent?.trim();
                    if (text && text.startsWith('@') && text.length > 1) return text.replace('@', '');
                }
            }
            const heading = document.querySelector('[data-testid="UserName"] span.css-1jxf684');
            if (heading) {
                const text = heading.textContent?.trim();
                if (text && text.startsWith('@') && text.length > 1) return text.replace('@', '');
            }
            const path = window.location.pathname.split('/')[1]?.trim() ?? '';
            if (path && !reserved.includes(path.toLowerCase())) return path;
            return null;
        }, Array.from(RESERVED_X_PATH_SEGMENTS));
    }

    private static async findFollowButton(page: Page, username: string): Promise<FollowButtonInfo | null> {
        try {
            const selection = await page.evaluate((rawUsername) => {
                const normalized = rawUsername.trim().replace(/^@/, '').toLowerCase();
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
                    const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                    if (!isVisible) continue;
                    const testId = button.getAttribute('data-testid') ?? '';
                    const ariaLabel = (button.getAttribute('aria-label') ?? '').trim();
                    const buttonText = button.querySelector('span')?.textContent?.trim() ?? button.textContent?.trim() ?? '';
                    const lowerText = buttonText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const lowerAria = ariaLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const top = rect.top;
                    let score = 0;
                    let currentState: Exclude<FollowState, 'unknown'> = 'unknown';
                    if (testId.endsWith('-unfollow')) { currentState = 'following'; score += 90; }
                    else if (testId.endsWith('-follow')) { currentState = 'not-following'; score += 90; }
                    else if (testId.endsWith('-blocked')) { currentState = 'blocked'; score += 90; }
                    if (lowerAria.includes(`@${normalized}`)) score += 60;
                    if (lowerAria.includes('following @') || lowerAria.includes('dang theo doi @')) { currentState = 'following'; score += 50; }
                    else if (lowerAria.includes('follow @') || lowerAria.includes('theo doi @') || lowerAria.includes('follow back @')) { currentState = 'not-following'; score += 50; }
                    for (const term of followingTerms) if (lowerText === term) { currentState = 'following'; score += 30; break; }
                    if (currentState === 'unknown') for (const term of followTerms) if (lowerText === term) { currentState = 'not-following'; score += 30; break; }
                    if (currentState === 'unknown') for (const term of blockedTerms) if (lowerText.includes(term)) { currentState = 'blocked'; score += 30; break; }
                    if (button.closest('[data-testid="userActions"]')) score += 120;
                    if (top > 0 && top < 700) score += 10;
                    if (currentState === 'unknown') continue;
                    const candidate: FollowCandidate = { currentState, buttonText: buttonText || currentState, testId, ariaLabel, score, top };
                    if (!winner || candidate.score > winner.score || (candidate.score === winner.score && candidate.top < winner.top)) winner = candidate;
                }
                return winner;
            }, username);
            if (!selection) return null;
            let button = selection.testId.length
                ? page.locator(`button[role="button"][data-testid="${selection.testId}"]`).first()
                : page.locator('button[role="button"]').filter({ hasText: selection.buttonText }).first();
            let visible = await button.isVisible({ timeout: 2000 }).catch(() => false);
            if (!visible && selection.ariaLabel.length) {
                button = page.locator(`button[role="button"][aria-label="${selection.ariaLabel.replace(/"/g, '\\"')}"]`).first();
                visible = await button.isVisible({ timeout: 2000 }).catch(() => false);
            }
            if (!visible) return null;
            return { button, currentState: selection.currentState, buttonText: selection.buttonText };
        } catch {
            return null;
        }
    }

    private static async handleUnfollowConfirmation(page: Page): Promise<boolean> {
        try {
            const confirm = page.locator('[data-testid="confirmationSheetConfirm"]').first();
            if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) {
                await confirm.click();
                await page.waitForTimeout(500);
                return true;
            }
            const unfollow = page.getByRole('button', { name: /^Unfollow$/i }).first();
            if (await unfollow.isVisible({ timeout: 2000 }).catch(() => false)) {
                await unfollow.click();
                await page.waitForTimeout(500);
                return true;
            }
            return true;
        } catch {
            return false;
        }
    }

    static async checkFollowState(page: Page, username?: string): Promise<FollowState> {
        const detected = username ?? (await this.extractUsernameFromProfile(page)) ?? '';
        const info = await this.findFollowButton(page, detected);
        return info?.currentState ?? 'unknown';
    }

    // ---------------------------------------------------------------------------
    // 8. OTHER UTILITIES (giữ nguyên)
    // ---------------------------------------------------------------------------

    static async getAllTweets(page: Page, maxTweets = 20): Promise<TweetInfo[]> {
        await this.waitForFeed(page);
        return page.evaluate((max) => {
            return Array.from(document.querySelectorAll('article[data-testid="tweet"]'))
                .slice(0, max)
                .map(article => {
                    const textEl = article.querySelector('[data-testid="tweetText"]');
                    const authorNameEl = article.querySelector('[data-testid="User-Name"] a span span');
                    const authorUsernameEl = article.querySelector('[data-testid="User-Name"] a[href*="/"]:last-child span');
                    const tweetLink = article.querySelector('a[href*="/status/"]')?.getAttribute('href');
                    const timeEl = article.querySelector('time');
                    const statsGroup = article.querySelector('div[role="group"][aria-label]');
                    const ariaLabel = statsGroup?.getAttribute('aria-label') ?? '';
                    const text = textEl?.textContent ?? '';
                    const parseStat = (label: string, name: string): string => {
                        const match = label.match(new RegExp(`(\\d+(?:,\\d+)*(?:\\.\\d+)?[KkM]?)\\s*${name}`));
                        return match?.[1] ?? '0';
                    };
                    return {
                        text, tweetText: text,
                        authorName: authorNameEl?.textContent ?? '',
                        authorUsername: authorUsernameEl?.textContent?.replace('@', '') ?? '',
                        tweetUrl: tweetLink ? `https://x.com${tweetLink}` : '',
                        timestamp: timeEl?.getAttribute('datetime') ?? '',
                        likes: parseStat(ariaLabel, 'likes?'),
                        retweets: parseStat(ariaLabel, 'reposts?'),
                        replies: parseStat(ariaLabel, 'replies?'),
                        views: parseStat(ariaLabel, 'views?'),
                        isVerified: Boolean(article.querySelector('[data-testid="icon-verified"]')),
                        mediaUrls: Array.from(article.querySelectorAll<HTMLImageElement>('img[src]')).map(img => img.src),
                    };
                });
        }, maxTweets);
    }

    static async getTweetMediaType(page: Page, tweetIndex = 0): Promise<'none' | 'image' | 'video' | 'mixed'> {
        const tweet = page.locator(TWEET_SELECTOR).nth(tweetIndex);
        const hasImage = await tweet.locator('[data-testid="tweetPhoto"]').count() > 0;
        const hasVideo = await tweet.locator('video').count() > 0;
        if (hasImage && hasVideo) return 'mixed';
        if (hasImage) return 'image';
        if (hasVideo) return 'video';
        return 'none';
    }

    static async screenshot(page: Page, name = 'screenshot'): Promise<void> {
        const path = `${name}-${Date.now()}.png`;
        await page.screenshot({ path, fullPage: false });
        console.log(`Screenshot saved: ${path}`);
    }

    static async isLoggedIn(page: Page): Promise<boolean> {
        if (page.url().includes('/login')) return false;
        const hasHomeFeed = (await page.locator(TWEET_SELECTOR).count()) > 0;
        const hasProfileIcon = (await page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').count()) > 0;
        return hasHomeFeed || hasProfileIcon;
    }
}

export default XActionsEnhanced;