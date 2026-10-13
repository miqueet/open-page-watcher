import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeSignInUrl, needsSignIn, signInError } from '../src/lib/signin.js';

const watchUrl = 'https://shop.example.com/orders';

test('recognizes common sign-in addresses', () => {
  for (const url of [
    'https://example.com/login?next=/orders',
    'https://example.com/users/sign_in',
    'https://example.com/account/sign-in',
    'https://example.com/oauth/authorize?client_id=1',
    'https://example.com/session/new',
    'https://accounts.google.com/ServiceLogin',
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    'https://acme.okta.com/app/x',
    'https://example.com/cas/login',
  ]) assert.equal(looksLikeSignInUrl(url), true, url);
  for (const url of [
    'https://example.com/author/jane',
    'https://example.com/blog/logging-tips',
    'https://example.com/showcase',
    'https://example.com/designing-for-users',
    'not a url',
  ]) assert.equal(looksLikeSignInUrl(url), false, url);
});

test('a 401 answer needs a sign-in', () => {
  assert.equal(needsSignIn({ status: 401, watchUrl }), true);
  assert.equal(needsSignIn({ status: 403, watchUrl }), false);
  assert.equal(needsSignIn({ status: 500, watchUrl }), false);
});

test('a redirect to a sign-in page needs a sign-in', () => {
  assert.equal(needsSignIn({ watchUrl, finalUrl: 'https://shop.example.com/login?return=/orders' }), true);
  assert.equal(needsSignIn({ watchUrl, finalUrl: 'https://accounts.example.com/' }), true);
  assert.equal(needsSignIn({ watchUrl, finalUrl: 'https://shop.example.com/orders/' }), false);
  assert.equal(needsSignIn({ watchUrl, finalUrl: 'https://shop.example.com/sale' }), false);
});

test('a sign-in form counts only with another sign', () => {
  // Selected parts missing and a password field instead.
  assert.equal(needsSignIn({ watchUrl, signInForm: true, found: false }), true);
  // Whole page that is titled like a sign-in page.
  assert.equal(needsSignIn({ watchUrl, signInForm: true, title: 'Sign in to Shop' }), true);
  // Redirected somewhere with a sign-in form.
  assert.equal(needsSignIn({ watchUrl, finalUrl: 'https://shop.example.com/', signInForm: true }), true);
  // A page with a login box in the sidebar, where the content was found.
  assert.equal(needsSignIn({ watchUrl, signInForm: true, title: 'Forum index' }), false);
  // Selected parts missing, but no sign-in form: an ordinary "not found".
  assert.equal(needsSignIn({ watchUrl, found: false, title: 'Log in' }), false);
});

test('watching a sign-in page itself is never reported', () => {
  const login = 'https://example.com/login';
  assert.equal(needsSignIn({ status: 401, watchUrl: login }), false);
  assert.equal(needsSignIn({ watchUrl: login, signInForm: true, title: 'Log in' }), false);
});

test('sign-in errors are marked', () => {
  const e = signInError();
  assert.equal(e.signIn, true);
  assert.match(e.message, /sign in/);
});
