# Sibyl

**NO DEAD CODE**
**NO DEAD CODE**
**NO DEAD CODE**

## Overview

The Sibyl is memory system. The purpose is to maintain a memory database so it can be used by coding harnesses for example Cursor, Copilot, Claude Code and Opencode.

The Sibyl is consist of Sibyl Server, Sibyl Client, Sibyl Plugins and Sibyl Web UI.

## Sibyl Server


The Sibyl can receive text, pdf, image and webpage and store them into the memory database.

### Memory Processing Workflow

Detailed instructions can be found in @LLM_WIKI.md
One implementation of the memory processing can be found on ~/Github/agentmemory

Knowledge Processing Workflos makes Sibyl not just a tool, but comparable to a relentless chamberlain managing your knowledge.

Knowledge Management Architecture
Raw Resources -> The WiKi -> The Schema

Basically here is the knowledge compilation process:
Ingest -> Query -> Filing -> Lint

#### Raw Resources

Raw Resources are the true facts and shouldn't be modified.

True facts can be obtained from harness and external sources sent to the Sibyl Server via direct API call, Sibyl API and Sibyl Plugings.

#### The Wiki

The Wiki is LLM Generated Markdown files. They are generated from summarizing, analyzing and cross-referencing Raw Resources.

#### The Schema

The Schema is the "Consitution" and Configuration of the Knowledge Library.

It defines Wiki structure and LLM processing rules.

It tells LLM how to handle new knowledge.

#### Inguest

LLM reading Raw Resources, discussing main points and updating Wiki Pages.

#### Query

User ask question to LLM, LLM searches through the Wiki Pages, LLM synthesizes an answer as an markdown output.

#### Filing

Filing is the most important step. If the answer from Query is execellent, analyze it deeply and store them inside Wiki Page as a new asset.

#### Lint

Health checking the Wiki Pages regularlly. LLM should find out conflicting data, isolated pages and use the Internet to fill in the missing infomation. LLM should also give a direction for what should be done next..

## Sibyl Client

Sibyl Client provides a Command Line Interface to manage, search, inseart and delete Raw Resources, Wiki Pages and The Schema. It can be also used to view, construct and modify knowledge graph.

## Sibyl Plugins

The agents then never forget what has happened before. And can use relevant memory and knowledge to produce better results.

https://opencode.ai/docs/plugins/#create-a-plugin have the references to read content for adding to the memory. The plugins can be used to inject context to the harness.

Check ~/Github/agentmemory how the plugins are implemented

## Sibyl Web UI

Functionality wise similar to Sibyl Client but offeres better UX and easy to use.

## Performance requirement

The Sibyl should have top-notch performance.

## UX

The Sibyl should have top-notch UX

## Valueable Implementations

Implementation can learn from these repos:
* ~/Github/opencode
* ~/Github/agentmemory

## Supported Harnesses

* OpenCode
