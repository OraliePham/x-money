import { ProfileManagerWithSQLite } from './src/profile-manager-with-sqlite.js';
import XActions from './src/x-actions.js';

async function main() {
  const manager = new ProfileManagerWithSQLite('./browser_profiles', './x_profiles.db');
  const { context, page } = await manager.launchProfileWithRestore('profile_01_id', { targetUrl: 'https://x.com/home' });
  try {
    await XActions.goToProfile(page, 'PlutusGains');
    const out = await page.evaluate((rawUsername) => {
      const normalizedUsername = rawUsername.trim().replace(/^@/, '').toLowerCase();
      const container = document.querySelector('[data-testid="primaryColumn"]') ?? document;
      const buttons = Array.from(container.querySelectorAll('button[role="button"]'));

      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const normalizeText = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const followTerms = ['follow', 'follow back', 'theo doi'];
      const followingTerms = ['following', 'dang theo doi'];
      const blockedTerms = ['blocked', 'da chan'];

      const candidates = buttons.map((button) => {
        if (!isVisible(button)) return null;
        const testId = button.getAttribute('data-testid') ?? '';
        const ariaLabel = (button.getAttribute('aria-label') ?? '').trim();
        const buttonText = button.querySelector('span')?.textContent?.trim() ?? button.textContent?.trim() ?? '';
        const lowerText = normalizeText(buttonText);
        const lowerAria = normalizeText(ariaLabel);
        const top = Math.round(button.getBoundingClientRect().top);
        let score = 0;
        let currentState = 'unknown';

        if (testId.endsWith('-unfollow')) { currentState = 'following'; score += 90; }
        else if (testId.endsWith('-follow')) { currentState = 'not-following'; score += 90; }
        else if (testId.endsWith('-blocked')) { currentState = 'blocked'; score += 90; }

        if (lowerAria.includes(`@${normalizedUsername}`)) score += 60;
        if (lowerAria.includes('following @') || lowerAria.includes('dang theo doi @')) { currentState = 'following'; score += 50; }
        else if (lowerAria.includes('follow @') || lowerAria.includes('theo doi @') || lowerAria.includes('follow back @')) { currentState = 'not-following'; score += 50; }

        if (followingTerms.some((term) => lowerText === term)) { currentState = 'following'; score += 30; }
        else if (followTerms.some((term) => lowerText === term)) { currentState = 'not-following'; score += 30; }
        else if (blockedTerms.some((term) => lowerText.includes(term))) { currentState = 'blocked'; score += 30; }

        if (button.closest('[data-testid="userActions"]')) score += 120;
        if (top > 0 && top < 700) score += 10;

        if (currentState === 'unknown') return null;
        return { testId, ariaLabel, buttonText, lowerText, lowerAria, score, top, currentState };
      }).filter(Boolean);

      candidates.sort((a,b)=> b.score - a.score || a.top - b.top);
      return { normalizedUsername, top10: candidates.slice(0,10), total: candidates.length };
    }, 'PlutusGains');

    console.log(JSON.stringify(out, null, 2));
  } finally {
    await manager.closeAll();
    await context.close().catch(()=>undefined);
  }
}

main().catch((e)=>{ console.error(e); process.exitCode=1; });
