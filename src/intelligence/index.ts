/**
 * Intelligence Augmentation for DeepSeek
 *
 * This module provides tools and techniques to make DeepSeek smarter:
 * 1. Chain-of-Thought prompting for better reasoning
 * 2. Tool use (web search, code execution, calculator)
 * 3. ReAct agent for complex problem-solving
 * 4. Self-reflection for improved answers
 */

export * from './reasoning-prompts.js';
export * from './tool-executor.js';
export * from './react-agent.js';

import { intelligentQuery, chainOfThoughtQuery, type ReActResult } from './react-agent.js';

/**
 * The main intelligence-augmented query function.
 * Use this to ask questions with enhanced reasoning.
 */
export async function smartQuery(
  question: string,
  options?: {
    apiKey?: string;
    useTools?: boolean;
    taskType?: 'general' | 'code' | 'math' | 'research';
    verbose?: boolean;
  },
): Promise<{ answer: string; reasoning?: ReActResult }> {
  const apiKey = options?.apiKey ?? process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not set. Provide it via options or environment variable.');
  }

  if (options?.useTools) {
    // Use ReAct agent with tools
    const result = await intelligentQuery(question, apiKey, {
      verbose: options.verbose,
    });

    return {
      answer: result.answer,
      reasoning: result,
    };
  } else {
    // Use chain-of-thought without tools
    const answer = await chainOfThoughtQuery(question, apiKey, {
      taskType: options?.taskType,
    });

    return { answer };
  }
}

/**
 * Quick helper for simple questions
 */
export async function ask(question: string): Promise<string> {
  const result = await smartQuery(question, { useTools: false });
  return result.answer;
}

/**
 * Helper for questions that need web search or tools
 */
export async function research(question: string): Promise<string> {
  const result = await smartQuery(question, { useTools: true, taskType: 'research' });
  return result.answer;
}

/**
 * Helper for code-related questions
 */
export async function codeHelp(question: string): Promise<string> {
  const result = await smartQuery(question, { useTools: true, taskType: 'code' });
  return result.answer;
}

/**
 * Helper for math problems
 */
export async function solveMath(question: string): Promise<string> {
  const result = await smartQuery(question, { useTools: true, taskType: 'math' });
  return result.answer;
}
