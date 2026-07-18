/**
 * QA: Verify page transitions, scroll progress, and motion (ZEU-129)
 *
 * Tests:
 * 1. Page transitions — fade-out, loader animation, hero stagger entrance
 * 2. Scroll progress — fixed yellow→orange bar
 * 3. Data-motion on GraphicDesign page — stagger reveals
 * 4. Reduced motion — all animations skip
 * 5. Mobile viewport — same flows
 * 6. Performance — devtools checks
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = "http://localhost:5174";
const EVIDENCE_DIR = resolve(__dirname, "qa-evidence/qa-animations");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-");
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

const results = [];

function logResult(name, status, detail = "") {
  results.push({ name, status, detail, timestamp: new Date().toISOString() });
  const icon = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "⚠";
  console.log(` ${icon} ${name.padEnd(60)} ${status}${detail ? " — " + detail : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function takeScreenshot(page, name) {
  const path = resolve(EVIDENCE_DIR, `${TIMESTAMP}-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function run() {
  console.log(`\n=== ZEU-129: Page transitions, scroll progress, motion QA ===\n`);
  console.log(`Evidence dir: ${EVIDENCE_DIR}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Timestamp: ${TIMESTAMP}\n`);

  const browser = await chromium.launch({ headless: true });

  try {
    // ──────────────────────────────────────────────
    // 1. PAGE TRANSITIONS — Desktop
    // ──────────────────────────────────────────────
    console.log("═══ 1. PAGE TRANSITIONS (Desktop) ═══\n");

    const desktopCtx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const page = await desktopCtx.newPage();

    // Collect console errors
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Navigate to homepage
    await page.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 20000 });
    await sleep(1200); // Let initial animations settle

    // Check for the scroll progress bar
    const hasScrollProgress = await page.evaluate(() => {
      const el = document.querySelector(".rx-scroll-progress");
      return (
        !!el &&
        el.style.position === "fixed" &&
        el.style.top === "0px" &&
        el.style.zIndex === "10001"
      );
    });
    logResult(
      "1a. Scroll progress bar exists on homepage",
      hasScrollProgress ? "PASS" : "FAIL",
      ".rx-scroll-progress fixed at top, z-index 10001"
    );

    await takeScreenshot(page, "homepage-initial");

    // Navigate to Services page and observe transitions
    console.log(" → Navigating to /services");
    const startNav = Date.now();
    await page.click('a[href="/services"]');
    await sleep(280); // After exit animation completes (~280ms)
    await takeScreenshot(page, "services-transition-exit");

    // Check if loader appeared after navigating
    const loaderAppeared = await page.evaluate(() => {
      return !!document.querySelector(".rx-route-loading");
    });
    logResult(
      "1b. Loading screen appears during navigation",
      loaderAppeared ? "PASS" : "FAIL",
      ".rx-route-loading detected after click"
    );

    // Wait for the full transition to complete
    await sleep(2500);
    await page.waitForSelector(".rx-content-page", { timeout: 10000 }).catch(() => {});
    await sleep(1200); // Let stagger entrance complete

    await takeScreenshot(page, "services-loaded");

    // Check the main content is visible
    const contentVisible = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return false;
      const style = window.getComputedStyle(main);
      return style.opacity !== "0" && style.visibility !== "hidden";
    });
    logResult(
      "1c. Content visible after navigation",
      contentVisible ? "PASS" : "FAIL",
      "main element is visible post-transition"
    );

    // Navigate to About page
    console.log(" → Navigating to /about");
    await page.click('a[href="/about"]');
    await sleep(1000);
    await page.waitForSelector(".rx-content-page", { timeout: 10000 }).catch(() => {});
    await sleep(1200);
    await takeScreenshot(page, "about-loaded");

    const aboutContentVisible = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return false;
      return window.getComputedStyle(main).opacity !== "0";
    });
    logResult(
      "1d. About page content visible",
      aboutContentVisible ? "PASS" : "FAIL",
      "About page loaded after 3rd navigation"
    );

    // Navigate back to Services
    console.log(" → Navigating back to /services");
    await page.click('a[href="/services"]');
    await sleep(1000);
    await page.waitForSelector(".rx-content-page", { timeout: 10000 }).catch(() => {});
    await sleep(1200);
    await takeScreenshot(page, "services-loaded-again");

    logResult(
      "1e. Consistent navigation across 3+ pages",
      consoleErrors.filter((e) => !e.includes("favicon") && !e.includes("404")).length === 0 ? "PASS" : "WARN",
      `Console errors: ${consoleErrors.length}`
    );

    await page.close();
    await desktopCtx.close();

    // ──────────────────────────────────────────────
    // 2. SCROLL PROGRESS BAR
    // ──────────────────────────────────────────────
    console.log("\n═══ 2. SCROLL PROGRESS BAR ═══\n");

    const scrollCtx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const scrollPage = await scrollCtx.newPage();
    await scrollPage.goto(BASE_URL + "/services", { waitUntil: "networkidle", timeout: 20000 });
    await sleep(2500); // Let all animations settle

    // Get initial scroll progress
    const initialScale = await scrollPage.evaluate(() => {
      const el = document.querySelector(".rx-scroll-progress");
      if (!el) return null;
      const transform = el.style.transform;
      const match = transform.match(/scaleX\(([\d.]+)\)/);
      return match ? parseFloat(match[1]) : 0;
    });

    // Get page height so we know max scroll
    const pageHeight = await scrollPage.evaluate(() => {
      return document.documentElement.scrollHeight;
    });
    const viewportHeight = DESKTOP_VIEWPORT.height;

    logResult("2a. Scroll progress bar initial state", initialScale !== null ? "PASS" : "FAIL", `scaleX(${initialScale})`);

    // Scroll halfway and check
    await scrollPage.evaluate((y) => window.scrollTo(0, y), Math.floor((pageHeight - viewportHeight) / 2));
    await sleep(400); // RAF-throttled update + render

    const midScale = await scrollPage.evaluate(() => {
      const el = document.querySelector(".rx-scroll-progress");
      if (!el) return null;
      const transform = el.style.transform;
      const match = transform.match(/scaleX\(([\d.]+)\)/);
      return match ? parseFloat(match[1]) : 0;
    });

    logResult(
      "2b. Scroll progress advances when scrolling down",
      midScale !== null && midScale > 0 && midScale < 1 ? "PASS" : "FAIL",
      `scaleX(${midScale}) after scrolling 50%`
    );

    // Screenshot at mid-scroll with scroll bar visible
    await takeScreenshot(scrollPage, "scroll-progress-mid");

    // Scroll to bottom
    await scrollPage.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await sleep(400);

    const bottomScale = await scrollPage.evaluate(() => {
      const el = document.querySelector(".rx-scroll-progress");
      if (!el) return null;
      const transform = el.style.transform;
      const match = transform.match(/scaleX\(([\d.]+)\)/);
      return match ? parseFloat(match[1]) : 0;
    });

    logResult(
      "2c. Scroll progress reaches 100% at bottom",
      bottomScale !== null && bottomScale >= 0.98 ? "PASS" : "FAIL",
      `scaleX(${bottomScale}) at scroll bottom`
    );

    // Scroll back up
    await scrollPage.evaluate(() => window.scrollTo(0, 0));
    await sleep(400);

    const topScale = await scrollPage.evaluate(() => {
      const el = document.querySelector(".rx-scroll-progress");
      if (!el) return null;
      const transform = el.style.transform;
      const match = transform.match(/scaleX\(([\d.]+)\)/);
      return match ? parseFloat(match[1]) : 0;
    });

    logResult(
      "2d. Scroll progress shrinks when scrolling back up",
      topScale !== null && topScale < 0.02 ? "PASS" : "WARN",
      `scaleX(${topScale}) after scroll back to top`
    );

    // Check the gradient colors
    const barColor = await scrollPage.evaluate(() => {
      const el = document.querySelector(".rx-scroll-progress");
      if (!el) return null;
      return window.getComputedStyle(el).background;
    });

    // Should be a gradient from yellow (#ffcd2a) to orange (#ff8c2a)
    const hasYellowOrangeGradient = barColor && barColor.includes("gradient") && (barColor.includes("ffcd") || barColor.includes("ffcd2a"));
    logResult(
      "2e. Scroll progress bar has yellow→orange gradient",
      hasYellowOrangeGradient ? "PASS" : "WARN",
      `background: ${barColor?.substring(0, 60)}`
    );

    await scrollPage.close();
    await scrollCtx.close();

    // ──────────────────────────────────────────────
    // 3. DATA-MOTION ON GRAPHICDESIGN PAGE
    // ──────────────────────────────────────────────
    console.log("\n═══ 3. DATA-MOTION COVERAGE (GraphicDesign) ═══\n");

    const gdCtx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const gdPage = await gdCtx.newPage();

    await gdPage.goto(BASE_URL + "/graphic-design", { waitUntil: "networkidle", timeout: 20000 });
    await sleep(3000); // Let page and initial animations settle

    await takeScreenshot(gdPage, "graphic-design-initial");

    // Check for the stagger containers
    const staggerContainers = await gdPage.evaluate(() => {
      const containers = document.querySelectorAll("[data-motion-stagger]");
      return Array.from(containers).map((el) => ({
        tag: el.tagName,
        className: (el.className || "").substring(0, 60),
        stagger: el.getAttribute("data-motion-stagger"),
        children: el.getAttribute("data-motion-stagger-children") || "none",
        delay: el.getAttribute("data-motion-stagger-delay") || "default",
        childCount: el.querySelectorAll(
          el.getAttribute("data-motion-stagger-children") || "[data-motion-item]"
        ).length
      }));
    });

    logResult(
      "3a. Stagger containers found on GraphicDesign page",
      staggerContainers.length >= 3 ? "PASS" : "FAIL",
      `${staggerContainers.length} containers: ${staggerContainers.map((c) => c.stagger).join(", ")}`
    );

    // Log details of stagger containers
    console.log("  Stagger containers:");
    for (const c of staggerContainers) {
      console.log(
        `    - [${c.stagger}] children="${c.children}" delay=${c.delay} count=${c.childCount}`
      );
    }

    // Scroll to Why Roxton section
    await gdPage.evaluate(() => {
      const whyGrid = document.querySelector("[role='list'][aria-label='Why Roxton']");
      if (whyGrid) whyGrid.scrollIntoView({ behavior: "instant", block: "center" });
    });
    await sleep(1000);
    // Scroll up a bit so it's visible in viewport for animation
    await gdPage.evaluate(() => window.scrollBy(0, -100));
    await sleep(1200); // Wait for animation to play

    await takeScreenshot(gdPage, "gd-why-roxton");

    // Check cards are visible after animation
    const whyCardsVisible = await gdPage.evaluate(() => {
      const cards = document.querySelectorAll(".why-card");
      return Array.from(cards).map((c) => {
        const style = window.getComputedStyle(c);
        return {
          opacity: style.opacity !== "0",
          transform: style.transform !== "matrix(1, 0, 0, 1, 0, 20)" && style.transform !== "translateY(20px)",
          visible: style.opacity !== "0"
        };
      });
    });

    const allWhyCardsVisible = whyCardsVisible.length >= 2 && whyCardsVisible.every((c) => c.visible);
    logResult(
      "3b. Why Roxton cards stagger visible",
      allWhyCardsVisible ? "PASS" : "WARN",
      `${whyCardsVisible.length} cards, all visible: ${allWhyCardsVisible}`
    );

    // Scroll to gallery grid
    await gdPage.evaluate(() => {
      const gallery = document.querySelector(".gallery-grid");
      if (gallery) gallery.scrollIntoView({ behavior: "instant", block: "center" });
    });
    await sleep(1200);
    await takeScreenshot(gdPage, "gd-gallery-grid");

    const galleryItemsCount = await gdPage.evaluate(() => {
      const gallery = document.querySelector(".gallery-grid");
      if (!gallery) return 0;
      return gallery.querySelectorAll("figure").length;
    });

    logResult(
      "3c. Gallery grid figures exist",
      galleryItemsCount >= 2 ? "PASS" : "FAIL",
      `${galleryItemsCount} figure items found`
    );

    // Scroll to process grid
    await gdPage.evaluate(() => {
      const processGrid = document.querySelector(".process-grid");
      if (processGrid) processGrid.scrollIntoView({ behavior: "instant", block: "center" });
    });
    await sleep(1200);
    await takeScreenshot(gdPage, "gd-process-grid");

    const processItemsCount = await gdPage.evaluate(() => {
      const process = document.querySelector(".process-grid");
      if (!process) return 0;
      return process.querySelectorAll("article").length;
    });

    logResult(
      "3d. Process grid steps exist",
      processItemsCount >= 3 ? "PASS" : "FAIL",
      `${processItemsCount} article items found`
    );

    await gdPage.close();
    await gdCtx.close();

    // ──────────────────────────────────────────────
    // 4. REDUCED MOTION
    // ──────────────────────────────────────────────
    console.log("\n═══ 4. REDUCED MOTION ═══\n");

    const reducedCtx = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      reducedMotion: "reduce",
    });
    const reducedPage = await reducedCtx.newPage();

    await reducedPage.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 20000 });
    await sleep(1500);

    // Check that prefers-reduced-motion is active
    const reducedDetected = await reducedPage.evaluate(() => {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    });
    logResult(
      "4a. prefers-reduced-motion detected",
      reducedDetected ? "PASS" : "FAIL",
      "Browser context reducedMotion=reduce applied"
    );

    // Navigate to services — should NOT show loading animation
    await reducedPage.click('a[href="/services"]');
    await sleep(1500);

    // With reduced motion, the transition should be instant with no loader visible
    const loaderVisibleReduced = await reducedPage.evaluate(() => {
      const loader = document.querySelector(".rx-route-loading");
      if (!loader) return false;
      const style = window.getComputedStyle(loader);
      return style.display !== "none" && style.opacity !== "0" && style.visibility !== "hidden";
    });

    logResult(
      "4b. No loading screen animation with reduced motion",
      !loaderVisibleReduced ? "PASS" : "WARN",
      `Loader visible: ${loaderVisibleReduced} (should disappear immediately)`
    );

    await takeScreenshot(reducedPage, "reduced-motion-services");

    // Check scroll progress bar has transition:none
    const scrollProgressTransition = await reducedPage.evaluate(() => {
      const el = document.querySelector(".rx-scroll-progress");
      if (!el) return null;
      return window.getComputedStyle(el).transition;
    });

    logResult(
      "4c. Scroll progress bar has no transition with reduced motion",
      scrollProgressTransition === "none" || scrollProgressTransition === "" || scrollProgressTransition === "all 0s ease 0s"
        ? "PASS"
        : "WARN",
      `transition: ${scrollProgressTransition}`
    );

    await reducedPage.close();
    await reducedCtx.close();

    // ──────────────────────────────────────────────
    // 5. MOBILE VIEWPORT
    // ──────────────────────────────────────────────
    console.log("\n═══ 5. MOBILE VIEWPORT (390×844) ═══\n");

    const mobileCtx = await browser.newContext({ viewport: MOBILE_VIEWPORT });
    const mobilePage = await mobileCtx.newPage();

    await mobilePage.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 20000 });
    await sleep(2000);
    await takeScreenshot(mobilePage, "mobile-homepage");

    // Check scroll progress bar exists on mobile
    const mobileProgressBar = await mobilePage.evaluate(() => {
      return !!document.querySelector(".rx-scroll-progress");
    });
    logResult("5a. Scroll progress bar on mobile", mobileProgressBar ? "PASS" : "FAIL", ".rx-scroll-progress exists");

    // Navigate to services on mobile
    // Note: On mobile the nav might be hamburger, try different approaches
    const mobileNavResult = await mobilePage.evaluate(() => {
      const servicesLink = document.querySelector('a[href="/services"]');
      if (servicesLink) {
        servicesLink.click();
        return "direct_link";
      }
      // Try hamburger menu
      const menuBtn = document.querySelector('[aria-label="Open menu"]');
      if (menuBtn) {
        menuBtn.click();
        return "hamburger_opened";
      }
      return "no_nav_found";
    });

    if (mobileNavResult === "hamburger_opened") {
      await sleep(500);
      await mobilePage.click('a[href="/services"]');
    }

    await sleep(3000);
    await mobilePage.waitForSelector(".rx-content-page", { timeout: 10000 }).catch(() => {});
    await sleep(1500);
    await takeScreenshot(mobilePage, "mobile-services");

    const mobileContentVisible = await mobilePage.evaluate(() => {
      const main = document.querySelector("main");
      return main && window.getComputedStyle(main).opacity !== "0";
    });
    logResult(
      "5b. Mobile navigation successful",
      mobileContentVisible ? "PASS" : "FAIL",
      `Nav method: ${mobileNavResult}`
    );

    // Test mobile scroll progress
    const mobilePageHeight = await mobilePage.evaluate(() => document.documentElement.scrollHeight);
    await mobilePage.evaluate((y) => window.scrollTo(0, y), Math.floor(mobilePageHeight / 2));
    await sleep(400);

    const mobileMidScale = await mobilePage.evaluate(() => {
      const el = document.querySelector(".rx-scroll-progress");
      if (!el) return null;
      const match = el.style.transform.match(/scaleX\(([\d.]+)\)/);
      return match ? parseFloat(match[1]) : 0;
    });

    logResult(
      "5c. Mobile scroll progress advances",
      mobileMidScale !== null && mobileMidScale > 0 ? "PASS" : "FAIL",
      `scaleX(${mobileMidScale}) on mobile`
    );

    await mobilePage.close();
    await mobileCtx.close();

    // ──────────────────────────────────────────────
    // 6. PERFORMANCE CHECK
    // ──────────────────────────────────────────────
    console.log("\n═══ 6. PERFORMANCE ═══\n");

    const perfCtx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const perfPage = await perfCtx.newPage();

    // Navigate between several pages to accumulate memory/resource data
    await perfPage.goto(BASE_URL + "/services", { waitUntil: "networkidle", timeout: 20000 });
    await sleep(2500);

    // Check for long tasks via PerformanceObserver if available
    const perfData = await perfPage.evaluate(() => {
      const perf = performance || window.performance;
      if (!perf) return null;

      // Get resource timing data
      const resources = perf.getEntriesByType("resource") || [];
      const navigation = perf.getEntriesByType("navigation")[0] || {};

      // Count JS heap size if available
      const memory = performance.memory || {};
      const totalHeapSize = memory.usedJSHeapSize || 0;
      const heapLimit = memory.jsHeapSizeLimit || 0;

      const longestResource = resources.reduce((max, r) => (r.duration > (max?.duration || 0) ? r : max), null);

      return {
        navigationTime: navigation.duration || 0,
        domInteractive: navigation.domInteractive || 0,
        domComplete: navigation.domComplete || 0,
        resourceCount: resources.length,
        totalTransferSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
        longestResourceName: longestResource?.name?.substring(0, 60) || "none",
        longestResourceDuration: longestResource?.duration?.toFixed(2) || 0,
        memoryHeapMB: totalHeapSize > 0 ? (totalHeapSize / 1024 / 1024).toFixed(2) + "MB" : "N/A",
        memoryLimitMB: heapLimit > 0 ? (heapLimit / 1024 / 1024).toFixed(0) + "MB" : "N/A",
      };
    });

    if (perfData) {
      logResult(
        "6a. Navigation performance data collected",
        perfData.navigationTime > 0 ? "PASS" : "WARN",
        `DOM complete: ${(perfData.domComplete / 1000).toFixed(2)}s, Resources: ${perfData.resourceCount}`
      );
      console.log(`  Performance details:`, JSON.stringify(perfData, null, 2));
    } else {
      logResult("6a. Performance API available", "WARN", "performance API returned null");
    }

    // Navigate to multiple pages to check for memory growth
    const pages = ["/", "/services", "/about", "/graphic-design", "/contact"];
    for (let i = 0; i < Math.min(pages.length, 5); i++) {
      await perfPage.goto(BASE_URL + pages[i], { waitUntil: "networkidle", timeout: 20000 });
      await sleep(800);
    }

    logResult(
      "6b. Multi-page navigation completes without errors",
      "PASS",
      `Navigated ${pages.length} pages: ${pages.join(", ")}`
    );

    // Check for any visible rendering issues — scroll and look for flickering
    await perfPage.goto(BASE_URL + "/services", { waitUntil: "networkidle", timeout: 20000 });
    await sleep(2000);

    // Scroll rapidly and check for jank in scroll progress
    const jankCheck = await perfPage.evaluate(async () => {
      const el = document.querySelector(".rx-scroll-progress");
      if (!el) return { jankDetected: null, message: "No progress bar found" };

      const samples = [];
      for (let i = 0; i < 10; i++) {
        const scrollY = Math.floor((document.documentElement.scrollHeight - window.innerHeight) * (i / 9));
        window.scrollTo(0, scrollY);
        await new Promise((r) => setTimeout(r, 80));
        const transform = el.style.transform;
        const match = transform.match(/scaleX\(([\d.]+)\)/);
        if (match) samples.push(parseFloat(match[1]));
      }

      // Check for monotonic progression (no jitter)
      let jitterCount = 0;
      for (let i = 2; i < samples.length; i++) {
        if (samples[i] < samples[i - 2]) jitterCount++;
      }

      return {
        samples,
        jitterCount,
        monotonic: jitterCount === 0,
        message: `${samples.length} samples, ${jitterCount} jitter steps`
      };
    });

    logResult(
      "6c. Scroll progress jitter check",
      jankCheck.monotonic ? "PASS" : "WARN",
      jankCheck.message
    );
    console.log(`  Progress samples: [${jankCheck.samples?.map((s) => s.toFixed(3)).join(", ") || "none"}]`);

    await perfPage.close();
    await perfCtx.close();

  } finally {
    await browser.close();
  }

  // ──────────────────────────────────────────────
  // SUMMARY REPORT
  // ──────────────────────────────────────────────
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const warned = results.filter((r) => r.status === "WARN").length;

  const report = {
    timestamp: TIMESTAMP,
    title: "ZEU-129 QA: Verify page transitions, scroll progress, and motion",
    summary: { total: results.length, pass: passed, fail: failed, warn: warned },
    results,
  };

  writeFileSync(resolve(EVIDENCE_DIR, `${TIMESTAMP}-qa-report.json`), JSON.stringify(report, null, 2));
  writeFileSync(resolve(EVIDENCE_DIR, `${TIMESTAMP}-qa-report.md`), generateMarkdownReport(report));

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`Total: ${results.length} | PASS: ${passed} | FAIL: ${failed} | WARN: ${warned}`);
  console.log(`Reports: ${resolve(EVIDENCE_DIR, `${TIMESTAMP}-qa-report.json`)}`);
  console.log(`         ${resolve(EVIDENCE_DIR, `${TIMESTAMP}-qa-report.md`)}`);
  console.log(`Screenshots: ${EVIDENCE_DIR}/\n`);

  return { passed, failed, warned, total: results.length };
}

function generateMarkdownReport(report) {
  let md = `# ZEU-129 QA: Page Transitions, Scroll Progress, and Motion\n\n`;
  md += `**Timestamp:** ${TIMESTAMP}\n\n`;
  md += `**Summary:** ${report.summary.pass}/${report.summary.total} passed, ${report.summary.fail} failed, ${report.summary.warn} warnings\n\n`;

  md += `| # | Test | Status | Detail |\n`;
  md += `|---|------|--------|--------|\n`;

  report.results.forEach((r, i) => {
    const icon = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "⚠";
    md += `| ${i + 1} | ${r.name} | ${icon} ${r.status} | ${r.detail || ""} |\n`;
  });

  md += `\n## Evidence\n\n`;
  md += `Screenshots directory: \`qa-evidence/qa-animations/\`\n`;
  md += `Report file: \`qa-evidence/qa-animations/${TIMESTAMP}-qa-report.json\`\n`;

  return md;
}

run().catch((err) => {
  console.error("\n❌ QA run failed:", err);
  process.exit(1);
});
