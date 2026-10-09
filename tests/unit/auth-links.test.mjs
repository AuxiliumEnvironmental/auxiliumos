import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const errorsUrl = moduleUrl(transpile(await readFile(new URL('../../web/src/lib/errors.ts', import.meta.url), 'utf8')));
const source = transpile(await readFile(new URL('../../web/src/lib/auth-links.ts', import.meta.url), 'utf8'));
const { consumePasswordLink, recoveryRedirect, validateNewPassword } = await import(moduleUrl(source.replace(/from\s+["']\.\/errors["']/, `from '${errorsUrl}'`)));
const base = 'https://workspace.example.invalid/';
const tokens = 'access_token=synthetic-access&refresh_token=synthetic-refresh&token_type=bearer';

test('only invite/recovery implicit callbacks are accepted and history is cleared before returning credentials', () => {
  for (const kind of ['invite', 'recovery']) {
    let cleaned;
    const link = consumePasswordLink(`${base}?auth=${kind}&next=https://untrusted.example#${tokens}&type=${kind}`, (url) => { cleaned = url; });
    assert.equal(cleaned, '/');
    assert.deepEqual(link, { kind, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh' });
  }
});

test('expired, duplicate, contradictory, query-token, malformed and unsupported callbacks fail closed and scrub history', () => {
  const links = [
    `${base}?auth=invite#error=access_denied&error_description=provider-secret`,
    `${base}?auth=recovery#${tokens}&type=invite`,
    `${base}documents#${tokens}&type=recovery`,
    `${base}#${tokens}&type=signup`,
    `${base}#${tokens}&type=recovery&type=invite`,
    `${base}?access_token=query-token#${tokens}&type=recovery`,
    `${base}?code=pkce-code&auth=recovery`,
    `${base}?token_hash=otp-token&type=invite`,
    `${base}?auth=invite`,
    `${base}#access_token=synthetic-access&type=invite`,
  ];
  for (const href of links) {
    let cleaned;
    const link = consumePasswordLink(href, (url) => { cleaned = url; });
    assert.equal(cleaned, '/');
    assert.equal(link.kind, 'invalid');
    assert.equal(link.error.code, 'credentials');
    assert.equal(JSON.stringify(link).includes('provider-secret'), false);
    assert.equal('accessToken' in link, false);
  }
});

test('cleanup failure never returns URL credentials and ordinary navigation is untouched', () => {
  const failed = consumePasswordLink(`${base}#${tokens}&type=invite`, () => { throw Error('browser history denied'); });
  assert.equal(failed.kind, 'invalid');
  assert.equal(failed.error.code, 'storage');
  assert.equal('accessToken' in failed, false);
  assert.equal(consumePasswordLink(`${base}facilities?account=synthetic#heading`, () => { assert.fail('ordinary URL changed'); }), null);
});

test('recovery redirect cannot inherit an external return target and password confirmation is exact', () => {
  assert.equal(recoveryRedirect('https://workspace.example.invalid/path?next=https://untrusted.example'), `${base}?auth=recovery`);
  assert.throws(() => validateNewPassword('too short', 'too short'), { code: 'validation' });
  assert.throws(() => validateNewPassword('synthetic-password', 'synthetic-password '), { code: 'validation' });
  assert.doesNotThrow(() => validateNewPassword('synthetic-password', 'synthetic-password'));
});
