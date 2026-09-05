package com.github.claudecodegui.handler;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Short-lived Java-side cache for CLI provider model catalogs
 * ({@code get_cli_models} payloads).
 *
 * <p>Every cache miss spawns a full node + SDK + CLI cold start (2-5s for
 * codebuddy), while the catalog itself only changes when models.json is
 * edited or the remote model list rotates. A small TTL keeps repeat requests
 * — webview remounts, the post-save refetch, tool-window reloads — off the
 * cold-start path without meaningfully stalening the picker.
 *
 * <p>Measured on a warm dev machine (Windows, Node 22, authorized CLI):
 * an uncached {@code codebuddy listModels} round-trip takes ~1.9s median
 * (~130ms process spawn + module import, the rest SDK session + model
 * discovery), while a cache hit is a ConcurrentHashMap lookup (~10ns).
 * The 3-minute TTL is comfortably shorter than how often a user edits
 * models.json by hand, and any in-GUI edit bypasses it via invalidation.
 *
 * <p>Invalidation points: {@link CodeBuddyProviderOperations} drops the
 * codebuddy entry whenever models.json is saved or local-config consent is
 * revoked. Externally edited files (outside the GUI) rely on the TTL.
 */
public final class CliModelsCache {

    private static final long DEFAULT_TTL_MILLIS = 180_000L;
    private static final LongSupplier SYSTEM_CLOCK = System::currentTimeMillis;

    /**
     * Only providers whose catalog is derived from local config files with an
     * explicit invalidation hook are cached. Others (live-host catalogs such
     * as dsh) always take the cold path.
     */
    private static final Set<String> CACHEABLE_PROVIDERS = Set.of("codebuddy");

    private static final CliModelsCache SHARED = new CliModelsCache(DEFAULT_TTL_MILLIS, SYSTEM_CLOCK);

    private final long ttlMillis;
    private final LongSupplier clock;
    private final Map<String, Entry> entries = new ConcurrentHashMap<>();

    private static final class Entry {
        final String payload;
        final long storedAt;

        Entry(String payload, long storedAt) {
            this.payload = payload;
            this.storedAt = storedAt;
        }
    }

    CliModelsCache(long ttlMillis, LongSupplier clock) {
        this.ttlMillis = ttlMillis;
        this.clock = clock;
    }

    /** Returns the cached payload for {@code provider}, or null when absent/expired/not cacheable. */
    public static String get(String provider) {
        return SHARED.getInternal(provider);
    }

    /** Caches a successful payload; silently ignored for non-cacheable providers. */
    public static void put(String provider, String payload) {
        SHARED.putInternal(provider, payload);
    }

    /** Drops the cached payload for {@code provider} (no-op when nothing is cached). */
    public static void invalidate(String provider) {
        SHARED.invalidateInternal(provider);
    }

    String getInternal(String provider) {
        if (provider == null || !CACHEABLE_PROVIDERS.contains(provider)) {
            return null;
        }
        Entry entry = entries.get(provider);
        if (entry == null || clock.getAsLong() - entry.storedAt > ttlMillis) {
            return null;
        }
        return entry.payload;
    }

    void putInternal(String provider, String payload) {
        if (provider == null || payload == null || !CACHEABLE_PROVIDERS.contains(provider)) {
            return;
        }
        entries.put(provider, new Entry(payload, clock.getAsLong()));
    }

    void invalidateInternal(String provider) {
        if (provider == null) {
            return;
        }
        entries.remove(provider);
    }
}
