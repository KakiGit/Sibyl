"""Evaluation prompts for relevance checking."""

QUERY_RELEVANCE_PROMPT = """Evaluate if this memory is relevant to the query.

Query: "{query}"

Memory:
- Content: "{fact_content}"
- Source entity: {source_entity}
- Target entity: {target_entity}
- When it became true: {valid_at}

Answer with a single number between 0 and 1:
- 1.0 = Highly relevant, essential context
- 0.5 = Somewhat related, may be useful
- 0.0 = Not relevant, should not be included

Score:"""

CONTEXT_RELEVANCE_PROMPT = """Evaluate if this memory should be included in general context.

Memory:
- Content: "{fact_content}"
- Category: {category}
- Created: {created_at}

Consider:
- Is this a preference that should always be known?
- Is this a project fact that's generally useful?
- Is this a past decision that affects current work?

Score (0.0 to 1.0):"""

BATCH_RELEVANCE_PROMPT = """Evaluate the relevance of these memories to the query.

Query: "{query}"

Memories:
{memories_list}

For each memory, output a score between 0.0 and 1.0.
Format: memory_number:score
Example: 1:0.8 2:0.3 3:1.0

Scores:"""
