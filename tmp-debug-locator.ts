import { ProfileManagerWithSQLite } from './src/profile-manager-with-sqlite.js';
import XActions from './src/x-actions.js';

async function main() {
  const manager = new ProfileManagerWithSQLite('./browser_profiles', './x_profiles.db');
  const { context, page } = await manager.launchProfileWithRestore('profile_01_id', { targetUrl: 'https://x.com/home' });
  try {
    await XActions.goToProfile(page, 'PlutusGains');
    const allFollow = page.locator('button[role="button"][data-testid$="-follow"]');
    const countAllFollow = await allFollow.count();
    const firstVisible = countAllFollow > 0 ? await allFollow.first().isVisible().catch(()=>false) : false;
    console.log('COUNT_DATA_TESTID_SUFFIX_FOLLOW', countAllFollow, 'FIRST_VISIBLE', firstVisible);
    const byAria = page.locator('button[role="button"][aria-label*="@PlutusGains"]');
    console.log('COUNT_ARIA_USER', await byAria.count());
    if (await byAria.count() > 0) {
      console.log('ARIA_FIRST_VISIBLE', await byAria.first().isVisible().catch(()=>false));
      console.log('ARIA_FIRST_TESTID', await byAria.first().getAttribute('data-testid'));
      console.log('ARIA_FIRST_TEXT', await byAria.first().textContent());
      console.log('ARIA_FIRST_ARIA', await byAria.first().getAttribute('aria-label'));
    }
  } finally {
    await manager.closeAll();
    await context.close().catch(()=>undefined);
  }
}

main().catch((e)=>{ console.error(e); process.exitCode=1; });
