import type { Page } from '@playwright/test';

type Point = {
  x: number;
  y: number;
};

const mousePositions = new WeakMap<Page, Point>();

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function bezierCurve(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

export class HumanBehavior {
  static async mouseMove(page: Page, targetX: number, targetY: number): Promise<void> {
    const viewport = page.viewportSize();
    const start = mousePositions.get(page) ?? {
      x: viewport ? viewport.width / 2 : 0,
      y: viewport ? viewport.height / 2 : 0,
    };
    const steps = 40 + Math.floor(Math.random() * 40);

    const cp1x = start.x + (targetX - start.x) * 0.3 + randomBetween(-25, 25);
    const cp1y = start.y + (targetY - start.y) * 0.3 + randomBetween(-25, 25);
    const cp2x = start.x + (targetX - start.x) * 0.7 + randomBetween(-25, 25);
    const cp2y = start.y + (targetY - start.y) * 0.7 + randomBetween(-25, 25);

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = bezierCurve(t, start.x, cp1x, cp2x, targetX);
      const y = bezierCurve(t, start.y, cp1y, cp2y, targetY);
      await page.mouse.move(x, y);
      await page.waitForTimeout(randomBetween(3, 11));
    }

    mousePositions.set(page, { x: targetX, y: targetY });
  }

  static async type(page: Page, selector: string, text: string): Promise<void> {
    await page.click(selector);
    await this.delay(100, 300);

    for (const char of text) {
      await page.keyboard.type(char);
      await this.delay(char === ' ' ? 60 : 40, char === ' ' ? 140 : 120);
    }
  }

  static async scroll(page: Page, distance: number): Promise<void> {
    const steps = 20 + Math.floor(Math.random() * 15);
    const direction = Math.sign(distance) || 1;
    const baseStepDistance = Math.abs(distance) / steps;
    let remaining = Math.abs(distance);

    for (let i = 0; i < steps && remaining > 0; i += 1) {
      const step = Math.min(baseStepDistance + randomBetween(-10, 10), remaining);
      await page.mouse.wheel(0, step * direction);
      remaining -= step;
      await this.delay(25, 75);
    }
  }

  static async scrollToElement(page: Page, selector: string): Promise<void> {
    const element = await page.$(selector);
    const boundingBox = await element?.boundingBox();
    if (!boundingBox) return;

    await this.scroll(page, boundingBox.y);
    await this.delay(500, 1000);
  }

  static async delay(minMs = 500, maxMs = 2000): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, randomBetween(minMs, maxMs));
    });
  }

  static async randomMouseMovement(page: Page): Promise<void> {
    const viewport = page.viewportSize();
    if (!viewport) return;

    await this.mouseMove(page, Math.random() * viewport.width, Math.random() * viewport.height);
  }

  static async clickLikeHuman(page: Page, selector: string): Promise<void> {
    const element = await page.$(selector);
    const boundingBox = await element?.boundingBox();
    if (!boundingBox) {
      await page.click(selector);
      return;
    }

    const targetX = boundingBox.x + boundingBox.width * randomBetween(0.3, 0.7);
    const targetY = boundingBox.y + boundingBox.height * randomBetween(0.3, 0.7);

    await this.mouseMove(page, targetX, targetY);
    await this.delay(100, 300);
    await page.mouse.click(targetX, targetY);
    mousePositions.set(page, { x: targetX, y: targetY });
  }

  static async hover(page: Page, selector: string): Promise<void> {
    const element = await page.$(selector);
    const boundingBox = await element?.boundingBox();
    if (!boundingBox) return;

    await this.mouseMove(
      page,
      boundingBox.x + boundingBox.width / 2,
      boundingBox.y + boundingBox.height / 2,
    );
    await this.delay(100, 200);
  }
}
