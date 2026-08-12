// Where the browser is.
//
// The suites used to name `/opt/pw-browsers/chromium` outright, which is where
// it lives in one particular container and nowhere else — so every one of them
// would have failed on CI and on anybody else's machine. Playwright finds its
// own browser by default; the environment variable is only for hosts that keep
// it somewhere else.
export const launchOptions = process.env.PLAYWRIGHT_CHROMIUM
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
  : {};
