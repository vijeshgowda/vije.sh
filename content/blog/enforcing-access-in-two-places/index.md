---
title: Enforcing access in two places
date: 2026-09-28
summary: Why gateway rules alone are not enough, and what each layer should check.
tags: [Engineering]
draft: true
---

A gateway can check who is calling and which route they may use. It cannot know whether this user
may edit that record.

## Coarse at the edge

Put route-level rules at the gateway: signed in or not, which role, which API product. These checks
are cheap, uniform and easy to audit.

## Fine inside the service

Each service checks the record-level rule, because only it has the data. Never assume the gateway
already did.

> Two checks cost a few milliseconds. One missing check costs an incident.

The trade-off is duplication. Keep the rules in a shared library and test them once.
