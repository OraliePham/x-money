import { ProfileManagerWithSQLite } from './src/profile-manager-with-sqlite.js';
import XActions from './src/x-actions.js';

async function main() {
  const manager = new ProfileManagerWithSQLite('./browser_profiles', './x_profiles.db');
  const { context, page } = await manager.launchProfileWithRestore('profile_01_id', {
    targetUrl: 'https://x.com/home',
  });

  try {
    await XActions.goToProfile(page, 'PlutusGains');
    const debug = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="primaryColumn"]') ?? document;
      const buttons = Array.from(container.querySelectorAll('button[role="button"]'));
      const visible = buttons
        .map((button) => {
          const rect = button.getBoundingClientRect();
          const style = window.getComputedStyle(button);
          if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
            return null;
          }
          const testId = button.getAttribute('data-testid') ?? '';
          const ariaLabel = button.getAttribute('aria-label') ?? '';
          const text = (button.textContent ?? '').replace(/\s+/g, ' ').trim();
          const className = button.className;
          return {
            testId,
            ariaLabel,
            text,
            className: typeof className === 'string' ? className.slice(0, 80) : '',
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((x) => x !== null)
        .slice(0, 120);

      const focus = visible.filter((b) => {
        const hay = `${b.testId} ${b.ariaLabel} ${b.text}`.toLowerCase();
        return hay.includes('follow') || hay.includes('following') || hay.includes('back') || b.testId.includes('-follow') || b.testId.includes('-unfollow');
      });

      return { totalVisible: visible.length, focus, sample: visible.slice(0, 40) };
    });

    console.log('DEBUG_TOTAL_VISIBLE', debug.totalVisible);
    console.log('DEBUG_FOCUS', JSON.stringify(debug.focus, null, 2));
    console.log('DEBUG_SAMPLE', JSON.stringify(debug.sample, null, 2));
  } finally {
    await manager.closeAll();
    await context.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('DEBUG_FATAL', err);
  process.exitCode = 1;
});
