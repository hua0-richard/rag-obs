---
title: Bayes' Theorem
tags: [probability, statistics, math, example]
---

# Bayes' Theorem

Bayes' theorem describes how to update the probability of a hypothesis in light of
new evidence. It is the mathematical backbone of Bayesian inference, spam
filtering, medical diagnosis, and much of modern machine learning.

## The formula

For a hypothesis $H$ and evidence $E$, the theorem states

$$
P(H \mid E) = \frac{P(E \mid H)\, P(H)}{P(E)}.
$$

Each term has a name:

- $P(H)$ is the **prior** — your belief in $H$ before seeing the evidence.
- $P(E \mid H)$ is the **likelihood** — how probable the evidence is if $H$ is true.
- $P(E)$ is the **marginal likelihood** or evidence — the total probability of $E$.
- $P(H \mid E)$ is the **posterior** — your updated belief after seeing $E$.

## Expanding the denominator

The evidence term is usually computed by the **law of total probability**, summing
the likelihood over every hypothesis. For a binary hypothesis $H$ and its
complement $\neg H$,

$$
P(E) = P(E \mid H)\, P(H) + P(E \mid \neg H)\, P(\neg H).
$$

## Worked example: medical testing

Suppose a disease affects $1\%$ of a population, so $P(H) = 0.01$. A test has a
$90\%$ true-positive rate, $P(E \mid H) = 0.9$, and a $5\%$ false-positive rate,
$P(E \mid \neg H) = 0.05$. The probability of actually having the disease given a
positive test is

$$
P(H \mid E) = \frac{0.9 \times 0.01}{0.9 \times 0.01 + 0.05 \times 0.99}
            = \frac{0.009}{0.0585} \approx 0.154.
$$

So even with a positive result, there is only about a $15\%$ chance of having the
disease. This counterintuitive result — driven by the low prior — is the classic
illustration of the **base rate fallacy**: when a condition is rare, even an
accurate test produces many false positives relative to true positives.

## The odds form

Bayes' theorem is often cleaner in odds form. The **posterior odds** equal the
**prior odds** times the **likelihood ratio**:

$$
\frac{P(H \mid E)}{P(\neg H \mid E)} = \frac{P(H)}{P(\neg H)} \cdot \frac{P(E \mid H)}{P(E \mid \neg H)}.
$$

This makes sequential updating easy: the posterior from one observation becomes
the prior for the next, and independent pieces of evidence simply multiply their
likelihood ratios together.
