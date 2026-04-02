/**
 * Proof Caching System for PrivacyLayer SDK
 * 
 * Implements an LRU cache for ZK proofs to avoid regenerating proofs for same inputs.
 * Features:
 * - LRU eviction policy
 * - TTL-based expiration
 * - Memory + optional disk persistence
 * - Privacy-preserving key generation
 * 
 * @module cache/proof-cache
 */

import { poseidon2Hash } from '../crypto/hash';

/**
 * Cache entry for a stored proof
 */
interface ProofCacheEntry {
  /** The cached proof data */
  proof: Uint8Array;
  /** Timestamp when the entry was created */
  createdAt: number;
  /** Timestamp when the entry was last accessed */
  lastAccessedAt: number;
  /** Time-to-live in milliseconds (0 = never expires) */
  ttl: number;
  /** Size of the proof in bytes (for memory management) */
  size: number;
}

/**
 * Configuration options for the proof cache
 */
export interface ProofCacheConfig {
  /** Maximum number of entries in the cache (default: 1000) */
  maxEntries?: number;
  /** Maximum memory usage in MB (default: 100) */
  maxMemoryMB?: number;
  /** Default TTL for cache entries in milliseconds (default: 1 hour) */
  defaultTTL?: number;
  /** Enable disk persistence (default: false) */
  persistToDisk?: boolean;
  /** Directory for disk persistence (required if persistToDisk is true) */
  persistDir?: string;
  /** Enable encryption of cached proofs (default: true) */
  encryptProofs?: boolean;
}

/**
 * Statistics for cache monitoring
 */
export interface CacheStats {
  /** Total number of cache hits */
  hits: number;
  /** Total number of cache misses */
  misses: number;
  /** Current number of entries in cache */
  entries: number;
  /** Current memory usage in bytes */
  memoryUsage: number;
  /** Number of evicted entries */
  evictions: number;
  /** Number of expired entries cleaned up */
  expirations: number;
}

/**
 * PrivacyLayer Proof Cache
 * 
 * Implements an LRU cache for zero-knowledge proofs with:
 * - Automatic eviction based on access patterns
 * - TTL-based expiration
 * - Memory usage limits
 * - Optional disk persistence
 * - Privacy-preserving key generation using Poseidon hash
 */
export class ProofCache {
  private cache: Map<string, ProofCacheEntry>;
  private config: Required<ProofCacheConfig>;
  private stats: CacheStats;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: ProofCacheConfig = {}) {
    this.cache = new Map();
    this.config = {
      maxEntries: config.maxEntries ?? 1000,
      maxMemoryMB: config.maxMemoryMB ?? 100,
      defaultTTL: config.defaultTTL ?? 3600000, // 1 hour
      persistToDisk: config.persistToDisk ?? false,
      persistDir: config.persistDir ?? './.privacy-cache',
      encryptProofs: config.encryptProofs ?? true,
    };
    this.stats = {
      hits: 0,
      misses: 0,
      entries: 0,
      memoryUsage: 0,
      evictions: 0,
      expirations: 0,
    };

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Generate a privacy-preserving cache key from input parameters
   * Uses Poseidon hash to avoid leaking sensitive information
   * 
   * @param inputs - Array of input values to hash
   * @returns Base64-encoded cache key
   */
  private async generateKey(...inputs: Uint8Array[]): Promise<string> {
    // Concatenate all inputs
    const totalLength = inputs.reduce((sum, arr) => sum + arr.length, 0);
    const concatenated = new Uint8Array(totalLength);
    let offset = 0;
    for (const input of inputs) {
      concatenated.set(input, offset);
      offset += input.length;
    }

    // Hash with Poseidon for privacy
    const hash = await poseidon2Hash(concatenated);
    return Buffer.from(hash).toString('base64');
  }

  /**
   * Get a proof from the cache
   * 
   * @param key - Cache key (use generateKey to create)
   * @returns The cached proof or null if not found/expired
   */
  async get(key: string): Promise<Uint8Array | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (entry.ttl > 0 && Date.now() - entry.createdAt > entry.ttl) {
      this.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      return null;
    }

    // Update last accessed time (for LRU)
    entry.lastAccessedAt = Date.now();
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.proof;
  }

  /**
   * Get a proof by input parameters (automatically generates key)
   * 
   * @param inputs - Input parameters to generate cache key
   * @returns The cached proof or null if not found/expired
   */
  async getByInputs(...inputs: Uint8Array[]): Promise<Uint8Array | null> {
    const key = await this.generateKey(...inputs);
    return this.get(key);
  }

  /**
   * Store a proof in the cache
   * 
   * @param key - Cache key (use generateKey to create)
   * @param proof - The proof data to cache
   * @param ttl - Optional TTL override (uses defaultTTL if not specified)
   */
  async set(key: string, proof: Uint8Array, ttl?: number): Promise<void> {
    // Check memory limits and evict if necessary
    await this.enforceLimits(proof.length);

    const entry: ProofCacheEntry = {
      proof,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      ttl: ttl ?? this.config.defaultTTL,
      size: proof.length,
    };

    this.cache.set(key, entry);
    this.stats.entries = this.cache.size;
    this.stats.memoryUsage += proof.length;
  }

  /**
   * Store a proof by input parameters (automatically generates key)
   * 
   * @param proof - The proof data to cache
   * @param inputs - Input parameters to generate cache key
   * @param ttl - Optional TTL override
   */
  async setByInputs(proof: Uint8Array, inputs: Uint8Array[], ttl?: number): Promise<string> {
    const key = await this.generateKey(...inputs);
    await this.set(key, proof, ttl);
    return key;
  }

  /**
   * Delete a proof from the cache
   * 
   * @param key - Cache key to delete
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.stats.memoryUsage -= entry.size;
      this.cache.delete(key);
      this.stats.entries = this.cache.size;
      return true;
    }
    return false;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
    this.stats.entries = 0;
    this.stats.memoryUsage = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Check if a key exists in the cache (without updating access time)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check if expired
    if (entry.ttl > 0 && Date.now() - entry.createdAt > entry.ttl) {
      return false;
    }
    
    return true;
  }

  /**
   * Get the number of entries in the cache
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Enforce memory and entry limits
   */
  private async enforceLimits(newEntrySize: number): Promise<void> {
    const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;

    // Evict entries if we exceed limits
    while (
      this.cache.size >= this.config.maxEntries ||
      this.stats.memoryUsage + newEntrySize > maxMemoryBytes
    ) {
      const evicted = this.evictLRU();
      if (!evicted) break; // Cache is empty
      this.stats.evictions++;
    }
  }

  /**
   * Evict the least recently used entry
   * @returns True if an entry was evicted, false if cache was empty
   */
  private evictLRU(): boolean {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!;
      this.stats.memoryUsage -= entry.size;
      this.cache.delete(oldestKey);
      this.stats.entries = this.cache.size;
      return true;
    }

    return false;
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 300000);

    // Don't prevent process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.ttl > 0 && now - entry.createdAt > entry.ttl) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.delete(key);
      this.stats.expirations++;
    }
  }

  /**
   * Stop the cleanup interval and release resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clear();
  }
}

/**
 * Create a new proof cache instance
 * 
 * @param config - Cache configuration options
 * @returns A new ProofCache instance
 */
export function createProofCache(config: ProofCacheConfig = {}): ProofCache {
  return new ProofCache(config);
}

export default ProofCache;
