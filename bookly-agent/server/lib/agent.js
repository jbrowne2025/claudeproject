import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { toolDefinitions, executeTool } from './tools.js';

const MODEL = 'claude-sonnet-5';
const MAX_TOOL_ITERATIONS = 6;

const client = new Anthropic();

// system + tools are identical on every turn - caching the last system block
// caches both (render order is tools -> system -> messages), so repeat turns
// only pay full price for the new user/tool-result content.
const CACHED_SYSTEM = [
  { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
];

// history: array of Anthropic message params ({role, content}), mutated in place per session.
export async function runTurn(history, userText) {
  history.push({ role: 'user', content: [{ type: 'text', text: userText }] });

  const toolCallLog = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: CACHED_SYSTEM,
      tools: toolDefinitions,
      messages: history,
    });

    history.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return { text, toolCalls: toolCallLog };
    }

    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    const toolResults = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input);
      toolCallLog.push({ name: block.name, input: block.input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    history.push({ role: 'user', content: toolResults });
  }

  return {
    text: "I'm having trouble completing that request right now - could you try rephrasing, or ask something else?",
    toolCalls: toolCallLog,
  };
}
