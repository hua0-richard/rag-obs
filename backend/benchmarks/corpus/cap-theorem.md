---
title: The CAP Theorem
tags: [distributed-systems, databases, concepts, example]
---

# The CAP Theorem

The CAP theorem is a foundational result in distributed systems. It states that a
distributed data store can simultaneously provide at most two of three guarantees:
consistency, availability, and partition tolerance. Understanding the theorem is
less about memorizing the acronym and more about reasoning through the trade-off it
forces on every real system.

## The three guarantees

**Consistency** means every read receives the most recent write or an error. All
nodes see the same data at the same time, so the system behaves as if there were a
single up-to-date copy.

**Availability** means every request receives a non-error response, without the
guarantee that it contains the most recent write. The system stays responsive even
when some nodes are struggling.

**Partition tolerance** means the system continues to operate despite network
partitions — dropped or delayed messages between nodes. In any real distributed
system spanning machines or data centers, partitions are not optional; they happen.

## Why you only get two

Because partitions are unavoidable in practice, partition tolerance is effectively
mandatory. That reduces the real choice to a single decision that only matters
*during* a partition: when nodes cannot talk to each other, do you preserve
consistency or availability?

If you choose **consistency**, a node that cannot confirm it has the latest data
must refuse to answer, sacrificing availability. If you choose **availability**,
every node answers with whatever data it has, risking a stale or conflicting
response and sacrificing consistency. When there is no partition, a well-designed
system can offer both consistency and availability; the trade-off only bites when
the network fails.

## CP versus AP systems

Systems are often labeled by the pair they favor under partition. **CP systems**
prioritize consistency and may become unavailable during a partition — traditional
relational databases and coordination services like ZooKeeper lean this way. **AP
systems** prioritize availability and accept eventual consistency, reconciling
divergent copies once the partition heals — many NoSQL stores such as Cassandra and
DynamoDB are designed this way.

## Beyond CAP: PACELC

A common criticism of CAP is that it only describes behavior during partitions and
ignores the normal case. The **PACELC** extension addresses this: if there is a
partition (P), choose between availability and consistency (A/C); else (E), during
normal operation, choose between latency (L) and consistency (C). PACELC captures
the everyday reality that even without failures, stronger consistency usually costs
more latency, because it requires more coordination between nodes.
