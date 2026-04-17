# Sibyl

NO DEAD CODE
NO DEAD CODE
NO DEAD CODE

## Overview

The Sibyl is a TUI-based tool to provide a unified interface for various LLM-based code generation and analysis tools.

Sibyl has a built-in memory system. Spec stated below.

Sibyl also supports a plugin system to allow users to easily extend the functionality. For example custom workflow, etc.

Users can create skills/tools/workflows once and use them across different LLMs and code generation tools, without worrying about the underlying implementation details.

Sibyl can utilize the other harnesses because those took millions of dollars to develop and they have decent accuracy.

Consider multiple Sibyl instances can run at the same time.

## Memory System Spec

Sibyl supports real time natual language query to its database.

The memory gets injected automatically to the context smoothly.

Sibyl should provide interface to manage the memories. (add, search, modify and delete)

More memory design can be found from @docs/LLM_WIKI.md

## Performance requirement

The Sibyl should have top-notch performance.

## UX

The Sibyl should have top-notch UX

## Valueable Implementations

Implementation can learn from these repos:
* ~/Github/claw-code
* ~/Github/opencode
* ~/Github/codex
* ~/Github/graphiti/

## Basic Architecture

* Core and TUI implemented in Rust for performance.
* Prompt building and relevant components are in python for flexibility.

### Layers and Connections

                   TUI
                    |
Memory System <-> Core <-> Prompt Building
                    |
                 Harnesses

## Supported Harnesses

* OpenCode
* Cursor
* Claude Code
* mCodex
