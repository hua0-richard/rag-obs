---
title: Binary Search Trees
tags: [data-structures, algorithms, code, example]
---

# Binary Search Trees

A binary search tree (BST) is a node-based data structure where every node has at
most two children, and the **BST invariant** holds at every node: all keys in the
left subtree are smaller than the node's key, and all keys in the right subtree
are larger. This ordering is what makes search, insertion, and deletion run in
time proportional to the height of the tree.

## Node definition

```python
class Node:
    def __init__(self, key, value=None):
        self.key = key
        self.value = value
        self.left = None
        self.right = None
```

## Search

Searching walks down from the root, going left when the target is smaller and
right when it is larger, until it finds the key or falls off the tree:

```python
def search(node, key):
    while node is not None:
        if key == node.key:
            return node
        node = node.left if key < node.key else node.right
    return None
```

## Insertion

Insertion follows the same path as search, then attaches a new node at the empty
slot where the key would have been:

```python
def insert(node, key, value=None):
    if node is None:
        return Node(key, value)
    if key < node.key:
        node.left = insert(node.left, key, value)
    elif key > node.key:
        node.right = insert(node.right, key, value)
    else:
        node.value = value  # key already present: update in place
    return node
```

## In-order traversal

An in-order traversal of a BST visits keys in sorted order — a direct consequence
of the invariant:

```python
def inorder(node, out):
    if node is None:
        return
    inorder(node.left, out)
    out.append(node.key)
    inorder(node.right, out)
```

## Complexity and balance

Search, insert, and delete are all O(h) where h is the tree height. For a
**balanced** tree, h is about log n, giving fast O(log n) operations. But a BST
built by inserting already-sorted keys degenerates into a linked list with h = n
and O(n) operations. Self-balancing variants — AVL trees and red-black trees —
perform rotations during insertion and deletion to keep the height logarithmic,
guaranteeing O(log n) worst-case behavior regardless of insertion order.
