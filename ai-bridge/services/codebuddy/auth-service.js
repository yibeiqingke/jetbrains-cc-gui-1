/** CodeBuddy authentication status helpers. */
import { loadCodeBuddySdk, requireSdk } from '../../utils/sdk-loader.js';
import { resolveCodeBuddyCliPath } from '../../utils/cli-path.js';

// A status check must never open an interactive login flow. The SDK first
// returns the cached account when one exists; otherwise this short timeout
// lets us report that the user needs to run `codebuddy cli` themselves.
const AUTH_STATUS_TIMEOUT_MS = 4000;

export async function getAuthStatus() {
  try {
    requireSdk('codebuddy');
    const sdk = await loadCodeBuddySdk();
    const authenticate = sdk?.unstable_v2_authenticate
      || sdk?.default?.unstable_v2_authenticate;
    if (typeof authenticate !== 'function') {
      return { success: false, authenticated: false, errorCode: 'AUTH_API_UNAVAILABLE' };
    }

    const result = await authenticate({
      pathToCodebuddyCode: resolveCodeBuddyCliPath() || undefined,
      timeout: AUTH_STATUS_TIMEOUT_MS,
      onAuthUrl: async () => {
        // Intentionally do not open or print the login URL during a status
        // probe. Authorization is only granted after the user logs in via CLI.
      },
    });
    const userinfo = result?.userinfo;
    return {
      success: true,
      authenticated: Boolean(userinfo?.userId && userinfo?.token),
      userName: userinfo?.userName || userinfo?.userNickname || '',
    };
  } catch (error) {
    const code = error?.code || error?.type;
    if (code === 'timeout' || /timed out|authentication/i.test(error?.message || '')) {
      return {
        success: true,
        authenticated: false,
        errorCode: 'CODEBUDDY_LOGIN_REQUIRED',
      };
    }
    return {
      success: false,
      authenticated: false,
      error: error?.message || String(error),
    };
  }
}
