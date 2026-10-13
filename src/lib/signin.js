import { sameDocument } from './watch.js';

// Spotting a sign-in page where the watched content should be, so that it is
// reported as "sign in needed" instead of being saved as a new version.

export const SIGN_IN_MESSAGE = 'The page asked you to sign in';

// Paths and host names that sign-in pages commonly use: /login, /sign-in,
// /users/sign_in, /oauth/authorize, accounts.example.com, example.okta.com...
const SIGN_IN_PATH = /(?:^|[/_.-])(?:log-?in|log_in|sign-?in|sign_in|log-?on|sign-?on|auth|authenticate|authorize|sso|saml2?|oauth2?|cas|servicelogin)(?:[/_.-]|$)/i;
const SIGN_IN_HOST = /^(?:login|signin|auth|sso|accounts?|idp|id)\.|\.(?:okta|oktapreview|auth0|onelogin)\.com$/i;
const SIGN_IN_TITLE = /\b(?:log\s?in|sign\s?in|log\s?on|sign\s?on)\b/i;

function parse(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function signInPath(u) {
  return SIGN_IN_PATH.test(u.pathname) || /\/session\/new\/?$/i.test(u.pathname);
}

export function looksLikeSignInUrl(url) {
  const u = parse(url);
  return Boolean(u) && (SIGN_IN_HOST.test(u.hostname) || signInPath(u));
}

// Whether a check landed on a sign-in page.
//   status:     HTTP status of the response
//   watchUrl:   the address being watched
//   finalUrl:   where the page ended up after redirects
//   signInForm: the page has a password or username field
//   title:      the page title
//   found:      the watch's selected parts were found
// A watch whose own address is a sign-in page (/login...) is never reported,
// so watching a login page for changes keeps working.
export function needsSignIn({ status = 200, watchUrl, finalUrl = watchUrl, signInForm = false, title = '', found = true }) {
  const watched = parse(watchUrl);
  if (!watched || signInPath(watched)) return false;
  if (status === 401) return true;
  const moved = !sameDocument(watchUrl, finalUrl);
  if (moved && looksLikeSignInUrl(finalUrl)) return true;
  if (!signInForm) return false;
  return !found || moved || SIGN_IN_TITLE.test(title);
}

export function signInError() {
  const e = new Error(SIGN_IN_MESSAGE);
  e.signIn = true;
  return e;
}
