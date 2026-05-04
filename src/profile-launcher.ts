// FILE: src/profile-launcher.ts
// COMPLETE INTEGRATION WITH X ACTIONS - FIXED VERSION

import { HumanBehavior } from './human-behavior.js';
import { ProfileManagerWithSQLite } from './profile-manager-with-sqlite.js';
import XActions from './x-actions.js';

import { pathToFileURL } from 'node:url';
import * as fs from 'fs';

import type { Page } from '@playwright/test';
import type { XProfileData } from './sqlite-profile-storage.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_PROFILE_ID = 'profile_01_id';
const DEFAULT_TARGET_URL = 'https://x.com';
const DEFAULT_DB_PATH = './x_profiles.db';
const LOGIN_DETECTION_TIMEOUT_MS = 120_000;

// =============================================================================
// TYPES
// =============================================================================

type LauncherArgs = {
  profileId: string;
  targetUrl: string;
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
};

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

function parseArgs(argv: string[]): LauncherArgs {
  const positionalArgs = argv.filter((arg) => !arg.startsWith('--'));

  return {
    profileId: positionalArgs[0] ?? DEFAULT_PROFILE_ID,
    targetUrl: normalizeUrl(positionalArgs[1] ?? DEFAULT_TARGET_URL),
    demoActions: argv.includes('--demo-actions'),
    demoSearch: argv.includes('--demo-search'),
    dryRun: argv.includes('--dry-run'),
    likeCurrentTweet: argv.includes('--like-current-tweet'),
    readComments: argv.includes('--read-comments'),
    followVerifiedUsers: argv.includes('--follow-verified-users'),
    maxComments: parseMaxComments(argv),
    extractDetailedInfo: argv.includes('--extract-detailed-info'),
    maxUsersToProcess: parseMaxUsersToProcess(argv),
    extractTweetInfo: argv.includes('--extract-tweet-info'),
    clickRandomOnText: argv.includes('--click-random-text'),
    screenshotBeforeClick: argv.includes('--screenshot'),
  };
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

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const repaired =
    trimmed.startsWith('https:/') && !trimmed.startsWith('https://')
      ? trimmed.replace('https:/', 'https://')
      : trimmed;

  return new URL(repaired).toString();
}

function isXUrl(targetUrl: string): boolean {
  const hostname = new URL(targetUrl).hostname.toLowerCase();
  return hostname === 'x.com' || hostname.endsWith('.x.com') || hostname === 'twitter.com';
}

function isDirectRun(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href;
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
  
  const feedLoaded = await XActions.waitForFeed(page, 10000);
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

  const feedLoaded = await XActions.waitForFeed(page, 10000);
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
  
  const feedLoaded = await XActions.waitForFeed(page, 10000);
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
  if (!args.likeCurrentTweet && !args.readComments) return;

  console.log('\nRunning pipeline: clickFirstTweet -> readTweetFollow -> likeCurrentTweet');

  if (!page.url().includes('/status/')) {
    const clicked = await XActions.clickFirstTweet(page, true);
    if (!clicked) {
      console.log('Could not open first tweet, skipping pipeline.');
      return;
    }
  }

  const shouldReadComments = args.readComments || args.likeCurrentTweet;
  if (shouldReadComments) {
    const readResult = await XActions.readTweetFollow(page, {
      maxComments: args.maxComments,
      followVerified: args.followVerifiedUsers,
      extractDetailedInfo: args.extractDetailedInfo,
      maxUsersToProcess: args.maxUsersToProcess,
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
        `readTweetFollow done: total=${readResult.totalComments}, verified=${readResult.verifiedUsers.length}, saved=${saved}`,
      );
    } else {
      console.log(`readTweetFollow failed: ${readResult.error ?? 'unknown error'}`);
    }
  }

  if (!args.likeCurrentTweet) return;

  const liked = await XActions.likeCurrentTweet(page, {
    timeoutMs: 20000,
    navigateToHomeOnSuccess: true,
    waitAfterLikeMs: 2000,
  });
  console.log(liked ? 'Like successful and returned to home' : 'Like failed or already liked');
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const manager = new ProfileManagerWithSQLite('./browser_profiles', DEFAULT_DB_PATH);
  const metadata = await manager.ensureProfile(args.profileId, args.targetUrl);
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
  console.log(`   --dry-run: ${args.dryRun}`);

  if (args.dryRun) {
    console.log('\n✅ Dry run completed. Browser launch skipped.');
    manager.getStorage().close();
    return;
  }

  console.log('\n🖱️ Close the browser window or press Ctrl+C to stop.\n');

  const { context, page } = await manager.launchProfileWithRestore(args.profileId, {
    targetUrl: args.targetUrl,
  });

  await runHumanBehaviorWarmup(page);
  await captureXProfileIfApplicable(manager, page, args.profileId, args.targetUrl);
  await runOptionalXActions(page, manager, args.profileId, args);

  console.log('\n💡 Browser will stay open. Press Ctrl+C or close the browser window to stop.');
  await context.waitForEvent('close');
  await manager.closeAll();
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
