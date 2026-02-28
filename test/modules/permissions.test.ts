import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasPermissionFromRoles,
  isKnownPermission,
} from '../../src/modules/authz/permissions.js';

test('known permissions are recognized', () => {
  assert.equal(isKnownPermission('agent:create'), true);
  assert.equal(isKnownPermission('unknown:permission'), false);
});

test('permission checks match expected role policy', () => {
  // Spot-check core permission matrix behavior used by middleware.
  assert.equal(hasPermissionFromRoles(['admin'], 'user:create'), true);
  assert.equal(hasPermissionFromRoles(['tenant_admin'], 'user:create'), false);
  assert.equal(hasPermissionFromRoles(['agent_creator'], 'agent:create'), true);
  assert.equal(hasPermissionFromRoles([], 'agent:create'), false);
});
