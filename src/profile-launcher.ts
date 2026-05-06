// FILE: src/profile-launcher.ts
// COMPLETE INTEGRATION WITH X ACTIONS - FIXED VERSION

import 'dotenv/config';
import { HumanBehavior } from './human-behavior.js';
import { ProfileManagerWithSQLite } from './profile-manager-with-sqlite.js';
import XActions from './x-actions.js';

import { pathToFileURL } from 'node:url';
import * as fs from 'fs';

import type { Page } from '@playwright/test';
import type { XProfileData } from './sqlite-profile-storage.js';
import type { FeedTab, FollowMode } from './x-actions.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_PROFILE_ID = 'profile_01_id';
const DEFAULT_TARGET_URL = 'https://x.com';
const DEFAULT_DB_PATH = './x_profiles.db';
const LOGIN_DETECTION_TIMEOUT_MS = 120_000;
const DEFAULT_SCHEDULE_INTERVAL_MINUTES = 30;

// =============================================================================
// TYPES
// =============================================================================

type LauncherArgs = {
  profileId: string;
  targetUrl: string;
  feedTab: FeedTab;
  follow: FollowMode;
  keepOpen: boolean;
  demoActions: boolean;
  demoSearch: boolean;
  dryRun: boolean;
  likeCurrentTweet: boolean;
  readComments: boolean;
  followVerifiedUsers: boolean;
  maxComments: number;
  extractDetailedInfo: boolean;
  maxUsersToProcess: number;
  extractTweetInfo: boolean;
  clickRandomOnText: boolean;
  screenshotBeforeClick: boolean;
  replyText: string | undefined;
  replyLike: boolean;
  replyStay: boolean;
  replyMaxLength: number;
  replyTimeoutMs: number;
  autoReplyMode: 'template' | 'ai' | 'hybrid';
  autoReplyTemplate: string;
  deepseekKey: string;
  deepseekModel: string;
  likeBeforeReply: boolean;
  minTweetLength: number;
  scheduleLoop: boolean;
  scheduleIntervalMinutes: number;
  scheduleMaxRuns: number | undefined;
};

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

function parseArgs(argv: string[]): LauncherArgs {
  const positionalArgs = collectPositionalArgs(argv);
  const followVerifiedUsers = argv.includes('--follow-verified-users');

  return {
    profileId: positionalArgs[0] ?? DEFAULT_PROFILE_ID,
    targetUrl: normalizeUrl(positionalArgs[1] ?? DEFAULT_TARGET_URL),
    feedTab: parseFeedTab(argv),
    follow: parseFollowMode(argv, followVerifiedUsers),
    keepOpen: argv.includes('--keep-open'),
    demoActions: argv.includes('--demo-actions'),
    demoSearch: argv.includes('--demo-search'),
    dryRun: argv.includes('--dry-run'),
    likeCurrentTweet: argv.includes('--like-current-tweet'),
    readComments: argv.includes('--read-comments'),
    followVerifiedUsers,
    maxComments: parseMaxComments(argv),
    extractDetailedInfo: argv.includes('--extract-detailed-info'),
    maxUsersToProcess: parseMaxUsersToProcess(argv),
    extractTweetInfo: argv.includes('--extract-tweet-info'),
    clickRandomOnText: argv.includes('--click-random-text'),
    screenshotBeforeClick: argv.includes('--screenshot'),
    replyText: parseReplyText(argv),
    replyLike: argv.includes('--reply-like'),
    replyStay: argv.includes('--reply-stay'),
    replyMaxLength: parseReplyMaxLength(argv),
    replyTimeoutMs: parseReplyTimeoutMs(argv),
    autoReplyMode: parseAutoReplyMode(argv),
    autoReplyTemplate: parseStringArg(argv, '--auto-reply-template', './reply-templates.txt'),
    deepseekKey: parseStringArg(argv, '--deepseek-key', process.env.DEEPSEEK_API_KEY ?? ''),
    deepseekModel: parseStringArg(argv, '--deepseek-model', 'deepseek-chat'),
    likeBeforeReply: argv.includes('--like-before-reply'),
    minTweetLength: parseMinTweetLength(argv),
    scheduleLoop: argv.includes('--schedule-loop'),
    scheduleIntervalMinutes: parseScheduleIntervalMinutes(argv),
    scheduleMaxRuns: parseScheduleMaxRuns(argv),
  };
}

function collectPositionalArgs(argv: string[]): string[] {
  const flagsWithValues = new Set([
    '--max-comments',
    '--max-users-to-process',
    '--feed-tab',
    '--follow',
    '--reply-text',
    '--reply-max-length',
    '--reply-timeout-ms',
    '--auto-reply-mode',
    '--auto-reply-template',
    '--deepseek-key',
    '--deepseek-model',
    '--min-tweet-length',
    '--schedule-interval-minutes',
    '--schedule-max-runs',
  ]);
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (flagsWithValues.has(arg)) {
      index += 1;
      continue;
    }

    if (arg.startsWith('--')) continue;
    positional.push(arg);
  }

  return positional;
}

function parseFeedTab(argv: string[]): FeedTab {
  const flagIndex = argv.findIndex((arg) => arg === '--feed-tab');
  if (flagIndex === -1) return 'for-you';

  const raw = argv[flagIndex + 1]?.trim().toLowerCase();
  if (raw === 'following') return 'following';
  return 'for-you';
}

function parseFollowMode(argv: string[], fallbackFollowVerified: boolean): FollowMode {
  const flagIndex = argv.findIndex((arg) => arg === '--follow');
  if (flagIndex === -1) return fallbackFollowVerified ? 'yes' : 'no';

  const raw = argv[flagIndex + 1]?.trim().toLowerCase();
  return raw === 'yes' ? 'yes' : 'no';
}

function parseMaxComments(argv: string[]): number {
  const flagIndex = argv.findIndex((arg) => arg === '--max-comments');
  if (flagIndex === -1) return 50;

  const raw = argv[flagIndex + 1];
  if (!raw) return 50;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}

function parseMaxUsersToProcess(argv: string[]): number {
  const flagIndex = argv.findIndex((arg) => arg === '--max-users-to-process');
  if (flagIndex === -1) return 20;

  const raw = argv[flagIndex + 1];
  if (!raw) return 20;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

function parseReplyText(argv: string[]): string | undefined {
  const flagIndex = argv.findIndex((arg) => arg === '--reply-text');
  if (flagIndex === -1) return undefined;
  const raw = argv[flagIndex + 1]?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

function parseReplyMaxLength(argv: string[]): number {
  const flagIndex = argv.findIndex((arg) => arg === '--reply-max-length');
  if (flagIndex === -1) return 280;
  const raw = argv[flagIndex + 1];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 280;
}

function parseReplyTimeoutMs(argv: string[]): number {
  const flagIndex = argv.findIndex((arg) => arg === '--reply-timeout-ms');
  if (flagIndex === -1) return 15000;
  const raw = argv[flagIndex + 1];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
}

function parseAutoReplyMode(argv: string[]): 'template' | 'ai' | 'hybrid' {
  const idx = argv.findIndex((arg) => arg === '--auto-reply-mode');
  if (idx === -1) return 'template';
  const raw = argv[idx + 1]?.trim().toLowerCase();
  if (raw === 'ai' || raw === 'hybrid') return raw;
  return 'template';
}

function parseStringArg(argv: string[], flag: string, defaultValue: string): string {
  const idx = argv.findIndex((arg) => arg === flag);
  if (idx === -1) return defaultValue;
  const raw = argv[idx + 1];
  return raw && raw.trim().length > 0 ? raw : defaultValue;
}

function parseMinTweetLength(argv: string[]): number {
  const idx = argv.findIndex((arg) => arg === '--min-tweet-length');
  if (idx === -1) return 5;
  const raw = argv[idx + 1];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

function parseScheduleIntervalMinutes(argv: string[]): number {
  const idx = argv.findIndex((arg) => arg === '--schedule-interval-minutes');
  if (idx === -1) return DEFAULT_SCHEDULE_INTERVAL_MINUTES;
  const raw = argv[idx + 1];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SCHEDULE_INTERVAL_MINUTES;
}

function parseScheduleMaxRuns(argv: string[]): number | undefined {
  const idx = argv.findIndex((arg) => arg === '--schedule-max-runs');
  if (idx === -1) return undefined;
  const raw = argv[idx + 1];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const repaired =
    trimmed.startsWith('https:/') && !trimmed.startsWith('https://')
      ? trimmed.replace('https:/', 'https://')
      : trimmed;

  return new URL(repaired).toString();
}

function randomInt(min: number, max: number): number {
  const safeMin = Math.ceil(min);
  const safeMax = Math.floor(max);
  if (safeMax <= safeMin) return safeMin;
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function chance(probability: number): boolean {
  if (probability <= 0) return false;
  if (probability >= 1) return true;
  return Math.random() < probability;
}

function normalizeReplyText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildCycleArgsForSchedule(baseArgs: LauncherArgs): LauncherArgs {
  const cycleArgs: LauncherArgs = { ...baseArgs };

  cycleArgs.feedTab =
    chance(0.82) ? baseArgs.feedTab : baseArgs.feedTab === 'following' ? 'for-you' : 'following';
  cycleArgs.follow = baseArgs.follow === 'yes' ? (chance(0.88) ? 'yes' : 'no') : 'no';
  cycleArgs.readComments = baseArgs.readComments ? chance(0.92) : chance(0.25);
  cycleArgs.followVerifiedUsers =
    cycleArgs.readComments && baseArgs.followVerifiedUsers ? chance(0.86) : false;

  const maxCommentsMin = Math.max(10, Math.floor(baseArgs.maxComments * 0.55));
  cycleArgs.maxComments = randomInt(maxCommentsMin, Math.max(maxCommentsMin, baseArgs.maxComments));

  const maxUsersMin = Math.max(5, Math.floor(baseArgs.maxUsersToProcess * 0.5));
  cycleArgs.maxUsersToProcess = randomInt(
    maxUsersMin,
    Math.max(maxUsersMin, baseArgs.maxUsersToProcess),
  );

  cycleArgs.likeCurrentTweet = baseArgs.likeCurrentTweet ? chance(0.9) : chance(0.2);

  const baseReplyText = baseArgs.replyText?.trim() ?? '';
  const autoReplyEnabled = baseReplyText.toLowerCase() === 'auto';
  const shouldReplyThisRun = autoReplyEnabled ? chance(0.8) : baseReplyText.length > 0;
  cycleArgs.replyText = shouldReplyThisRun ? baseArgs.replyText : undefined;

  cycleArgs.replyStay = shouldReplyThisRun ? chance(0.1) : false;
  cycleArgs.replyMaxLength = randomInt(160, Math.max(160, baseArgs.replyMaxLength));
  cycleArgs.replyTimeoutMs = randomInt(12000, Math.max(12000, baseArgs.replyTimeoutMs + 8000));
  cycleArgs.likeBeforeReply = shouldReplyThisRun ? chance(0.16) : false;
  cycleArgs.minTweetLength = randomInt(baseArgs.minTweetLength, Math.max(18, baseArgs.minTweetLength + 12));

  if (!cycleArgs.readComments && !cycleArgs.likeCurrentTweet && !cycleArgs.replyText) {
    cycleArgs.likeCurrentTweet = true;
  }

  return cycleArgs;
}

function logCycleOptions(runCount: number, args: LauncherArgs): void {
  console.log(`[schedule] Effective options for run #${runCount}:`);
  console.log(
    `  feedTab=${args.feedTab}, follow=${args.follow}, readComments=${args.readComments}, followVerifiedUsers=${args.followVerifiedUsers}`,
  );
  console.log(
    `  maxComments=${args.maxComments}, maxUsersToProcess=${args.maxUsersToProcess}, likeCurrentTweet=${args.likeCurrentTweet}`,
  );
  console.log(
    `  replyText=${args.replyText ?? '(none)'}, replyStay=${args.replyStay}, likeBeforeReply=${args.likeBeforeReply}, minTweetLength=${args.minTweetLength}`,
  );
}

function isXUrl(targetUrl: string): boolean {
  const hostname = new URL(targetUrl).hostname.toLowerCase();
  return hostname === 'x.com' || hostname.endsWith('.x.com') || hostname === 'twitter.com';
}

function isDirectRun(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href;
}

async function waitForFeedSafe(page: Page, timeout = 10000): Promise<boolean> {
  try {
    await XActions.waitForFeed(page, timeout);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// HUMAN BEHAVIOR WARMUP
// =============================================================================

async function runHumanBehaviorWarmup(page: Page): Promise<void> {
  console.log('🎭 Running human-like warmup actions...');

  await HumanBehavior.delay(800, 1500);
  await HumanBehavior.randomMouseMovement(page);
  await HumanBehavior.delay(300, 700);
  await HumanBehavior.randomMouseMovement(page);
  await HumanBehavior.scroll(page, 500);
  await HumanBehavior.delay(500, 900);
  await HumanBehavior.scroll(page, -250);

  console.log('✅ Human-like warmup actions completed.');
}

// =============================================================================
// LOGIN & PROFILE CAPTURE
// =============================================================================

async function waitForXLoginIfNeeded(
  page: Page,
  storedProfile: XProfileData | undefined,
): Promise<void> {
  if (storedProfile) {
    console.log(`📱 Found saved X profile in SQLite: @${storedProfile.username}`);
    return;
  }

  console.log('🔐 No saved X profile found in SQLite.');
  console.log('📝 If X asks for login, please log in manually in the browser window.');

  try {
    await page.waitForURL('**/home', { timeout: LOGIN_DETECTION_TIMEOUT_MS });
    console.log('✅ Login successful, on home page.');
  } catch {
    console.log('⏰ Login wait timed out. Continuing with current page.');
  }
}

async function captureXProfileIfApplicable(
  manager: ProfileManagerWithSQLite,
  page: Page,
  profileId: string,
  targetUrl: string,
): Promise<void> {
  if (!isXUrl(targetUrl)) return;

  const storedProfile = manager.getStoredProfile(profileId);
  await waitForXLoginIfNeeded(page, storedProfile);
  await HumanBehavior.delay(1500, 2500);

  const savedProfile = await manager.extractXProfileFromPage(page, profileId);
  if (!savedProfile) {
    console.log('⚠️ Could not save X profile to SQLite from the current page.');
    return;
  }

  console.log('💾 Saved X profile to SQLite:');
  console.log(`   Username: @${savedProfile.username}`);
  console.log(`   Display name: ${savedProfile.displayName}`);
  console.log(`   Cookies: ${savedProfile.cookies.length}`);
  console.log(`   Database: ${manager.getStorage().getDatabasePath()}`);
}

// =============================================================================
// ENHANCED DEMO ACTIONS WITH NEW FEATURES
// =============================================================================

async function demoXActionsEnhanced(page: Page, profileUsername?: string): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 STARTING ENHANCED X ACTIONS DEMO');
  console.log('='.repeat(60));

  // Step 1: Navigate to Home
  console.log('\n📌 Step 1: Navigating to Home feed...');
  await XActions.goToHome(page);
  
  const feedLoaded = await waitForFeedSafe(page, 10000);
  if (!feedLoaded) {
    console.log('❌ Feed did not load. Skipping demo.');
    return;
  }

  // Step 2: Get first tweet info (ENHANCED - with images)
  console.log('\n📌 Step 2: Getting first tweet info with media...');
  const fullTweetInfo = await XActions.extractFullTweetInfo(page, 0);
  if (fullTweetInfo) {
    console.log(`   👤 Author: @${fullTweetInfo.authorUsername}`);
    console.log(`   💬 Text: ${fullTweetInfo.text.substring(0, 100)}...`);
    console.log(`   🖼️ Media type: ${await XActions.getTweetMediaType(page)}`);
    if (fullTweetInfo.mediaUrls && fullTweetInfo.mediaUrls.length > 0) {
      console.log(`   📸 Images found: ${fullTweetInfo.mediaUrls.length}`);
      fullTweetInfo.mediaUrls.forEach((url, i) => {
        console.log(`      [${i + 1}] ${url.substring(0, 80)}...`);
      });
    }
    console.log(`   📊 Stats: ❤️ ${fullTweetInfo.likes} | 🔁 ${fullTweetInfo.retweets} | 💬 ${fullTweetInfo.replies} | 👁️ ${fullTweetInfo.views}`);
  } else {
    console.log('   ⚠️ No tweets found in feed');
    return;
  }

  // Step 3: Scroll feed
  console.log('\n📌 Step 3: Scrolling feed...');
  await XActions.scrollFeed(page, 2);

  // Step 4: Get multiple tweets
  console.log('\n📌 Step 4: Getting multiple tweets...');
  const allTweets = await XActions.getAllTweets(page, 5);
  console.log(`   📊 Found ${allTweets.length} tweets in feed`);

  // Step 5: Click first tweet
  console.log('\n📌 Step 5: Opening first tweet detail...');
  try {
    const clicked = await XActions.clickFirstTweet(page, true);
    if (clicked) {
      console.log('   ✅ Opened tweet detail');

      console.log('\n📌 Step 6: Getting current tweet details...');
      const tweetDetail = await XActions.getCurrentTweetDetail(page);
      if (tweetDetail) {
        console.log(`   📝 Full text: ${tweetDetail.text.substring(0, 150)}...`);
      }

      console.log('\n📌 Step 7: Going back to home...');
      await XActions.goBack(page);
    } else {
      console.log('   ⚠️ Could not click first tweet');
    }
  } catch (error) {
    console.error('   ❌ Error clicking tweet:', error);
  }

  // Step 8: Check notifications
  console.log('\n📌 Step 8: Checking notifications...');
  const unreadCount = await XActions.getUnreadCount(page);
  console.log(`   🔔 Unread notifications: ${unreadCount}`);

  // Step 9: Get user profile (if username provided)
  if (profileUsername) {
    console.log('\n📌 Step 9: Getting current user profile info...');
    try {
      const userProfile = await XActions.getUserProfile(page, profileUsername);
      if (userProfile) {
        console.log(`   👤 @${userProfile.username}`);
        console.log(`   📝 Bio: ${userProfile.bio?.substring(0, 100) || 'No bio'}`);
        console.log(`   👥 Followers: ${userProfile.followersCount}`);
        console.log(`   Following: ${userProfile.followingCount}`);
        console.log(`   📅 Joined: ${userProfile.joinDate || 'Unknown'}`);
      }
    } catch (error) {
      console.error('   ❌ Error getting user profile:', error);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ ENHANCED X ACTIONS DEMO COMPLETED');
  console.log('='.repeat(60));
}

async function demoSearchActions(page: Page): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🔎 SEARCH ACTIONS DEMO');
  console.log('='.repeat(60));

  const searchQuery = 'playwright automation';
  console.log(`\n📌 Searching for: "${searchQuery}"`);
  await XActions.search(page, searchQuery);

  const feedLoaded = await waitForFeedSafe(page, 10000);
  if (feedLoaded) {
    const searchResults = await XActions.getFirstTweetInfoOnly(page);
    if (searchResults) {
      console.log(`   📊 First result: ${searchResults.text.substring(0, 100)}...`);
      if (searchResults.mediaUrls?.length) {
        console.log(`   🖼️ With ${searchResults.mediaUrls.length} image(s)`);
      }
    }
  }

  await XActions.goToHome(page);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ SEARCH ACTIONS DEMO COMPLETED');
  console.log('='.repeat(60));
}

async function demoExtractTweetInfo(page: Page): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 EXTRACT TWEET INFO DEMO');
  console.log('='.repeat(60));

  await XActions.goToHome(page);
  
  const feedLoaded = await waitForFeedSafe(page, 10000);
  if (!feedLoaded) {
    console.log('❌ Feed did not load');
    return;
  }

  // Extract full info from first 3 tweets
  for (let i = 0; i < 3; i++) {
    const tweetInfo = await XActions.getTweetInfoByIndex(page, i);
    if (tweetInfo) {
      console.log(`\n📌 Tweet #${i + 1}:`);
      console.log(`   👤 @${tweetInfo.authorUsername}`);
      console.log(`   💬 ${tweetInfo.text.substring(0, 80)}...`);
      console.log(`   🖼️ Images: ${tweetInfo.mediaUrls?.length || 0}`);
      console.log(`   📊 ❤️ ${tweetInfo.likes} | 🔁 ${tweetInfo.retweets}`);
    }
  }

  // Save extracted info to file
  const allTweets = await XActions.getAllTweets(page, 10);
  const outputPath = `./extracted-tweets-${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(allTweets, null, 2));
  console.log(`\n💾 Saved ${allTweets.length} tweets to ${outputPath}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ EXTRACT TWEET INFO COMPLETED');
  console.log('='.repeat(60));
}

// =============================================================================
// LIKE TWEET HANDLER
// =============================================================================

async function runTweetReadFollowLikeFlow(page: Page, args: LauncherArgs): Promise<void> {
  if (!args.likeCurrentTweet && !args.readComments) return;

  console.log('\n❤️ likeCurrentTweet flag detected.');

  try {
    if (!page.url().includes('/status/')) {
      console.log('📌 Current page is not a tweet detail page. Opening first tweet from feed...');
      const clicked = await XActions.clickFirstTweet(page, true);
      if (!clicked) {
        console.log('❌ Could not open first tweet, skipping like.');
        return;
      }
    }

    const liked = await XActions.likeCurrentTweet(page, {
      timeoutMs: 20000,
      navigateToHomeOnSuccess: true,
      waitAfterLikeMs: 2000
    });
    
    console.log(liked ? '✅ Like successful and returned to home!' : '⚠️ Like failed or already liked');
    
  } catch (error) {
    console.error('❌ Failed to like tweet:', error);
  }
}

async function runClickReadLikePipeline(
  page: Page,
  manager: ProfileManagerWithSQLite,
  profileId: string,
  args: LauncherArgs,
): Promise<void> {
  if (!args.likeCurrentTweet && !args.readComments && !args.replyText) return;

  console.log(
    '\nRunning pipeline: clickNewFeedOrFollowing -> clickFirstTweet -> readTweetFollow -> replyToTweet -> likeCurrentTweet',
  );

  const switchedTab = await XActions.clickNewFeedOrFollowingRobust(page, args.feedTab, {
    maxRetries: 3,
    usePositionFallback: true,
  });
  if (!switchedTab) {
    console.warn(`Could not confirm switching to "${args.feedTab}" tab, continuing anyway...`);
  }
  await HumanBehavior.delay(600, 1200);

  let openedTweetUrl = page.url();
  let openedTweetText = '';
  let firstTweetTextFromFeed = '';
  try {
    const firstTweetInfo = await XActions.extractFullTweetInfo(page, 0);
    firstTweetTextFromFeed = firstTweetInfo?.text?.trim() ?? '';
  } catch {
    firstTweetTextFromFeed = '';
  }

  if (!page.url().includes('/status/')) {
    const clicked = await XActions.clickFirstTweet(page, true);
    if (!clicked) {
      console.log('Could not open first tweet, skipping pipeline.');
      return;
    }
  }
  openedTweetUrl = page.url();
  openedTweetText = (await XActions.getCurrentTweetText(page)) ?? '';
  if (!openedTweetText && firstTweetTextFromFeed) {
    openedTweetText = firstTweetTextFromFeed;
    console.log(`Using fallback tweet text captured from feed (${openedTweetText.length} chars).`);
  }
  if (openedTweetText) {
    console.log(`Captured first tweet text (${openedTweetText.length} chars) for downstream processing.`);
  } else {
    console.log('Could not capture first tweet text right after opening tweet.');
  }

  if (args.follow === 'yes') {
    const currentTweetUrl = page.url();
    try {
      const tweetDetail = await XActions.getCurrentTweetDetail(page);
      const authorFromUrl = tweetDetail?.tweetUrl.match(/^https?:\/\/(?:x|twitter)\.com\/([^/]+)\/status\//i)?.[1];
      const fallbackAuthor = tweetDetail?.authorUsername?.trim();
      const authorUsername = (authorFromUrl ?? fallbackAuthor ?? '').trim().replace(/^@/, '');
      const isValidAuthorUsername = /^[A-Za-z0-9_]{1,15}$/.test(authorUsername);

      if (!authorUsername || !isValidAuthorUsername) {
        console.log('Follow step skipped: could not detect tweet author username.');
      } else {
        console.log(`Following first tweet author: @${authorUsername}`);
        const followedAuthor = await XActions.followUser(page, authorUsername);
        console.log(
          followedAuthor
            ? `Followed author @${authorUsername} (or already following).`
            : `Could not follow author @${authorUsername}.`,
        );

        if (currentTweetUrl.includes('/status/')) {
          await page.goto(currentTweetUrl, { waitUntil: 'domcontentloaded' });
          await page.waitForURL(/\/status\/\d+/, { timeout: 10000 }).catch(() => undefined);
          await HumanBehavior.delay(600, 1200);
        }
      }
    } catch (error) {
      console.error('Follow step failed after opening first tweet:', error);
      if (currentTweetUrl.includes('/status/')) {
        await page.goto(currentTweetUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      }
    }
  }

  const shouldReadComments = args.readComments || args.likeCurrentTweet;
  if (shouldReadComments) {
    const alreadyFollowedUsernames = manager.getStorage().getFollowedVerifiedUsernames(profileId);
    const recentFollowCount = manager.getStorage().countRecentFollowedUsers(profileId, 5);
    const remainingFollowSlots = Math.max(0, 10 - recentFollowCount);
    if (alreadyFollowedUsernames.length > 0) {
      console.log(
        `Skipping ${alreadyFollowedUsernames.length} user(s) already followed from verified_users (is_fl=1).`,
      );
    }
    console.log(`Follow throttle window(5m): used=${recentFollowCount}/10, remaining=${remainingFollowSlots}`);

    const readResult = await XActions.readTweetFollow(page, {
      maxComments: args.maxComments,
      follow: args.follow,
      followVerified: args.followVerifiedUsers,
      extractDetailedInfo: args.extractDetailedInfo,
      maxUsersToProcess: args.maxUsersToProcess,
      excludeUsernames: alreadyFollowedUsernames,
      followProbabilityMin: 0.1,
      followProbabilityMax: 0.2,
      maxFollowsThisRun: remainingFollowSlots,
    });

    if (readResult.success) {
      const tweetId = page.url().match(/\/status\/(\d+)/)?.[1] ?? '';
      const saved = manager.getStorage().saveVerifiedUsersBatch(
        profileId,
        tweetId,
        readResult.verifiedUsers,
        readResult.followedUsers,
        readResult.skippedUsers,
      );
      console.log(
        `readTweetFollow done: total=${readResult.totalComments}, verified=${readResult.verifiedUsers.length}, followed=${readResult.followedUsers.length}, skipped=${readResult.skippedUsers.length}, saved=${saved}`,
      );
    } else {
      console.log(`readTweetFollow failed: ${readResult.error ?? 'unknown error'}`);
    }
  }

  if (!args.likeCurrentTweet) return;

  let likeHandledBeforeReply = false;
  if (args.replyText && !args.replyStay && args.likeCurrentTweet) {
    const likedBeforeReply = await XActions.likeCurrentTweet(page, {
      timeoutMs: 20000,
      navigateToHomeOnSuccess: false,
      waitAfterLikeMs: 2000,
    });
    likeHandledBeforeReply = true;
    console.log(
      likedBeforeReply
        ? 'Like successful before reply flow'
        : 'Like failed or already liked before reply flow',
    );
  }

  if (args.replyText) {
    const recentReplyTexts = manager.getStorage().getRecentReplyTexts(profileId, 200);
    const recentReplySet = new Set(
      recentReplyTexts.map((text) => normalizeReplyText(text)).filter((text) => text.length > 0),
    );
    const currentTweetId = openedTweetUrl.match(/\/status\/(\d+)/)?.[1] ?? '';
    const useAutoReply = args.replyText.trim().toLowerCase() === 'auto';
    if (openedTweetUrl.includes('/status/') && page.url() !== openedTweetUrl) {
      await page.goto(openedTweetUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await page.waitForURL(/\/status\/\d+/, { timeout: 10000 }).catch(() => undefined);
      await HumanBehavior.delay(500, 1000);
    }
    const replied = useAutoReply
      ? await XActions.autoReplyToTweet(page, {
          mode: args.autoReplyMode,
          templatePath: args.autoReplyTemplate,
          deepseekApiKey: args.deepseekKey,
          deepseekModel: args.deepseekModel,
          likeBeforeReply: args.likeBeforeReply,
          stayOnPage: args.replyStay,
          maxReplyLength: args.replyMaxLength,
          minTweetLength: args.minTweetLength,
          timeoutMs: args.replyTimeoutMs,
          sourceTweetText: openedTweetText,
          excludeReplyTexts: recentReplyTexts,
          onReplySubmitted: (submittedReply: string) => {
            manager.getStorage().saveReplyHistory(profileId, submittedReply, {
              tweetId: currentTweetId,
              tweetText: openedTweetText,
              replyMode: args.autoReplyMode,
            });
          },
        })
      : (() => {
          const normalizedManualReply = normalizeReplyText(args.replyText ?? '');
          if (normalizedManualReply && recentReplySet.has(normalizedManualReply)) {
            console.log('[reply] Manual reply skipped because it was used recently.');
            return Promise.resolve(false);
          }
          return XActions.replyToTweet(page, {
            replyText: args.replyText ?? '',
            likeAfterReply: args.replyLike && !args.likeCurrentTweet,
            stayOnPage: args.replyStay,
            maxReplyLength: args.replyMaxLength,
            timeoutMs: args.replyTimeoutMs,
          }).then((manualReplied) => {
            if (manualReplied) {
              manager.getStorage().saveReplyHistory(profileId, args.replyText ?? '', {
                tweetId: currentTweetId,
                tweetText: openedTweetText,
                replyMode: 'manual',
              });
            }
            return manualReplied;
          });
        })();
    console.log(replied ? 'Reply flow completed' : 'Reply flow failed');
  }

  if (!likeHandledBeforeReply && args.likeCurrentTweet) {
    const liked = await XActions.likeCurrentTweet(page, {
      timeoutMs: 20000,
      navigateToHomeOnSuccess: true,
      waitAfterLikeMs: 2000,
    });
    console.log(liked ? 'Like successful and returned to home' : 'Like failed or already liked');
  }
}

void runTweetReadFollowLikeFlow;

// =============================================================================
// OPTIONAL X ACTIONS RUNNER
// =============================================================================

async function runOptionalXActions(
  page: Page,
  manager: ProfileManagerWithSQLite,
  profileId: string,
  args: LauncherArgs,
): Promise<void> {
  if (!isXUrl(args.targetUrl)) return;

  const refreshedProfile = manager.getStoredProfile(profileId);
  if (!refreshedProfile) {
    console.log('\n⚠️ Not logged into X yet. Skipping optional X actions.');
    console.log('💡 Please log in manually, then run again.');
    return;
  }

  // Screenshot before actions if requested
  if (args.screenshotBeforeClick) {
    await XActions.screenshot(page, 'before-actions');
  }

  await runClickReadLikePipeline(page, manager, profileId, args);

  // Extract tweet info if requested
  if (args.extractTweetInfo) {
    await demoExtractTweetInfo(page);
  }

  // Run demo actions if requested
  if (args.demoActions) {
    await demoXActionsEnhanced(page, refreshedProfile.username);
  }

  // Run search demo if requested
  if (args.demoSearch) {
    await demoSearchActions(page);
  }

  // Demo random click on text if requested
  if (args.clickRandomOnText) {
    console.log('\n🎯 Demo random click on tweet text...');
    await XActions.goToHome(page);
    await XActions.waitForFeed(page);
    const clicked = await XActions.clickRandomOnTweetText(page, 40);
    console.log(clicked ? '✅ Random click on text successful' : '❌ Random click failed');
  }
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

function formatScheduleTimestamp(date: Date): string {
  return date.toLocaleString('vi-VN', { hour12: false });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleepWithStopCheck(totalMs: number, shouldStop: () => boolean): Promise<void> {
  let remainingMs = totalMs;
  while (remainingMs > 0 && !shouldStop()) {
    const currentStepMs = Math.min(1000, remainingMs);
    await sleep(currentStepMs);
    remainingMs -= currentStepMs;
  }
}

async function runSingleExecution(
  manager: ProfileManagerWithSQLite,
  args: LauncherArgs,
  keepOpen: boolean,
): Promise<void> {
  const { context, page } = await manager.launchProfileWithRestore(args.profileId, {
    targetUrl: args.targetUrl,
  });

  try {
    await runHumanBehaviorWarmup(page);
    await captureXProfileIfApplicable(manager, page, args.profileId, args.targetUrl);
    await runOptionalXActions(page, manager, args.profileId, args);

    if (keepOpen) {
      console.log('\n💡 Flow done. Browser is kept open (--keep-open).');
      console.log('🖱️ Close the browser window or press Ctrl+C to stop.');
      await context.waitForEvent('close', { timeout: 0 });
    } else {
      console.log('\n✅ Flow completed. Closing browser context...');
      await context.close().catch(() => undefined);
    }
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function runScheduledExecution(
  manager: ProfileManagerWithSQLite,
  args: LauncherArgs,
): Promise<void> {
  let stopRequested = false;

  const onSignal = (signal: NodeJS.Signals): void => {
    if (stopRequested) return;
    stopRequested = true;
    console.log(`\n[schedule] Received ${signal}. Finishing current step and stopping...`);
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    let runCount = 0;
    while (!stopRequested) {
      runCount += 1;
      const cycleArgs = buildCycleArgsForSchedule(args);
      const runStart = Date.now();
      console.log(
        `\n[schedule] Run #${runCount} started at ${formatScheduleTimestamp(new Date(runStart))}`,
      );
      logCycleOptions(runCount, cycleArgs);

      try {
        await runSingleExecution(manager, cycleArgs, false);
        const durationSec = ((Date.now() - runStart) / 1000).toFixed(1);
        console.log(`[schedule] Run #${runCount} completed in ${durationSec}s`);
      } catch (error) {
        console.error(`[schedule] Run #${runCount} failed:`, error);
      }

      if (stopRequested) break;
      if (args.scheduleMaxRuns !== undefined && runCount >= args.scheduleMaxRuns) {
        console.log(`[schedule] Reached max runs: ${args.scheduleMaxRuns}. Stopping loop.`);
        break;
      }

      const baseWaitMs = args.scheduleIntervalMinutes * 60_000;
      const jitterMs = randomInt(5000, 25000);
      const waitMs = baseWaitMs + jitterMs;
      const nextRunAt = new Date(Date.now() + waitMs);
      console.log(
        `[schedule] Next run at ${formatScheduleTimestamp(nextRunAt)} (base=${args.scheduleIntervalMinutes}m, jitter=${Math.round(jitterMs / 1000)}s).`,
      );
      console.log('[schedule] Press Ctrl+C to stop.');
      await sleepWithStopCheck(waitMs, () => stopRequested);
    }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manager = new ProfileManagerWithSQLite('./browser_profiles', DEFAULT_DB_PATH);
  const metadata = await manager.ensureProfile(args.profileId, {
    targetUrl: args.targetUrl,
  });
  const storedProfile = manager.getStoredProfile(args.profileId);

  console.log('\n' + '='.repeat(60));
  console.log('🚀 PLAYWRIGHT X PROFILE MANAGER');
  console.log('='.repeat(60));
  console.log(`\n📦 Opening profile: ${metadata.id}`);
  console.log(`📁 User data: ${metadata.userDataDir}`);
  console.log(`🌐 Target URL: ${args.targetUrl}`);
  console.log(`💾 SQLite DB: ${manager.getStorage().getDatabasePath()}`);
  if (storedProfile) {
    console.log(`📱 Stored X profile: @${storedProfile.username} (${storedProfile.displayName})`);
  }

  // Command line arguments info
  console.log('\n📋 Command line options:');
  console.log(`   --feed-tab: ${args.feedTab}`);
  console.log(`   --follow: ${args.follow}`);
  console.log(`   --keep-open: ${args.keepOpen}`);
  console.log(`   --demo-actions: ${args.demoActions}`);
  console.log(`   --demo-search: ${args.demoSearch}`);
  console.log(`   --read-comments: ${args.readComments}`);
  console.log(`   --follow-verified-users: ${args.followVerifiedUsers}`);
  console.log(`   --max-comments: ${args.maxComments}`);
  console.log(`   --extract-detailed-info: ${args.extractDetailedInfo}`);
  console.log(`   --max-users-to-process: ${args.maxUsersToProcess}`);
  console.log(`   --like-current-tweet: ${args.likeCurrentTweet}`);
  console.log(`   --extract-tweet-info: ${args.extractTweetInfo}`);
  console.log(`   --click-random-text: ${args.clickRandomOnText}`);
  console.log(`   --screenshot: ${args.screenshotBeforeClick}`);
  console.log(`   --reply-text: ${args.replyText ?? '(none)'}`);
  console.log(`   --reply-like: ${args.replyLike}`);
  console.log(`   --reply-stay: ${args.replyStay}`);
  console.log(`   --reply-max-length: ${args.replyMaxLength}`);
  console.log(`   --reply-timeout-ms: ${args.replyTimeoutMs}`);
  console.log(`   --auto-reply-mode: ${args.autoReplyMode}`);
  console.log(`   --auto-reply-template: ${args.autoReplyTemplate}`);
  console.log(`   --deepseek-key: ${args.deepseekKey ? '***set***' : '(empty)'}`);
  console.log(`   --deepseek-model: ${args.deepseekModel}`);
  console.log(`   --like-before-reply: ${args.likeBeforeReply}`);
  console.log(`   --min-tweet-length: ${args.minTweetLength}`);
  console.log(`   --schedule-loop: ${args.scheduleLoop}`);
  console.log(`   --schedule-interval-minutes: ${args.scheduleIntervalMinutes}`);
  console.log(`   --schedule-max-runs: ${args.scheduleMaxRuns ?? '(unlimited)'}`);
  console.log(`   --dry-run: ${args.dryRun}`);

  if (args.dryRun) {
    console.log('\n✅ Dry run completed. Browser launch skipped.');
    manager.getStorage().close();
    return;
  }

  try {
    if (args.scheduleLoop) {
      if (args.keepOpen) {
        console.warn(
          '[schedule] --keep-open is ignored when --schedule-loop is enabled to avoid blocking the loop.',
        );
      }
      await runScheduledExecution(manager, args);
    } else {
      await runSingleExecution(manager, args, args.keepOpen);
    }
  } finally {
    await manager.closeAll();
  }
}

// =============================================================================
// EXPORT FUNCTIONS (CHỈ VIẾT MỘT LẦN DUY NHẤT)
// =============================================================================

export {
  demoXActionsEnhanced as demoXActions,
  demoSearchActions,
  demoExtractTweetInfo,
  runClickReadLikePipeline,
  runOptionalXActions
};

// =============================================================================
// RUN MAIN IF DIRECT EXECUTION
// =============================================================================

if (isDirectRun()) {
  main().catch((error: unknown) => {
    console.error('\n❌ Fatal error:', error);
    process.exitCode = 1;
  });
}
