---
title: "please /find-skills for apple liquid glass design"
description: Claude Code session ffdbef35 on 2026-03-04
tags:
  - stimulus/conversations
  - branch/main
type: conversation
status: active
created: 2026-03-04
updated: 2026-03-04
session_id: ffdbef35-9371-4c4f-b5f0-a604b9928f30
branch: main
related:
  - "[[Conversations]]"
  - "[[CLAUDE]]"
---

# please /find-skills for apple liquid glass design

| Field | Value |
|-------|-------|
| **Session** | `ffdbef35-9371-4c4f-b5f0-a604b9928f30` |
| **Date** | 2026-03-04 |
| **Duration** | 1m |
| **Turns** | 2 |
| **Branch** | `main` |
| **Claude Code** | v2.1.42 |
| **Messages** | 45 |

## Tools Used

`Bash`, `Skill`

## Conversation Thread

> [!quote] **User** (00:15)
> please /find-skills for apple liquid glass design

> [!example] Tool Calls
>> [!note] **Skill**
>> Skill: `find-skills`
>> Args: apple liquid glass design

> [!quote] **User** (00:15)
> Base directory for this skill: /Users/broomva/.claude/skills/find-skills
> 
> **Find Skills**
> 
> This skill helps you discover and install skills from the open agent skills ecosystem.
> 
> **When to Use This Skill**
> 
> Use this skill when the user:
> 
> - Asks "how do I do X" where X might be a common task with an existing skill
> - Says "find a skill for X" or "is there a skill for X"
> - Asks "can you do X" where X is a specialized capability
> - Expresses interest in extending agent capabilities
> - Wants to search for tools, templates, or workflows
> - Mentions they wish they had help with a specific domain (design, testing, deployment, etc.)
> 
> **What is the Skills CLI?**
> 
> The Skills CLI (`npx skills`) is the package manager for the open agent skills ecosystem. Skills are modular packages that extend agent capabilities with specialized knowledge, workflows, and tools.
> 
> **Key commands:**
> 
> - `npx skills find [query]` - Search for skills interactively or by keyword
> - `npx skills add ` - Install a skill from GitHub or other sources
> - `npx skills check` - Check for skill updates
> - `npx skills update` - Update all installed skills
> 
> **Browse skills at:** https://skills.sh/
> 
> **How to Help Users Find Skills**
> 
> **Step 1: Understand What They Need**
> 
> When a user asks for help with something, identify:
> 
> 1. The domain (e.g., React, testing, design, deployment)
> 2. The specific task (e.g., writing tests, creating animations, reviewing PRs)
> 3. Whether this is a common enough task that a skill likely exists
> 
> **Step 2: Search for Skills**
> 
> Run the find command with a relevant query:
> 
> ```bash
> npx skills find [query]
> ```
> 
> For example:
> 
> - User asks "how do I make my React app faster?" → `npx skills find react performance`
> - User asks "can you help me with PR reviews?" → `npx skills find pr review`
> - User asks "I need to create a changelog" → `npx skills find changelog`
> 
> The command will return results like:
> 
> ```
> Install with npx skills add 
> 
> vercel-labs/agent-skills@vercel-react-best-pra

> [!info] **Assistant**
> Let me search for skills related to Apple's Liquid Glass design.

> [!example] Tool Calls
>> [!note] **Bash** — npx skills find "apple liquid glass design"
>> `npx skills find "apple liquid glass design"`
>> [!note] **Bash** — npx skills find "glass ui design"
>> `npx skills find "glass ui design"`
>> [!note] **Bash** — npx skills find "ios design system"
>> `npx skills find "ios design system"`

> [!info] **Assistant**
> Here are the most relevant skills for Apple Liquid Glass design:
> 
> **Top Picks**
> 
> | Skill | Installs | Description |
> |---|---|---|
> | **liquid-glass-design** | 182 | Dedicated Liquid Glass design skill |
> | **axiom-liquid-glass** | 126 | Axiom's Liquid Glass implementation |
> | **ios-glass-ui-designer** | 145 | iOS Glass UI designer |
> | **axiom-hig-ref** | 104 | Apple HIG reference guide |
> | **axiom-hig** | 82 | Apple Human Interface Guidelines |
> | **apple-skills/design** | 72 | Apple design patterns |
> 
> **Also Relevant**
> 
> | Skill | Installs | Description |
> |---|---|---|
> | **mobile-design** | 565 | General mobile design templates |
> | **ios-ux-design** | 257 | iOS UX design patterns |
> | **ios-design-system** | 32 | iOS design system |
> 
> **Install Commands**
> 
> The most directly relevant ones for Liquid Glass:
> 
> ```bash
> **Liquid Glass specific**
> npx skills add affaan-m/everything-claude-code@liquid-glass-design -g -y
> npx skills add charleswiltgen/axiom@axiom-liquid-glass -g -y
> 
> **Apple HIG reference (good companion)**
> npx skills add charleswiltgen/axiom@axiom-hig-ref -g -y
> 
> **iOS Glass UI**
> npx skills add heyman333/atelier-ui@ios-glass-ui-designer -g -y
> ```
> 
> Would you like me to install any of these? I'd recommend starting with **liquid-glass-design** (most popular, dedicated to the topic) and **axiom-liquid-glass** (from the well-regarded Axiom collection).

> [!example] Tool Calls
>> [!note] **Bash** — npx skills add affaan-m/everything-claude-code@liquid-glass-design -g -y
>> `npx skills add affaan-m/everything-claude-code@liquid-glass-design -g -y`
>> [!note] **Bash** — npx skills add charleswiltgen/axiom@axiom-liquid-glass -g -y
>> `npx skills add charleswiltgen/axiom@axiom-liquid-glass -g -y`

> [!info] **Assistant**
> Both skills are installed:
> 
> - **liquid-glass-design** - installed to `~/.agents/skills/liquid-glass-design`
> - **axiom-liquid-glass** - installed to `~/.agents/skills/axiom-liquid-glass`
> 
> They'll be available in your next conversation. You can invoke them with `/liquid-glass-design` or `/axiom-liquid-glass` when working on Apple Liquid Glass UI designs.


---

*Part of [[Conversations]] | See [[CLAUDE]] for project invariants*