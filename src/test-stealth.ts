import { ProfileManager } from './profile-manager.js';

type TestResult = {
  name: string;
  passed: boolean;
  details: string;
};

const TEST_PROFILE_ID = 'stealth_test_profile';

async function runStealthChecks(): Promise<void> {
  const manager = new ProfileManager('./test_profiles');
  await manager.deleteProfile(TEST_PROFILE_ID, true);
  await manager.createProfile(TEST_PROFILE_ID);

  try {
    const { page } = await manager.launchProfile(TEST_PROFILE_ID);
    const tests: TestResult[] = [];

    const webdriver = await page.evaluate(() => navigator.webdriver);
    tests.push({
      name: 'Webdriver flag removal',
      passed: webdriver === undefined,
      details: webdriver === undefined ? 'hidden' : String(webdriver),
    });

    const hasChromeRuntime = await page.evaluate(() =>
      Boolean((globalThis as { chrome?: { runtime?: unknown } }).chrome?.runtime),
    );
    tests.push({
      name: 'Chrome runtime presence',
      passed: hasChromeRuntime,
      details: hasChromeRuntime ? 'present' : 'missing',
    });

    const pluginsLength = await page.evaluate(() => navigator.plugins.length);
    tests.push({
      name: 'Plugins count',
      passed: pluginsLength > 0,
      details: `${pluginsLength} plugins`,
    });

    const languages = await page.evaluate(() => navigator.languages);
    tests.push({
      name: 'Vietnamese language support',
      passed: languages.includes('vi-VN'),
      details: languages.join(', '),
    });

    const hardwareConcurrency = await page.evaluate(() => navigator.hardwareConcurrency);
    tests.push({
      name: 'Hardware concurrency',
      passed: hardwareConcurrency >= 4 && hardwareConcurrency <= 16,
      details: `${hardwareConcurrency} cores`,
    });

    const deviceMemory = await page.evaluate(
      () => (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    );
    tests.push({
      name: 'Device memory',
      passed: deviceMemory !== undefined && deviceMemory >= 4 && deviceMemory <= 16,
      details: deviceMemory === undefined ? 'unknown' : `${deviceMemory} GB`,
    });

    printResults(tests);
  } finally {
    await manager.closeAll();
    await manager.deleteProfile(TEST_PROFILE_ID, true);
  }
}

function printResults(tests: TestResult[]): void {
  const passedCount = tests.filter((test) => test.passed).length;
  const score = (passedCount / tests.length) * 100;

  console.log('Stealth validation results');
  for (const test of tests) {
    console.log(`${test.passed ? 'PASS' : 'FAIL'} | ${test.name} | ${test.details}`);
  }

  console.log(`Final score: ${passedCount}/${tests.length} (${score.toFixed(1)}%)`);
}

runStealthChecks().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
