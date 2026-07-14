// test-api.ts
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

  const data = await response.json();
  return { status: response.status, data, cookies: cookieToStore };
}

function log(title: string, result: any) {
  const status = result.status >= 200 && result.status < 300 ? "✅" : "❌";
  console.log(`${status} ${title}`);
  if (result.data) {
    const str = JSON.stringify(result.data);
    console.log(
      `   Response: ${str.slice(0, 200)}${str.length > 200 ? "..." : ""}`,
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
 * 1. ثبت‌نام کاربر جدید
 */
async function testRegister() {
  console.log("📝 Testing Registration...");
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

  return result;
}

/**
 * 2. ثبت‌نام تکراری (باید خطا بدهد)
 */
async function testDuplicateRegister() {
  console.log("📝 Testing Duplicate Registration...");
  // ابتدا یک کاربر با نام ثابت بسازیم تا تکراری باشد
  const userName = "duplicate_test_user";
  await request("POST", "/account/register", {
    userName,
    password: "12345678",
  });

  // حالا دوباره با همان نام ثبت‌نام کنیم (باید خطا بدهد)
  const result = await request("POST", "/account/register", {
    userName,
    password: "12345678",
  });

  log("Duplicate register (should fail)", result);
  return result;
}

/**
 * 3. ورود با اعتبار صحیح
 */
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

/**
 * ۴. ورود با اعتبار نادرست (باید خطا بدهد)
 */
async function testLoginInvalid() {
  console.log("📝 Testing Invalid Login...");
  const result = await request("POST", "/account/login", {
    userName: "fake_user",
    password: "wrong_password",
  });

  log("Invalid login (should fail)", result);
  return result;
}

/**
 * ۵. خروج از حساب
 */
async function testLogout() {
  console.log("📝 Testing Logout...");
  const result = await request("POST", "/account/logout", {}, authCookie);
  log("Logout", result);
  return result;
}

/**
 * ۶. تغییر رمز عبور (با کاربری که رمز دارد)
 */
async function testChangePassword() {
  console.log("📝 Testing Change Password...");

  // 1. ثبت‌نام کاربر جدید با رمز
  const userName = `change_pass_user_${Date.now()}`;
  const regResult = await request("POST", "/account/register", {
    userName,
    password: "12345678",
    gender: "MAN",
  });

  if (regResult.status !== 200) {
    console.error("❌ Register failed for change password test");
    log("Register for change password", regResult);
    return;
  }

  // 2. ورود
  const loginResult = await testLogin(userName, "12345678");
  if (loginResult.status !== 200) {
    console.error("❌ Login failed for change password test");
    return;
  }

  // 3. تغییر رمز
  const result = await request(
    "POST",
    "/account/password/change",
    {
      oldPassword: "12345678",
      newPassword: "87654321",
    },
    authCookie,
  );
  log("Change password", result);

  // ۴. تست ورود با رمز جدید
  console.log("   Testing login with new password...");
  const loginResult2 = await testLogin(userName, "87654321");
  log("Login with new password", loginResult2);

  // ۵. برگشت به رمز قبلی (برای تست‌های بعدی)
  await testLogin(userName, "87654321");
  await request(
    "POST",
    "/account/password/change",
    {
      oldPassword: "87654321",
      newPassword: "12345678",
    },
    authCookie,
  );

  return result;
}

/**
 * ۷. دریافت اطلاعات کاربر فعلی
 */
async function testGetMe() {
  console.log("📝 Testing Get Current User...");
  const result = await request("GET", "/users/me", undefined, authCookie);
  log("Get /me", result);

  if (result.data?.data?.id) {
    testUserId = result.data.data.id;
  }

  return result;
}

/**
 * ۸. دریافت پروفایل کاربر دیگر
 */
async function testGetProfile(userId: number) {
  console.log(`📝 Testing Get User Profile (${userId})...`);
  const result = await request(
    "GET",
    `/users/profile/${userId}`,
    undefined,
    authCookie,
  );
  log(`Get profile of user ${userId}`, result);
  return result;
}

/**
 * ۹. بروزرسانی پروفایل
 */
async function testUpdateProfile() {
  console.log("📝 Testing Update Profile...");

  // اطمینان از اینکه کاربر لاگین است
  if (!authCookie) {
    console.error("❌ No auth cookie, skipping update profile");
    return;
  }

  const result = await request(
    "PUT",
    `/users/profile/${testUserId}`,
    {
      phoneNumber: "09123456789",
      gender: "MAN",
      level: 5,
      provinceId: 1,
      cityId: 1,
      avatar: "https://example.com/avatar.jpg",
      frame: "gold",
      title: "Master",
    },
    authCookie,
  );

  log("Update profile", result);
  return result;
}

/**
 * 1۰. دریافت لیست استان‌ها
 */
async function testGetProvinces() {
  console.log("📝 Testing Get Provinces...");
  const result = await request(
    "GET",
    "/location/provinces",
    undefined,
    authCookie,
  );
  log("Get provinces", result);
  return result;
}

/**
 * 11. دریافت شهرهای یک استان
 */
async function testGetCities(provinceId: number) {
  console.log(`📝 Testing Get Cities for province ${provinceId}...`);
  const result = await request(
    "GET",
    `/location/provinces/${provinceId}/cities`,
    undefined,
    authCookie,
  );
  log(`Get cities for province ${provinceId}`, result);
  return result;
}

/**
 * 12. دریافت presetهای تایمر
 */
async function testGetTimerPresets() {
  console.log("📝 Testing Get Timer Presets...");
  const result = await request("GET", "/timer-presets", undefined, authCookie);
  log("Get timer presets", result);
  return result;
}

/**
 * 13. ایجاد preset تایمر جدید
 */
async function testCreateTimerPreset() {
  console.log("📝 Testing Create Timer Preset...");

  const result = await request(
    "POST",
    "/timer-presets",
    {
      name: `test_preset_${Date.now()}`,
      primarySeconds: 15,
      secondarySeconds: 150,
      leagueLevel: 1,
      gameType: "casual",
      isDefault: false,
    },
    authCookie,
  );

  log("Create timer preset", result);
  return result;
}

/**
 * 1۴. دریافت دسته‌بندی‌های مینی‌چت
 */
async function testGetCategories() {
  console.log("📝 Testing Get MiniChat Categories...");
  const result = await request(
    "GET",
    "/miniChat/categories",
    undefined,
    authCookie,
  );
  log("Get miniChat categories", result);
  return result;
}

/**
 * 1۵. ایجاد بازی
 */
async function testCreateGame() {
  console.log("📝 Testing Create Game...");

  // اطمینان از اینکه کاربر لاگین است
  if (!authCookie) {
    console.error("❌ No auth cookie, skipping create game");
    return;
  }

  const result = await request(
    "POST",
    "/games",
    { whitePlayerId: testUserId },
    authCookie,
  );

  log("Create game", result);

  if (result.data?.data?.id) {
    testGameId = result.data.data.id;
  }

  return result;
}

/**
 * 1۶. مچ‌میکینگ (دو کاربر)
 */
async function testMatchmaking() {
  console.log("📝 Testing Matchmaking...");

  // کاربر اول وارد صف می‌شود (از قبل لاگین است)
  const result1 = await request(
    "POST",
    "/games/join",
    { userId: testUserId, roomType: "CASUAL_1" },
    authCookie,
  );

  log("User 1 joined matchmaking", result1);

  // یک کاربر تست دوم بسازیم و وارد صف کنیم
  const userName2 = `test_user_2_${Date.now()}`;
  const regResult = await request("POST", "/account/register", {
    userName: userName2,
    password: "12345678",
  });

  if (regResult.data?.data?.user?.id) {
    const userId2 = regResult.data.data.user.id;

    // کاربر دوم وارد صف می‌شود
    const result2 = await request(
      "POST",
      "/games/join",
      { userId: userId2, roomType: "CASUAL_1" },
      regResult.cookies,
    );

    log("User 2 joined matchmaking", result2);

    if (result2.data?.data?.gameId) {
      testGameId = result2.data.data.gameId;
    }
  }

  return result1;
}

/**
 * 1۷. دریافت تاریخچه بازی
 */
async function testGetHistory(gameId: number) {
  console.log(`📝 Testing Get Game History (${gameId})...`);
  const result = await request(
    "GET",
    `/history/${gameId}`,
    undefined,
    authCookie,
  );
  log(`Get history of game ${gameId}`, result);
  return result;
}

// ============================================================
//  اجرای تمام تست‌ها
// ============================================================

async function runAllTests() {
  console.log("🚀 Starting API Tests...\n");
  printSeparator();

  try {
    // ===== مرحله 1: احراز هویت =====
    await testRegister();
    await testDuplicateRegister();
    await testLogin(testUserName, "12345678"); // login با کاربر ثبت‌نام‌شده
    await testLoginInvalid();

    // ===== مرحله 2: پروفایل =====
    await testGetMe();
    await testUpdateProfile();
    await testGetProfile(testUserId);

    // ===== مرحله 3: تغییر رمز =====
    await testChangePassword();

    // ===== مرحله ۴: مکان =====
    await testGetProvinces();
    await testGetCities(1);

    // ===== مرحله ۵: تایمر =====
    await testGetTimerPresets();
    await testCreateTimerPreset();

    // ===== مرحله ۶: مینی‌چت =====
    await testGetCategories();

    // ===== مرحله ۷: بازی‌ها =====
    await testCreateGame();
    await testMatchmaking();

    // ===== مرحله ۸: تاریخچه =====
    if (testGameId > 0) {
      await testGetHistory(testGameId);
    }

    // ===== مرحله ۹: خروج =====
    await testLogout();

    // ===== نتیجه نهایی =====
    printSeparator();
    console.log("✅ All tests completed!");
    console.log(`   Test User ID: ${testUserId}`);
    console.log(`   Test Game ID: ${testGameId}`);
    console.log(`   Test User Name: ${testUserName}`);
    console.log(
      `   Auth Cookie: ${authCookie ? authCookie.slice(0, 50) + "..." : "(empty)"}`,
    );
  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

// ============================================================
//  اجرا
// ============================================================

console.log("⏳ Waiting 2 seconds for server to be ready...");
setTimeout(() => {
  runAllTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Unhandled error:", err);
      process.exit(1);
    });
}, 2000);
