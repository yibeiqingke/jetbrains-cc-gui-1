package com.github.claudecodegui.handler;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

/**
 * Unit tests for the TTL catalog cache backing {@link CliModelsHandler}.
 */
public class CliModelsCacheTest {

    private static final String PAYLOAD = "{\"provider\":\"codebuddy\",\"models\":[{\"id\":\"model-a\"}]}";

    @Test
    public void shouldReturnNullWhenNothingIsCached() {
        CliModelsCache cache = new CliModelsCache(180_000L, () -> 1_000L);

        assertNull(cache.getInternal("codebuddy"));
    }

    @Test
    public void shouldServeFreshPayloadWithinTtl() {
        long[] now = {1_000L};
        CliModelsCache cache = new CliModelsCache(180_000L, () -> now[0]);
        cache.putInternal("codebuddy", PAYLOAD);

        now[0] = 1_000L + 179_999L;

        assertEquals(PAYLOAD, cache.getInternal("codebuddy"));
    }

    @Test
    public void shouldExpirePayloadAfterTtl() {
        long[] now = {1_000L};
        CliModelsCache cache = new CliModelsCache(180_000L, () -> now[0]);
        cache.putInternal("codebuddy", PAYLOAD);

        now[0] = 1_000L + 180_001L;

        assertNull(cache.getInternal("codebuddy"));
    }

    @Test
    public void shouldNotServeStaleEntryAfterReput() {
        long[] now = {1_000L};
        CliModelsCache cache = new CliModelsCache(180_000L, () -> now[0]);
        cache.putInternal("codebuddy", PAYLOAD);
        now[0] = 200_000L;
        String fresh = "{\"provider\":\"codebuddy\",\"models\":[]}";
        cache.putInternal("codebuddy", fresh);
        now[0] = 200_000L + 100L;

        assertEquals(fresh, cache.getInternal("codebuddy"));
    }

    @Test
    public void shouldNotCacheProvidersWithoutInvalidationHook() {
        CliModelsCache cache = new CliModelsCache(180_000L, () -> 1_000L);
        cache.putInternal("dsh", PAYLOAD);

        assertNull(cache.getInternal("dsh"));
    }

    @Test
    public void shouldDropEntryOnInvalidate() {
        CliModelsCache cache = new CliModelsCache(180_000L, () -> 1_000L);
        cache.putInternal("codebuddy", PAYLOAD);

        cache.invalidateInternal("codebuddy");

        assertNull(cache.getInternal("codebuddy"));
    }

    @Test
    public void shouldIgnoreNullPayload() {
        CliModelsCache cache = new CliModelsCache(180_000L, () -> 1_000L);

        cache.putInternal("codebuddy", null);

        assertNull(cache.getInternal("codebuddy"));
    }
}
