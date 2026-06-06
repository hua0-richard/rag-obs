---
title: Caching Strategies
tags: [systems, performance, code, example]
---

# Caching Strategies

A cache stores copies of data in a fast, nearby layer so repeated reads avoid the
slower source of truth. The hard parts are deciding *how* the cache and database
stay in sync, and *what* to evict when the cache fills up.

## Read strategies

**Cache-aside** (lazy loading) is the most common pattern: the application checks
the cache first, and on a miss, loads from the database and populates the cache.

```python
def get_user(user_id, cache, db):
    cached = cache.get(user_id)
    if cached is not None:
        return cached            # cache hit
    user = db.query(user_id)     # cache miss: fall back to the source
    cache.set(user_id, user, ttl=300)
    return user
```

**Read-through** pushes that logic into the cache layer itself, so the application
always talks to the cache and the cache loads from the database on a miss.

## Write strategies

- **Write-through** writes to the cache and the database synchronously, keeping
  them consistent at the cost of higher write latency.
- **Write-back** (write-behind) writes to the cache immediately and flushes to the
  database asynchronously — fast, but risks data loss if the cache fails before the
  flush.
- **Write-around** writes straight to the database and lets the cache populate
  lazily on the next read, avoiding cache churn from write-heavy workloads.

## Eviction policies

When the cache is full, an eviction policy decides what to drop. **LRU** (least
recently used) evicts the entry untouched for the longest, a good default for most
workloads. **LFU** (least frequently used) evicts the least-accessed entry, better
when popularity is stable over time. **TTL**-based expiry drops entries after a
fixed lifetime regardless of access, bounding staleness.

## Invalidation

The famous saying is that there are only two hard things in computer science:
cache invalidation and naming things. Stale cache entries are the most common
caching bug. A short TTL bounds staleness automatically; explicit invalidation on
write keeps data fresher but adds coupling between the write path and the cache.
