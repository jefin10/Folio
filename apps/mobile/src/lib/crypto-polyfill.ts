// Hermes may lack crypto.randomUUID / getRandomValues; idempotency keys need them.
import * as Crypto from 'expo-crypto';

const g = globalThis as unknown as { crypto?: { randomUUID?: () => string; getRandomValues?: <T extends ArrayBufferView>(a: T) => T } };
g.crypto = g.crypto ?? {};
if (!g.crypto.randomUUID) g.crypto.randomUUID = () => Crypto.randomUUID();
if (!g.crypto.getRandomValues) g.crypto.getRandomValues = <T extends ArrayBufferView>(a: T) => Crypto.getRandomValues(a as never) as unknown as T;
