import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MASKED_SECRET,
  mergeMaskedSecrets,
  redactCredentialProviderConfig,
} from '../../src/modules/security/secrets.js';

test('credential provider config redacts secret fields', () => {
  // Reading provider config must never expose plaintext secrets.
  const redacted = redactCredentialProviderConfig({
    oauth2: {
      authorizationUrl: 'https://auth.example.com',
      tokenUrl: 'https://token.example.com',
      clientId: 'client-id',
      clientSecret: 'super-secret',
      defaultScopes: ['read'],
    },
  });

  assert.equal(redacted?.oauth2?.clientSecret, MASKED_SECRET);
  assert.equal(redacted?.oauth2?.clientId, 'client-id');
});

test('masked values preserve existing secrets on merge', () => {
  // Update payloads using mask placeholders should keep stored secret values.
  const merged = mergeMaskedSecrets(
    {
      oauth2: {
        clientId: 'new-client-id',
        clientSecret: MASKED_SECRET,
      },
    },
    {
      oauth2: {
        clientId: 'old-client-id',
        clientSecret: 'kept-secret',
      },
    }
  );

  assert.equal(merged?.oauth2?.clientId, 'new-client-id');
  assert.equal(merged?.oauth2?.clientSecret, 'kept-secret');
});
