---
title: Gradient Descent and Optimization
tags: [optimization, machine-learning, math, example]
---

# Gradient Descent and Optimization

Gradient descent is the workhorse optimization algorithm behind most machine
learning models. The intuition is simple: to minimize a loss function, repeatedly
take a step in the direction of steepest descent — the negative gradient. This
note covers the math, a from-scratch implementation, and the conceptual
trade-offs that decide whether training converges quickly, slowly, or not at all.

## The update rule (math)

Given parameters $\theta$ and a loss function $J(\theta)$, each step nudges the
parameters against the gradient:

$$
\theta_{t+1} = \theta_t - \eta \, \nabla_\theta J(\theta_t)
$$

Here $\eta$ is the **learning rate** and $\nabla_\theta J(\theta_t)$ is the
gradient of the loss with respect to the parameters. For a single linear
regression weight $w$ with mean-squared error over $n$ examples, the loss is

$$
J(w) = \frac{1}{n} \sum_{i=1}^{n} \left( w x_i - y_i \right)^2,
$$

and its gradient is $\nabla_w J = \frac{2}{n} \sum_{i=1}^{n} x_i (w x_i - y_i)$.
The factor of $2$ is often folded into $\eta$ in practice, so you will frequently
see the cleaner form $\nabla_w J = \frac{1}{n} \sum_i x_i (w x_i - y_i)$.

## A from-scratch implementation (code)

The math above maps almost line-for-line onto code. Below, `grad` computes the
gradient and `descend` runs the update loop:

```python
def grad(w, xs, ys):
    n = len(xs)
    return (2.0 / n) * sum(x * (w * x - y) for x, y in zip(xs, ys))


def descend(xs, ys, lr=0.01, steps=1000, w0=0.0):
    w = w0
    for _ in range(steps):
        w -= lr * grad(w, xs, ys)
    return w
```

A common refinement is **stochastic** gradient descent (SGD), which estimates the
gradient from one example (or a small batch) per step instead of the full
dataset:

```python
import random

def sgd_step(w, xs, ys, lr=0.01):
    i = random.randrange(len(xs))
    g = 2.0 * xs[i] * (w * xs[i] - ys[i])  # single-sample gradient estimate
    return w - lr * g
```

## Why the learning rate matters (concepts)

The learning rate $\eta$ is the single most important hyperparameter, and choosing
it is a balancing act rather than a calculation:

- **Too small** and convergence crawls — each step barely moves the parameters,
  so you waste compute and may never reach the minimum within your step budget.
- **Too large** and the updates overshoot the minimum, bouncing back and forth or
  diverging entirely as the loss climbs instead of falling.
- **Just right** and the loss falls steeply at first, then flattens as the
  gradient shrinks near the minimum.

Because a fixed rate is rarely ideal throughout training, practitioners use
**learning-rate schedules** that decay $\eta$ over time, or adaptive optimizers
like Adam and RMSProp that maintain a separate effective rate per parameter.

## Convex vs non-convex landscapes (concepts)

For a **convex** loss surface — a single bowl with one bottom — gradient descent
provably converges to the global minimum given a small enough learning rate.
Linear and logistic regression have convex losses, which is why they are reliable
to train. Neural networks are **non-convex**: their loss surfaces are riddled with
local minima, saddle points, and flat plateaus. In practice, deep networks still
train well because most local minima yield similar loss, and momentum-based
methods help the optimizer roll through saddle points rather than stalling on
them. The takeaway: the same update rule behaves very differently depending on
the shape of the surface it is descending.
