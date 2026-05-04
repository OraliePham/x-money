import { ProfileManagerWithSQLite } from './src/profile-manager-with-sqlite.js';
import XActions from './src/x-actions.js';

async function main() {
  const manager = new ProfileManagerWithSQLite('./browser_profiles', './x_profiles.db');
  const profileId = 'profile_01_id';
  const targetUser = 'PlutusGains';

  const { context, page } = await manager.launchProfileWithRestore(profileId, {
    targetUrl: 'https://x.com/home',
  });

  try {
    await XActions.goToProfile(page, targetUser);
    const stateBefore = await XActions.checkFollowState(page, targetUser);
    const result = await XActions.toggleFollowOnProfile(page, {
      action: 'follow',
      waitAfterClickMs: 1200,
      confirmAction: true,
    });
    const stateAfter = await XActions.checkFollowState(page, targetUser);

    console.log('DEBUG_STATE_BEFORE', stateBefore);
    console.log('DEBUG_TOGGLE_RESULT', JSON.stringify(result));
    console.log('DEBUG_STATE_AFTER', stateAfter);
  } finally {
    await manager.closeAll();
    await context.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('DEBUG_FATAL', err);
  process.exitCode = 1;
});
