import { describe, it, expect } from 'vitest';
import { sha256 } from '../../client/src/utils/hash-utils';

describe('hash-utils', () => {
  it('should compute the SHA-256 hash of a string', async () => {
    const hash = await sha256('hello world');
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('should produce a different hash for a different string', async () => {
    const hash1 = await sha256('hello world');
    const hash2 = await sha256('hello there');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty strings', async () => {
    const hash = await sha256('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
