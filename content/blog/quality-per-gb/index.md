---
title: Quality per GB
date: 2026-09-20
summary: Comparing low-bit models fairly across sizes.
tags: [Local AI]
draft: true
---

Bigger models score higher, but they also need more memory. Comparing a 27B model with a 4B model on
accuracy alone ignores that cost.

## A simple measure

Divide a quality score by the size of the model in GB. One published approach takes the negative log
of the error rate and divides that by model size, so a small model that keeps most of its quality
wins.

## How I will test it

Fix a task set, build the same model at several bit widths and plot the result. The memory
calculator on the Lab page covers the size side.

> Fix the task set first, then vary one thing.
