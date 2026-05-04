import Database from 'better-sqlite3';
import { writeFile } from 'node:fs/promises';

import type { BrowserContext } from '@playwright/test';

export type BrowserCookie = Awaited<ReturnType<BrowserContext['cookies']>>[number];
export type BrowserStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export type XProfileData = {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  userId?: string;
  cookies: BrowserCookie[];
  storageState?: BrowserStorageState;
  userDataDir: string;
  isVerified: boolean;
  followersCount: number;
  followingCount: number;
  tweetCount: number;
  avatarUrl?: string;
  bannerUrl?: string;
  metadata?: Record<string, unknown>;
};

export type SessionStatus = 'active' | 'expired' | 'revoked';

export type SessionRecord = {
  profileId: string;
  loginTime: Date;
  ipAddress?: string;
  userAgent?: string;
  status: SessionStatus;
};

export type TweetStats = {
  likes: number;
  retweets: number;
  replies: number;
  views: number;
};

export type VerifiedUserInput = {
  id: string;
  username: string;
  displayName: string;
  isVerified: boolean;
  isGoldVerified: boolean;
  isGreyVerified: boolean;
  followersCount: number;
  avatarUrl?: string;
  commentTimestamp: string;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  user_id: string | null;
  cookies_json: string;
  storage_state_json: string | null;
  user_data_dir: string;
  is_verified: number;
  followers_count: number;
  following_count: number;
  tweet_count: number;
  avatar_url: string | null;
  banner_url: string | null;
  metadata_json: string | null;
};

type SessionRow = {
  login_time: string;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function metadataJson(value: string): Record<string, unknown> {
  return parseJson<Record<string, unknown>>(value, {});
}

function toProfileData(row: ProfileRow): XProfileData {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    ...(row.email === null ? {} : { email: row.email }),
    ...(row.user_id === null ? {} : { userId: row.user_id }),
    cookies: parseJson<BrowserCookie[]>(row.cookies_json, []),
    ...(row.storage_state_json === null
      ? {}
      : {
          storageState: parseJson<BrowserStorageState>(row.storage_state_json, {
            cookies: [],
            origins: [],
          }),
        }),
    userDataDir: row.user_data_dir,
    isVerified: row.is_verified === 1,
    followersCount: row.followers_count,
    followingCount: row.following_count,
    tweetCount: row.tweet_count,
    ...(row.avatar_url === null ? {} : { avatarUrl: row.avatar_url }),
    ...(row.banner_url === null ? {} : { bannerUrl: row.banner_url }),
    ...(row.metadata_json === null ? {} : { metadata: metadataJson(row.metadata_json) }),
  };
}

export class SQLiteProfileStorage {
  private readonly db: Database.Database;

  constructor(private readonly dbPath = './x_profiles.db') {
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.initTables();
  }

  saveProfile(profileData: XProfileData): void {
    const statement = this.db.prepare(`
      INSERT INTO profiles (
        id, username, display_name, email, user_id, cookies_json,
        storage_state_json, user_data_dir, is_verified, followers_count,
        following_count, tweet_count, avatar_url, banner_url,
        last_login, metadata_json, is_active
      ) VALUES (
        @id, @username, @displayName, @email, @userId, @cookiesJson,
        @storageStateJson, @userDataDir, @isVerified, @followersCount,
        @followingCount, @tweetCount, @avatarUrl, @bannerUrl,
        @lastLogin, @metadataJson, 1
      )
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        display_name = excluded.display_name,
        email = excluded.email,
        user_id = excluded.user_id,
        cookies_json = excluded.cookies_json,
        storage_state_json = excluded.storage_state_json,
        user_data_dir = excluded.user_data_dir,
        is_verified = excluded.is_verified,
        followers_count = excluded.followers_count,
        following_count = excluded.following_count,
        tweet_count = excluded.tweet_count,
        avatar_url = excluded.avatar_url,
        banner_url = excluded.banner_url,
        last_login = excluded.last_login,
        metadata_json = excluded.metadata_json,
        is_active = 1
    `);

    statement.run({
      id: profileData.id,
      username: profileData.username,
      displayName: profileData.displayName,
      email: profileData.email ?? null,
      userId: profileData.userId ?? null,
      cookiesJson: JSON.stringify(profileData.cookies),
      storageStateJson:
        profileData.storageState === undefined ? null : JSON.stringify(profileData.storageState),
      userDataDir: profileData.userDataDir,
      isVerified: profileData.isVerified ? 1 : 0,
      followersCount: profileData.followersCount,
      followingCount: profileData.followingCount,
      tweetCount: profileData.tweetCount,
      avatarUrl: profileData.avatarUrl ?? null,
      bannerUrl: profileData.bannerUrl ?? null,
      lastLogin: new Date().toISOString(),
      metadataJson:
        profileData.metadata === undefined ? null : JSON.stringify(profileData.metadata),
    });
  }

  getProfileById(profileId: string): XProfileData | undefined {
    const row = this.db
      .prepare('SELECT * FROM profiles WHERE id = ? AND is_active = 1')
      .get(profileId) as ProfileRow | undefined;

    return row === undefined ? undefined : toProfileData(row);
  }

  getProfileByUsername(username: string): XProfileData | undefined {
    const row = this.db
      .prepare('SELECT * FROM profiles WHERE username = ? AND is_active = 1')
      .get(username) as ProfileRow | undefined;

    return row === undefined ? undefined : toProfileData(row);
  }

  getAllProfiles(): XProfileData[] {
    const rows = this.db
      .prepare('SELECT * FROM profiles WHERE is_active = 1 ORDER BY last_login DESC')
      .all() as ProfileRow[];

    return rows.map(toProfileData);
  }

  saveSession(session: SessionRecord): number {
    const result = this.db
      .prepare(
        `
        INSERT INTO sessions (profile_id, login_time, ip_address, user_agent, status)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        session.profileId,
        session.loginTime.toISOString(),
        session.ipAddress ?? null,
        session.userAgent ?? null,
        session.status,
      );

    return Number(result.lastInsertRowid);
  }

  updateSessionLogout(sessionId: number, profileId: string): void {
    const session = this.db
      .prepare('SELECT login_time FROM sessions WHERE id = ? AND profile_id = ?')
      .get(sessionId, profileId) as SessionRow | undefined;

    if (!session) return;

    const now = new Date();
    const duration = Math.floor((now.getTime() - new Date(session.login_time).getTime()) / 1000);

    this.db
      .prepare(
        `
        UPDATE sessions
        SET logout_time = ?, session_duration = ?, status = 'expired'
        WHERE id = ? AND profile_id = ?
      `,
      )
      .run(now.toISOString(), duration, sessionId, profileId);
  }

  getActiveSession(profileId: string): unknown {
    return this.db
      .prepare(
        `
        SELECT *
        FROM sessions
        WHERE profile_id = ? AND status = 'active'
        ORDER BY login_time DESC
        LIMIT 1
      `,
      )
      .get(profileId);
  }

  saveTweetCache(
    tweetId: string,
    profileId: string,
    authorUsername: string,
    tweetText: string,
    stats: TweetStats,
    rawJson?: unknown,
  ): void {
    this.db
      .prepare(
        `
        INSERT INTO tweets_cache (
          id, profile_id, author_username, tweet_text,
          likes_count, retweets_count, replies_count, views_count, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          author_username = excluded.author_username,
          tweet_text = excluded.tweet_text,
          likes_count = excluded.likes_count,
          retweets_count = excluded.retweets_count,
          replies_count = excluded.replies_count,
          views_count = excluded.views_count,
          raw_json = excluded.raw_json,
          fetched_at = CURRENT_TIMESTAMP
      `,
      )
      .run(
        tweetId,
        profileId,
        authorUsername,
        tweetText.slice(0, 5000),
        stats.likes,
        stats.retweets,
        stats.replies,
        stats.views,
        rawJson === undefined ? null : JSON.stringify(rawJson),
      );
  }

  saveVerifiedUsersBatch(
    profileId: string,
    tweetId: string,
    users: VerifiedUserInput[],
    followedUsers: string[] = [],
    skippedUsers: string[] = [],
  ): number {
    const followedSet = new Set(followedUsers);
    const skippedSet = new Set(skippedUsers);
    let successCount = 0;

    const statement = this.db.prepare(`
      INSERT INTO verified_users (
        profile_id, username, display_name, is_fl, update_time,
        status, verified_type, follower_count, avatar_url,
        first_seen, last_comment_time, tweet_id, comment_count, updated_at
      ) VALUES (
        @profileId, @username, @displayName, @isFl, @updateTime,
        @status, @verifiedType, @followerCount, @avatarUrl,
        @firstSeen, @lastCommentTime, @tweetId, 1, CURRENT_TIMESTAMP
      )
      ON CONFLICT(username) DO UPDATE SET
        display_name = excluded.display_name,
        is_fl = excluded.is_fl,
        update_time = excluded.update_time,
        status = excluded.status,
        verified_type = excluded.verified_type,
        follower_count = excluded.follower_count,
        avatar_url = excluded.avatar_url,
        last_comment_time = excluded.last_comment_time,
        tweet_id = excluded.tweet_id,
        comment_count = verified_users.comment_count + 1,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const user of users) {
      const now = new Date().toISOString();
      const isFl = followedSet.has(user.username) ? 1 : 0;
      const status = followedSet.has(user.username)
        ? 'followed'
        : skippedSet.has(user.username)
          ? 'skipped'
          : 'pending';

      const verifiedType = user.isGoldVerified
        ? 'gold'
        : user.isGreyVerified
          ? 'grey'
          : user.isVerified
            ? 'blue'
            : 'blue';

      statement.run({
        profileId,
        username: user.username,
        displayName: user.displayName,
        isFl,
        updateTime: now,
        status,
        verifiedType,
        followerCount: user.followersCount,
        avatarUrl: user.avatarUrl ?? null,
        firstSeen: now,
        lastCommentTime: user.commentTimestamp,
        tweetId,
      });

      successCount += 1;
    }

    return successCount;
  }

  deleteProfile(profileId: string, softDelete = true): void {
    if (softDelete) {
      this.db.prepare('UPDATE profiles SET is_active = 0 WHERE id = ?').run(profileId);
      return;
    }

    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
  }

  async exportToJson(outputPath: string): Promise<void> {
    const exportData = {
      exportedAt: new Date().toISOString(),
      profiles: this.getAllProfiles(),
      sessions: this.db.prepare('SELECT * FROM sessions').all(),
      tweets: this.db.prepare('SELECT * FROM tweets_cache').all(),
    };

    await writeFile(outputPath, `${JSON.stringify(exportData, null, 2)}\n`, 'utf8');
  }

  close(): void {
    this.db.close();
  }

  getDatabasePath(): string {
    return this.dbPath;
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        email TEXT,
        user_id TEXT,
        cookies_json TEXT NOT NULL,
        storage_state_json TEXT,
        user_data_dir TEXT NOT NULL,
        is_verified INTEGER DEFAULT 0,
        followers_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
        tweet_count INTEGER DEFAULT 0,
        avatar_url TEXT,
        banner_url TEXT,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        metadata_json TEXT,
        UNIQUE(username, user_data_dir)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        logout_time DATETIME,
        ip_address TEXT,
        user_agent TEXT,
        session_duration INTEGER,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tweets_cache (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        author_username TEXT,
        tweet_text TEXT,
        likes_count INTEGER DEFAULT 0,
        retweets_count INTEGER DEFAULT 0,
        replies_count INTEGER DEFAULT 0,
        views_count INTEGER DEFAULT 0,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        raw_json TEXT,
        FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS verified_users (
        profile_id TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT,
        is_fl INTEGER DEFAULT 0,
        update_time TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        verified_type TEXT,
        follower_count INTEGER DEFAULT 0,
        avatar_url TEXT,
        first_seen TEXT NOT NULL,
        last_comment_time TEXT,
        tweet_id TEXT,
        comment_count INTEGER DEFAULT 1,
        last_error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
      CREATE INDEX IF NOT EXISTS idx_profiles_last_login ON profiles(last_login);
      CREATE INDEX IF NOT EXISTS idx_sessions_profile_id ON sessions(profile_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_tweets_profile_id ON tweets_cache(profile_id);
      CREATE INDEX IF NOT EXISTS idx_tweets_fetched_at ON tweets_cache(fetched_at);
      CREATE INDEX IF NOT EXISTS idx_verified_users_username ON verified_users(username);
      CREATE INDEX IF NOT EXISTS idx_verified_users_status ON verified_users(status);
      CREATE INDEX IF NOT EXISTS idx_verified_users_is_fl ON verified_users(is_fl);
      CREATE INDEX IF NOT EXISTS idx_verified_users_update_time ON verified_users(update_time);
      CREATE INDEX IF NOT EXISTS idx_verified_users_verified_type ON verified_users(verified_type);
    `);
  }
}
