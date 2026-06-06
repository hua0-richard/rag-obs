---
title: Gradient Descent and Optimization
tags: [optimization, machine-learning, math, deep-learning, example]
---

# Gradient Descent and Optimization

Gradient descent is the workhorse optimization algorithm behind most machine
learning models. The intuition is simple: to minimize a loss function, repeatedly
take a step in the direction of steepest descent — the negative gradient. Almost
everything else in this note (momentum, Adam, learning-rate schedules,
normalization) is a refinement of that one idea, designed to make the steps more
stable, faster, or better-behaved on the messy loss surfaces of deep networks.
This note covers the math, several from-scratch implementations, and the
conceptual trade-offs that decide whether training converges quickly, slowly, or
not at all.

## 1. The update rule (math)

Given parameters $\theta$ and a loss function $J(\theta)$, each step nudges the
parameters against the gradient:

$$
\theta_{t+1} = \theta_t - \eta \, \nabla_\theta J(\theta_t)
$$

Here $\eta$ is the **learning rate** and $\nabla_\theta J(\theta_t)$ is the
gradient of the loss with respect to the parameters. The gradient points in the
direction of steepest *ascent*, so we negate it to descend. The learning rate
controls how far we move along that direction on each step.

For a single linear-regression weight $w$ with mean-squared error over $n$
examples, the loss is

$$
J(w) = \frac{1}{n} \sum_{i=1}^{n} \left( w x_i - y_i \right)^2,
$$

and its gradient is $\nabla_w J = \frac{2}{n} \sum_{i=1}^{n} x_i (w x_i - y_i)$.
The factor of $2$ is often folded into $\eta$ in practice, so you will frequently
see the cleaner form $\nabla_w J = \frac{1}{n} \sum_i x_i (w x_i - y_i)$.

### Why the gradient is the steepest direction

For a small step $\Delta\theta$, a first-order Taylor expansion gives
$J(\theta + \Delta\theta) \approx J(\theta) + \nabla_\theta J^\top \Delta\theta$.
Among all unit-length directions, the one that decreases $J$ the most is the one
anti-parallel to $\nabla_\theta J$ — this is exactly why we step along
$-\nabla_\theta J$. The learning rate is the magnitude we attach to that unit
direction.

## 2. A from-scratch implementation (code)

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

### Mini-batch gradient descent

In practice neither full-batch nor single-sample is ideal: full-batch is accurate
but slow per step, and single-sample is fast but noisy. **Mini-batches** strike
the balance — average the gradient over a small batch (typically 32–512 examples),
which smooths the estimate while keeping steps cheap and GPU-friendly:

```python
import random

def minibatch_epoch(w, xs, ys, lr=0.01, batch_size=32):
    idx = list(range(len(xs)))
    random.shuffle(idx)
    for start in range(0, len(idx), batch_size):
        batch = idx[start:start + batch_size]
        n = len(batch)
        g = (2.0 / n) * sum(xs[i] * (w * xs[i] - ys[i]) for i in batch)
        w -= lr * g
    return w
```

### Checking gradients numerically

Before trusting an analytic gradient, it is worth verifying it against a finite
difference. The two-sided estimate
$\frac{\partial J}{\partial \theta} \approx \frac{J(\theta + \epsilon) - J(\theta - \epsilon)}{2\epsilon}$
should match your analytic gradient to several decimal places:

```python
def numeric_grad(loss_fn, w, eps=1e-6):
    return (loss_fn(w + eps) - loss_fn(w - eps)) / (2 * eps)
```

## 3. Why the learning rate matters (concepts)

The learning rate $\eta$ is the single most important hyperparameter, and choosing
it is a balancing act rather than a calculation:

- **Too small** and convergence crawls — each step barely moves the parameters,
  so you waste compute and may never reach the minimum within your step budget.
- **Too large** and the updates overshoot the minimum, bouncing back and forth or
  diverging entirely as the loss climbs instead of falling.
- **Just right** and the loss falls steeply at first, then flattens as the
  gradient shrinks near the minimum.

A useful diagnostic is the **learning-rate range test**: start with a tiny rate
and increase it geometrically each step while plotting the loss. The loss falls,
reaches a sweet spot, then explodes; a good starting rate sits just below the
point where the curve turns sharply upward.

### Learning-rate schedules

Because a fixed rate is rarely ideal throughout training, practitioners decay
$\eta$ over time. Common schedules include **step decay** (cut the rate by a
factor every few epochs), **exponential decay**
$\eta_t = \eta_0 e^{-\lambda t}$, and **cosine annealing**, which follows

$$
\eta_t = \eta_{\min} + \tfrac{1}{2}(\eta_0 - \eta_{\min})\left(1 + \cos\frac{\pi t}{T}\right).
$$

A short **warmup** — linearly ramping the rate up over the first few hundred
steps before decaying — is standard for training large models, where a cold start
at full rate can destabilize the early updates.

## 4. Momentum and adaptive methods (math + concepts)

Plain SGD takes a step proportional to the current gradient only, so it zig-zags
across narrow ravines and stalls on plateaus. **Momentum** accumulates an
exponentially-decayed running average of past gradients, letting the optimizer
build up speed in consistent directions and damp oscillations:

$$
v_{t+1} = \beta v_t + (1 - \beta)\nabla_\theta J(\theta_t), \qquad
\theta_{t+1} = \theta_t - \eta \, v_{t+1}
$$

with $\beta$ typically around $0.9$. **Adam** goes further, maintaining a separate
adaptive rate per parameter from running estimates of both the first moment (mean
$m_t$) and second moment (uncentered variance $v_t$) of the gradients:

$$
m_t = \beta_1 m_{t-1} + (1-\beta_1) g_t, \qquad
v_t = \beta_2 v_{t-1} + (1-\beta_2) g_t^2,
$$

$$
\hat m_t = \frac{m_t}{1 - \beta_1^t}, \quad
\hat v_t = \frac{v_t}{1 - \beta_2^t}, \quad
\theta_{t+1} = \theta_t - \eta \, \frac{\hat m_t}{\sqrt{\hat v_t} + \varepsilon}.
$$

The $\hat m_t$, $\hat v_t$ are bias-corrected because $m_0$ and $v_0$ start at
zero, which would otherwise bias the early estimates toward zero. Here is Adam
for a single scalar parameter:

```python
def adam(grad_fn, w0=0.0, lr=0.001, b1=0.9, b2=0.999, eps=1e-8, steps=1000):
    w, m, v = w0, 0.0, 0.0
    for t in range(1, steps + 1):
        g = grad_fn(w)
        m = b1 * m + (1 - b1) * g
        v = b2 * v + (1 - b2) * g * g
        m_hat = m / (1 - b1 ** t)
        v_hat = v / (1 - b2 ** t)
        w -= lr * m_hat / (v_hat ** 0.5 + eps)
    return w
```

Adam converges quickly and is forgiving about the initial learning rate, which is
why it is the default for most deep-learning work. Well-tuned plain SGD with
momentum can generalize slightly better on some vision tasks, so it is still used
where squeezing out the last bit of test accuracy matters.

## 5. Convex vs non-convex landscapes (concepts)

For a **convex** loss surface — a single bowl with one bottom — gradient descent
provably converges to the global minimum given a small enough learning rate.
Linear and logistic regression have convex losses, which is why they are reliable
to train. Neural networks are **non-convex**: their loss surfaces are riddled with
local minima, saddle points, and flat plateaus.

In high dimensions the dominant obstacle is not local minima but **saddle points**
— places where the gradient vanishes but the surface curves up in some directions
and down in others. Momentum-based methods help the optimizer roll through saddle
points rather than stalling on them. In practice deep networks still train well
because most local minima yield similar loss, so finding *a* good minimum is
usually enough.

## 6. Vanishing and exploding gradients (concepts)

In deep networks the gradient is a product of many layer-wise terms (the chain
rule). If those terms are consistently below one, the product shrinks toward zero
as it propagates backward — the **vanishing gradient** problem, which stalls
learning in early layers. If they are consistently above one, the product blows
up — **exploding gradients**, which destabilize training. The standard mitigations
are: ReLU-style activations that do not saturate, careful weight initialization
(e.g. He or Xavier scaling), normalization layers (batch/layer norm), residual
connections that give gradients a short path, and **gradient clipping**, which
rescales the gradient when its norm exceeds a threshold:

```python
def clip_grad(g, max_norm=1.0):
    norm = sum(x * x for x in g) ** 0.5
    if norm > max_norm:
        scale = max_norm / (norm + 1e-12)
        g = [x * scale for x in g]
    return g
```

## 7. Practical checklist (concepts)

- **Normalize inputs** so features share a scale; gradient descent converges far
  faster on a well-conditioned, roughly spherical loss surface than on a stretched
  one.
- **Start with Adam** at $\eta = 10^{-3}$ as a sane default, then tune.
- **Watch the loss curve.** Diverging or NaN loss almost always means the learning
  rate is too high (or the gradients are exploding).
- **Use a schedule** with warmup + decay for anything large.
- **Shuffle each epoch** so mini-batches are not correlated across passes.
- **Gradient-check** any hand-derived gradient before trusting it.

The takeaway: the same simple update rule, $\theta \leftarrow \theta - \eta \nabla J$,
behaves very differently depending on the shape of the surface it is descending
and the refinements layered on top of it.
