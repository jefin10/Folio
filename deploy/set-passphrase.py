#!/usr/bin/env python3
"""Create the Folio owner, or change the device passphrase. Runs ON THE SERVER.

Reads the passphrase from stdin (never argv), talks to GoTrue's admin API on
the loopback gateway with the service-role key from .env, and prints only
whether the owner was created or updated.
"""
import json
import os
import sys
import urllib.error
import urllib.request

OWNER = 'owner@folio.invalid'  # internal login identity, see packages/api/src/device.ts
passphrase = sys.stdin.read()
if len(passphrase) < 8:
    sys.exit('Use at least 8 characters.')

base = f"http://127.0.0.1:{os.environ.get('GATEWAY_PORT', '18080')}/auth/v1"
key = os.environ['SERVICE_ROLE_KEY']
headers = {'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}


def call(method, path, body=None):
    req = urllib.request.Request(base + path, method=method, headers=headers, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f'GoTrue said {e.code}: {e.read().decode()[:200]}')


users = call('GET', '/admin/users?per_page=100').get('users', [])
owner = next((u for u in users if u.get('email') == OWNER), None)
if owner:
    call('PUT', f"/admin/users/{owner['id']}", {'password': passphrase})
    print('✓ passphrase updated — existing devices stay signed in; new devices need the new one')
else:
    others = [u for u in users if u.get('email') != OWNER]
    if others:
        sys.exit('This instance already has a different owner; refusing to create another.')
    call('POST', '/admin/users', {'email': OWNER, 'password': passphrase, 'email_confirm': True})
    print('✓ owner created')
