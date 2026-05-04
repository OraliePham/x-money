# Huong Dan Su Dung Profile Manager

Tai lieu nay huong dan cach dung cac module profile browser vua them vao project.

## 1. Cai dat ban dau

Neu chua cai dependencies:

```bash
npm install
```

Neu Playwright chua co browser:

```bash
npx playwright install
```

Tren Windows PowerShell, neu gap loi `npm.ps1 cannot be loaded because running scripts is disabled`,
hay dung `npm.cmd` thay cho `npm`:

```bash
npm.cmd run profile:open
```

## 2. Mo mot profile co san

Lenh mac dinh se mo profile `profile_01_id` va vao `https://x.com`:

```bash
npm.cmd run profile:open
```

Profile duoc luu tai:

```text
browser_profiles/profile_01_id/
```

Trong do:

- `config.json`: thong tin profile, fingerprint, thoi gian tao/cap nhat.
- `user_data/`: du lieu browser persistent nhu cookies, local storage, session.

Neu URL la `x.com` hoac `twitter.com`, launcher se luu thong tin X profile vao SQLite:

```text
x_profiles.db
```

Bang chinh gom `profiles`, `sessions`, va `tweets_cache`.

## 3. Mo profile voi ID va URL rieng

Co the truyen profile ID va URL truc tiep:

```bash
npx.cmd tsx src/profile-launcher.ts profile_02_id https://example.com
```

Neu profile chua ton tai, script se tao moi. Neu profile da ton tai, script se dung lai
`user_data` cu de giu session.

## 4. Chay stealth validation

Script nay tao profile test tam thoi, mo browser, kiem tra mot so dau hieu stealth co ban,
roi xoa profile test:

```bash
npm.cmd run profile:test-stealth
```

Ket qua se in ra cac muc nhu:

- Webdriver flag removal
- Chrome runtime presence
- Plugins count
- Vietnamese language support
- Hardware concurrency
- Device memory

## 5. Dung ProfileManager trong code

Vi du tao va mo mot profile:

```ts
import { ProfileManager } from './profile-manager.js';

const manager = new ProfileManager();

await manager.ensureProfile('profile_01_id', 'https://x.com');

const { context, page, config } = await manager.launchProfile('profile_01_id', {
  targetUrl: 'https://x.com',
});

console.log(config.id);
await page.screenshot({ path: 'artifacts/profile-01.png' });

await manager.closeProfile('profile_01_id');
```

Neu muon dung SQLite de restore/lưu X profile:

```ts
import { ProfileManagerWithSQLite } from './profile-manager-with-sqlite.js';

const manager = new ProfileManagerWithSQLite('./browser_profiles', './x_profiles.db');

await manager.ensureProfile('profile_01_id', 'https://x.com');

const { page } = await manager.launchProfileWithRestore('profile_01_id', {
  targetUrl: 'https://x.com/home',
});

const savedProfile = await manager.extractXProfileFromPage(page, 'profile_01_id');
console.log(savedProfile?.username);

await manager.closeAll();
```

Mot so method chinh:

| Method                         | Muc dich                                                      |
| ------------------------------ | ------------------------------------------------------------- |
| `createProfile(id, targetUrl)` | Tao profile moi. Bao loi neu ID da ton tai.                   |
| `ensureProfile(id, targetUrl)` | Tao neu chua co, dung lai neu da co.                          |
| `launchProfile(id, options)`   | Mo persistent browser context voi fingerprint/stealth script. |
| `closeProfile(id)`             | Dong profile dang chay.                                       |
| `closeAll()`                   | Dong tat ca profile dang chay.                                |
| `listProfiles()`               | Lay danh sach profile trong `browser_profiles`.               |
| `getProfile(id)`               | Doc config cua mot profile.                                   |
| `deleteProfile(id, force)`     | Xoa profile khoi disk.                                        |

SQLite methods hay dung:

| Method                                  | Muc dich                                                             |
| --------------------------------------- | -------------------------------------------------------------------- |
| `launchProfileWithRestore(id, options)` | Mo profile va add cookies da luu trong SQLite neu co.                |
| `extractXProfileFromPage(page, id)`     | Lay cookies, storage state, username/display name va luu vao SQLite. |
| `getStoredProfile(id)`                  | Lay X profile da luu theo profile ID.                                |
| `getStoredProfiles()`                   | Lay tat ca X profiles dang active.                                   |
| `getStorage()`                          | Truy cap storage de export/query nang cao.                           |

## 6. Dung HumanBehavior

`HumanBehavior` gom cac thao tac chuot/ban phim co delay va di chuyen tu nhien hon:

```ts
import { HumanBehavior } from './human-behavior.js';

await HumanBehavior.randomMouseMovement(page);
await HumanBehavior.clickLikeHuman(page, 'button[type="submit"]');
await HumanBehavior.type(page, 'input[name="q"]', 'playwright profile manager');
await HumanBehavior.scroll(page, 600);
```

## 7. Chay nhieu profile song song

Dung `ConcurrentRunner` khi can chay cung mot task tren nhieu profile:

```ts
import { ConcurrentRunner } from './concurrent-runner.js';

const runner = new ConcurrentRunner(3);

const results = await runner.runProfiles(
  ['profile_01_id', 'profile_02_id', 'profile_03_id'],
  async (page, profileId) => {
    await page.goto('https://httpbin.org/user-agent');
    console.log(`Done: ${profileId}`);
  },
);

console.log(results);
console.log(`Success rate: ${runner.getSuccessRate().toFixed(1)}%`);

await runner.closeAll();
```

`new ConcurrentRunner(3)` nghia la toi da 3 browser profile chay cung luc.

## 8. Kiem tra code

Sau khi sua code, nen chay:

```bash
npm.cmd run typecheck
npm.cmd run lint
```

Neu chi muon format cac file profile manager:

```bash
npx.cmd prettier --write src/profile-manager.ts src/profile-launcher.ts src/human-behavior.ts src/concurrent-runner.ts src/test-stealth.ts
```

## 9. Quan ly SQLite

Mo profile va tu dong luu/restore SQLite:

```bash
npm.cmd run profile:open
```

Xem database bang SQLite CLI neu may da cai `sqlite3`:

```bash
sqlite3 x_profiles.db
```

Mot vai query huu ich:

```sql
SELECT id, username, display_name, is_verified, last_login
FROM profiles
WHERE is_active = 1
ORDER BY last_login DESC;

SELECT profile_id, login_time, logout_time, session_duration, status
FROM sessions
ORDER BY login_time DESC;
```

## 10. Luu y quan trong

- Khong nen xoa thu muc `browser_profiles/<id>/user_data` neu muon giu login/session.
- Khong nen commit `x_profiles.db` vi co the chua cookies/session. File `*.db` da duoc them vao
  `.gitignore`.
- Moi profile nen co ID rieng, vi Chromium persistent context khong nen dung chung mot
  `user_data` cho nhieu browser dang mo cung luc.
- Neu profile dang bi lock, hay dong browser truoc roi chay lai.
- `targetUrl` trong `config.json` chi la URL mac dinh gan voi profile; ban van co the truyen
  URL khac khi launch.
- Cac stealth check hien tai chi la validation co ban cho local testing, khong phai dam bao
  vuot moi he thong detection.
