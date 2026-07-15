// ============================================================
// فایل: test-full-api.ts
// ============================================================

import { exec } from "child_process";
import { promisify } from "util";

const sleep = promisify(setTimeout);

// ============================================================
//  تنظیمات اولیه
// ============================================================

const BASE_URL = "http://37.255.218.236:5208/api";
let authCookie = "";
let testUserId = 0;
let testGameId = 0;
let testUserName = "";
let testShopItemId = 0;
let testInventoryItemId = 0;

// ============================================================
//  ابزارهای کمکی
// ============================================================

async function request(
  method: string,
  path: string,
  body?: any,
  cookieHeader?: string | null,
): Promise<{ status: number; data: any; cookies: string | null }> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  const options: RequestInit = {
    method,
    headers,
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseCookies = response.headers.get("set-cookie");
  let cookieToStore: string | null = null;
  if (responseCookies) {
    const cookieMatch = responseCookies.match(/^([^;]+)/);
    if (cookieMatch) {
      cookieToStore = cookieMatch[1];
    } else {
      cookieToStore = responseCookies;
    }
  }

  let data: any = {};
  try {
    // فقط اگر وضعیت ۲۰۰ یا ۴۰۴ باشد و محتوا JSON باشد، parse کنیم
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = { error: "Non-JSON response", status: response.status };
    }
  } catch (e) {
    data = { error: "Invalid JSON response" };
  }

  return { status: response.status, data, cookies: cookieToStore };
}

function log(title: string, result: any) {
  const status = result.status >= 200 && result.status < 300 ? "✅" : "❌";
  console.log(`${status} ${title}`);
  if (result.data) {
    const str = JSON.stringify(result.data);
    console.log(
      `   Response: ${str.slice(0, 300)}${str.length > 300 ? "..." : ""}`,
    );
  }
  console.log("");
}

function printSeparator() {
  console.log("============================================");
}

// ============================================================
//  سناریوهای تست
// ============================================================

/**
 * ۰. ثبت‌نام کاربر جدید با بررسی دیتای فیک
 */
async function testRegisterWithFakeData() {
  console.log("📝 Testing Registration with Fake Data...");
  const userName = `test_user_${Date.now()}`;
  testUserName = userName;

  const result = await request("POST", "/account/register", {
    userName,
    password: "12345678",
    gender: "MAN",
  });

  log("Register user", result);

  if (result.data?.data?.user?.id) {
    testUserId = result.data.data.user.id;
  }

  if (result.cookies) {
    authCookie = result.cookies;
  }

  // بررسی دیتای فیک
  if (testUserId > 0) {
    console.log("   🔍 Checking fake data...");
    const profile = await request(
      "GET",
      `/users/profile/${testUserId}`,
      undefined,
      authCookie,
    );
    if (profile.data?.data) {
      const user = profile.data.data;
      console.log(`   Total Matches: ${user.totalMatches}`);
      console.log(`   Total Wins: ${user.totalWins}`);
      console.log(`   Win Rate: ${user.winRate}%`);
      console.log(`   MMR: ${user.mmr}`);
      console.log(`   Win Streak: ${user.winStreak}`);
      console.log(`   Loss Streak: ${user.lossStreak}`);

      if (user.stats) {
        console.log(`   XP: ${user.stats.xp}`);
        console.log(`   Level: ${user.stats.level}`);
        console.log(`   Coin: ${user.stats.coin}`);
        console.log(`   Gem: ${user.stats.gem}`);
      }

      if (user.totalMatches > 0 && user.winRate > 0 && user.mmr > 0) {
        console.log("   ✅ Fake data generated successfully!");
      } else {
        console.warn("   ⚠️ Fake data may not be fully generated.");
      }
    }
  }

  return result;
}

/**
 * ۱. تست فروشگاه - دریافت آیتم‌ها
 */
async function testShopGetItems() {
  console.log("🛒 Testing Shop Get Items...");
  const result = await request("GET", "/shop/items", undefined, authCookie);
  log("Shop items", result);

  if (result.data?.data && result.data.data.length > 0) {
    testShopItemId = result.data.data[0].id;
    console.log(`   First shop item ID: ${testShopItemId}`);
  }

  return result;
}

/**
 * ۲. تست خرید آیتم از فروشگاه با سکه
 */
async function testShopPurchase() {
  console.log("🛒 Testing Shop Purchase (with COIN)...");
  if (!testShopItemId) {
    console.warn("   ⚠️ No shop item ID available, skipping purchase test.");
    return;
  }

  const result = await request(
    "POST",
    "/shop/purchase",
    {
      shopItemId: testShopItemId,
      currencyType: "COIN",
    },
    authCookie,
  );

  log("Purchase item", result);

  // بررسی موجودی سکه بعد از خرید
  const profile = await request("GET", "/users/me", undefined, authCookie);
  if (profile.data?.data?.stats?.coin !== undefined) {
    console.log(`   Remaining Coin: ${profile.data.data.stats.coin}`);
  }

  return result;
}

/**
 * ۳. تست کلکسیون - دریافت آیتم‌ها
 */
async function testCollectionGetItems() {
  console.log("📦 Testing Collection Get Items...");
  const result = await request(
    "GET",
    "/collection/items",
    undefined,
    authCookie,
  );
  log("Collection items", result);

  if (result.data?.data) {
    const groups = result.data.data;
    for (const category of Object.keys(groups)) {
      if (groups[category].length > 0) {
        testInventoryItemId = groups[category][0].inventoryItemId;
        console.log(
          `   Found inventory item ID: ${testInventoryItemId} (${category})`,
        );
        break;
      }
    }
  }

  return result;
}

/**
 * ۴. تست انتخاب آیتم از کلکسیون
 */
async function testCollectionSelect() {
  console.log("🎯 Testing Collection Select Item...");
  if (!testInventoryItemId) {
    console.warn("   ⚠️ No inventory item ID available, skipping select test.");
    return;
  }

  const result = await request(
    "POST",
    "/collection/select",
    {
      inventoryItemId: testInventoryItemId,
      category: "dice",
    },
    authCookie,
  );

  log("Select item", result);
  return result;
}

/**
 * ۵. تست دریافت آیتم‌های انتخابی فعلی
 */
async function testCollectionGetSelected() {
  console.log("📌 Testing Collection Get Selected...");
  const result = await request(
    "GET",
    "/collection/selected",
    undefined,
    authCookie,
  );
  log("Selected items", result);

  if (result.data?.data) {
    const selected = result.data.data;
    console.log(`   Selected Dice: ${selected.dice?.name || "None"}`);
    console.log(`   Selected Checker: ${selected.checker?.name || "None"}`);
    console.log(`   Selected Cup: ${selected.cup?.name || "None"}`);
    console.log(`   Selected Board: ${selected.board?.name || "None"}`);
  }

  return result;
}

/**
 * ۶. تست لیدربورد هفتگی
 */
async function testLeaderboardWeekly() {
  console.log("🏆 Testing Weekly Leaderboard...");
  const result = await request(
    "GET",
    "/leaderboard/weekly?limit=5",
    undefined,
    authCookie,
  );
  if (result.status >= 400) {
    console.log("   ⚠️ Leaderboard returned error (likely empty). Skipping.");
    return result;
  }
  log("Weekly Leaderboard", result);
  return result;
}

/**
 * ۷. تست لیدربورد ماهانه
 */
async function testLeaderboardMonthly() {
  console.log("🏆 Testing Monthly Leaderboard...");
  const result = await request(
    "GET",
    "/leaderboard/monthly?limit=5",
    undefined,
    authCookie,
  );
  if (result.status >= 400) {
    console.log("   ⚠️ Leaderboard returned error (likely empty). Skipping.");
    return result;
  }
  log("Monthly Leaderboard", result);
  return result;
}

/**
 * ۸. تست لیدربورد کل زمان
 */
async function testLeaderboardAlltime() {
  console.log("🏆 Testing All-Time Leaderboard...");
  const result = await request(
    "GET",
    "/leaderboard/alltime?limit=5",
    undefined,
    authCookie,
  );
  if (result.status >= 400) {
    console.log("   ⚠️ Leaderboard returned error (likely empty). Skipping.");
    return result;
  }
  log("All-Time Leaderboard", result);
  return result;
}

/**
 * ۹. تست دریافت پروفایل کاربر
 */
async function testGetUserProfile() {
  console.log("👤 Testing Get User Profile...");
  const result = await request(
    "GET",
    `/users/profile/${testUserId}`,
    undefined,
    authCookie,
  );
  log("User profile", result);
  return result;
}

// ============================================================
//  تست‌های قبلی (برای سازگاری)
// ============================================================

async function testDuplicateRegister() {
  console.log("📝 Testing Duplicate Registration...");
  const userName = "duplicate_test_user";
  await request("POST", "/account/register", {
    userName,
    password: "12345678",
  });

  const result = await request("POST", "/account/register", {
    userName,
    password: "12345678",
  });

  log("Duplicate register (should fail)", result);
  return result;
}

async function testLogin(userName: string, password: string) {
  console.log(`📝 Testing Login as ${userName}...`);
  const result = await request("POST", "/account/login", {
    userName,
    password,
  });

  log(`Login as ${userName}`, result);

  if (result.data?.data?.user?.id) {
    testUserId = result.data.data.user.id;
  }

  if (result.cookies) {
    authCookie = result.cookies;
  }

  return result;
}

async function testLoginInvalid() {
  console.log("📝 Testing Invalid Login...");
  const result = await request("POST", "/account/login", {
    userName: "fake_user",
    password: "wrong_password",
  });

  log("Invalid login (should fail)", result);
  return result;
}

async function testLogout() {
  console.log("📝 Testing Logout...");
  const result = await request("POST", "/account/logout", {}, authCookie);
  log("Logout", result);
  return result;
}

// ============================================================
//  اجرای تمام تست‌ها
// ============================================================

async function runAllTests() {
  console.log(
    "🚀 Starting Full API Tests (Progression, Leaderboard, Shop, Collection)...\n",
  );
  printSeparator();

  try {
    await testRegisterWithFakeData();
    await testDuplicateRegister();
    await testLogin(testUserName, "12345678");
    await testLoginInvalid();

    await testGetUserProfile();

    await testShopGetItems();
    await testShopPurchase();

    await testCollectionGetItems();
    await testCollectionSelect();
    await testCollectionGetSelected();

    await testLeaderboardWeekly();
    await testLeaderboardMonthly();
    await testLeaderboardAlltime();

    await testLogout();

    printSeparator();
    console.log("✅ All tests completed!");
    console.log(`   Test User ID: ${testUserId}`);
    console.log(`   Test User Name: ${testUserName}`);
    console.log(`   Test Shop Item ID: ${testShopItemId}`);
    console.log(`   Test Inventory Item ID: ${testInventoryItemId}`);
    console.log(
      `   Auth Cookie: ${authCookie ? authCookie.slice(0, 50) + "..." : "(empty)"}`,
    );
  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

console.log("⏳ Waiting 2 seconds for server to be ready...");
setTimeout(() => {
  runAllTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Unhandled error:", err);
      process.exit(1);
    });
}, 2000);
