import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveImpersonationTarget } from '../lib/server/clerk-control.js';

const MEMBERSHIPS = [
  { publicUserData: { userId: 'user_client_admin', identifier: 'ana@dentalnorte.mx' } },
  { publicUserData: { userId: 'user_client_member', identifier: 'recepcion@dentalnorte.mx' } },
];

test('resolves a member of the location into an impersonation target', () => {
  assert.deepEqual(
    resolveImpersonationTarget(
      MEMBERSHIPS,
      { organizationId: 'org_dental_norte', userId: 'user_client_member' },
      'user_operator',
    ),
    {
      organizationId: 'org_dental_norte',
      targetUserId: 'user_client_member',
      email: 'recepcion@dentalnorte.mx',
    },
  );
});

test('refuses a user id that is not a member of the location', () => {
  // The id arrives from the browser, so a caller who edits it must not be able
  // to mint a token for somebody else's Location.
  assert.throws(
    () => resolveImpersonationTarget(
      MEMBERSHIPS,
      { organizationId: 'org_dental_norte', userId: 'user_from_another_clinic' },
      'user_operator',
    ),
    (error) => error.status === 404 && error.code === 'impersonation_target_not_a_member',
  );
});

test('refuses an empty membership list rather than trusting the request', () => {
  for (const memberships of [[], null, undefined]) {
    assert.throws(
      () => resolveImpersonationTarget(
        memberships,
        { organizationId: 'org_dental_norte', userId: 'user_client_member' },
        'user_operator',
      ),
      (error) => error.code === 'impersonation_target_not_a_member',
    );
  }
});

test('refuses to impersonate the operator themselves', () => {
  assert.throws(
    () => resolveImpersonationTarget(
      [{ publicUserData: { userId: 'user_operator', identifier: 'contact@autivexai.com' } }],
      { organizationId: 'org_dental_norte', userId: 'user_operator' },
      'user_operator',
    ),
    (error) => error.status === 400 && error.code === 'cannot_impersonate_self',
  );
});

test('requires both a location and a target', () => {
  for (const raw of [{ userId: 'user_client_member' }, { organizationId: 'org_dental_norte' }, {}]) {
    assert.throws(
      () => resolveImpersonationTarget(MEMBERSHIPS, raw, 'user_operator'),
      (error) => error.status === 400 && error.code === 'invalid_impersonation_request',
    );
  }
});
