/**
 * ReAct Agent - Reasoning and Acting
 * Implements the ReAct pattern for improved problem-solving.
 * Paper: https://arxiv.org/abs/2210.03629
 */

import { buildEnhancedPrompt, wrapUserMessage } from './reasoning-prompts.js';
import {
  executeTool,
  getToolDefinitions,
  type ToolResult,
} from './tool-executor.js';

export type ReActStep = {
  type: 'thought' | 'action' | 'observation' | 'answer';
  content: string;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  toolResult?: ToolResult;
};

export type ReActConfig = {
  maxIterations: number;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature?: number;
  verbose?: boolean;
};

export type ReActResult = {
  answer: string;
  steps: ReActStep[];
  iterations: number;
  success: boolean;
};

const REACT_SYSTEM_PROMPT = `You are an AI assistant that uses the ReAct (Reasoning + Acting) framework to solve problems.

For each step, you should:
1. **Thought**: Reason about what you need to do next
2. **Action**: If you need information, use a tool
3. **Observation**: Process the result of your action
4. **Answer**: When you have enough information, provide your final answer

Format your responses as:
Thought: [Your reasoning about the current step]
Action: [tool_name] with params: {"param1": "value1"}
OR
Answer: [Your final answer when ready]

Available tools:
${getToolDefinitions()
  .map((t) => `- ${t.function.name}: ${t.function.description}`)
  .join('\n')}

Rules:
- Always think before acting
- Only use tools when necessary
- Provide clear, step-by-step reasoning
- Give a complete answer when you have enough information`;

/**
 * Parse a ReAct response to extract thought, action, or answer
 */
function parseReActResponse(response: string): ReActStep[] {
  const steps: ReActStep[] = [];

  // Check for thought
  const thoughtMatch = response.match(/Thought:\s*([\s\S]*?)(?=Action:|Answer:|$)/i);
  if (thoughtMatch) {
    steps.push({ type: 'thought', content: thoughtMatch[1].trim() });
  }

  // Check for action
  const actionMatch = response.match(/Action:\s*(\w+)\s*(?:with params:|params:)?\s*({[\s\S]*?})/i);
  if (actionMatch) {
    try {
      const toolName = actionMatch[1];
      const toolParams = JSON.parse(actionMatch[2]) as Record<string, unknown>;
      steps.push({
        type: 'action',
        content: `Using ${toolName}`,
        toolName,
        toolParams,
      });
    } catch {
      // Invalid JSON params
    }
  }

  // Check for answer
  const answerMatch = response.match(/Answer:\s*([\s\S]*?)$/i);
  if (answerMatch) {
    steps.push({ type: 'answer', content: answerMatch[1].trim() });
  }

  return steps;
}

/**
 * Call the DeepSeek API
 */
async function callDeepSeek(
  messages: Array<{ role: string; content: string }>,
  config: ReActConfig,
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content ?? '';
}

/**
 * Run the ReAct agent on a problem
 */
export async function runReActAgent(
  problem: string,
  config: ReActConfig,
): Promise<ReActResult> {
  const steps: ReActStep[] = [];
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: REACT_SYSTEM_PROMPT },
    { role: 'user', content: problem },
  ];

  let iterations = 0;
  let finalAnswer = '';

  while (iterations < config.maxIterations) {
    iterations++;

    if (config.verbose) {
      console.log(`\n--- Iteration ${iterations} ---`);
    }

    try {
      const response = await callDeepSeek(messages, config);

      if (config.verbose) {
        console.log('Response:', response);
      }

      const responseSteps = parseReActResponse(response);
      steps.push(...responseSteps);

      // Check if we have a final answer
      const answerStep = responseSteps.find((s) => s.type === 'answer');
      if (answerStep) {
        finalAnswer = answerStep.content;
        break;
      }

      // Check if we need to execute a tool
      const actionStep = responseSteps.find((s) => s.type === 'action');
      if (actionStep && actionStep.toolName && actionStep.toolParams) {
        const toolResult = await executeTool(actionStep.toolName, actionStep.toolParams);
        actionStep.toolResult = toolResult;

        const observation: ReActStep = {
          type: 'observation',
          content: toolResult.success
            ? toolResult.output
            : `Error: ${toolResult.error}`,
        };
        steps.push(observation);

        // Add to messages
        messages.push({ role: 'assistant', content: response });
        messages.push({
          role: 'user',
          content: `Observation: ${observation.content}`,
        });
      } else {
        // No action, add response and continue
        messages.push({ role: 'assistant', content: response });
        messages.push({
          role: 'user',
          content: 'Continue your reasoning. If you have enough information, provide your Answer.',
        });
      }
    } catch (error) {
      if (config.verbose) {
        console.error('Error:', error);
      }
      steps.push({
        type: 'observation',
        content: `Error: ${String(error)}`,
      });
      break;
    }
  }

  // If no answer found, summarize what we learned
  if (!finalAnswer && steps.length > 0) {
    const thoughtSteps = steps.filter((s) => s.type === 'thought');
    finalAnswer = thoughtSteps.length > 0
      ? `Based on my analysis: ${thoughtSteps[thoughtSteps.length - 1].content}`
      : 'Unable to complete the task within the iteration limit.';
  }

  return {
    answer: finalAnswer,
    steps,
    iterations,
    success: !!finalAnswer,
  };
}

/**
 * Enhanced query function that wraps ReAct with good defaults
 */
export async function intelligentQuery(
  question: string,
  apiKey: string,
  options?: Partial<ReActConfig>,
): Promise<ReActResult> {
  const config: ReActConfig = {
    maxIterations: options?.maxIterations ?? 5,
    model: options?.model ?? 'deepseek-chat',
    apiKey,
    baseUrl: options?.baseUrl ?? 'https://api.deepseek.com/v1',
    temperature: options?.temperature ?? 0.7,
    verbose: options?.verbose ?? false,
  };

  return runReActAgent(question, config);
}

/**
 * Simple chain-of-thought query without tools
 */
export async function chainOfThoughtQuery(
  question: string,
  apiKey: string,
  options?: {
    model?: string;
    baseUrl?: string;
    taskType?: 'general' | 'code' | 'math' | 'research';
  },
): Promise<string> {
  const taskType = options?.taskType ?? 'general';
  const systemPrompt = buildEnhancedPrompt(taskType);
  const enhancedQuestion = wrapUserMessage(question);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: enhancedQuestion },
  ];

  const response = await fetch(`${options?.baseUrl ?? 'https://api.deepseek.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options?.model ?? 'deepseek-chat',
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content ?? '';
}
