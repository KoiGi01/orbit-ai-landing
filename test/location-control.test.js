import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountProvisioningEnabled,
  normalizeLocationMembers,
  resolveWorkspaceView,
} from '../lib/server/clerk-control.js';

test('normalizes one location owner and deduplicates assigned users', () => {
  assert.deepEqual(
    normalizeLocationMembers('OWNER@EXAMPLE.COM', [
      { email: 'team@example.com', role: 'org:member' },
      { email: 'owner@example.com', role: 'org:member' },
      'second@example.com',
    ]),
    [
      { email: 'owner@example.com', role: 'org:admin' },
      { email: 'team@example.com', role: 'org:member' },
      { email: 'second@example.com', role: 'org:member' },
    ],
  );
});

test('rejects unsupported location roles', () => {
  assert.throws(
    () => normalizeLocationMembers('owner@example.com', [
      { email: 'team@example.com', role: 'org:superuser' },
    ]),
    (error) => error.code === 'invalid_location_role',
  );
});

test('allows billing-deferred locations through onboarding and provisioning', () => {
  const onboarding = {
    billingStatus: 'not_required',
    onboardingStatus: 'needs_onboarding',
    serviceStatus: 'locked',
    profileComplete: true,
  };
  const provisioning = {
    ...onboarding,
    onboardingStatus: 'configuring',
    serviceStatus: 'provisioning',
  };
  const live = {
    ...onboarding,
    onboardingStatus: 'active',
    serviceStatus: 'live',
  };

  assert.equal(accountProvisioningEnabled(onboarding), true);
  assert.equal(resolveWorkspaceView(onboarding), 'onboarding');
  assert.equal(resolveWorkspaceView(provisioning), 'provisioning');
  assert.equal(resolveWorkspaceView(live), 'live');
});
