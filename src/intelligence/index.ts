/**
 * Intelligence Augmentation for DeepSeek
 *
 * This module provides tools and techniques to make DeepSeek 10x smarter:
 *
 * BASIC (fast, 1 API call):
 * - Chain-of-Thought prompting
 *
 * SMART (3 API calls):
 * - Self-Consistency voting
 * - Tool use (calculator, web search, code)
 *
 * GENIUS (10+ API calls):
 * - Tree of Thoughts
 * - Multi-Agent Debate
 * - Expert Personas
 *
 * ULTRA (20+ API calls):
 * - Full pipeline combining all techniques
 */

export * from './reasoning-prompts.js';
export * from './tool-executor.js';
export * from './react-agent.js';
export * from './advanced-reasoning.js';

import { intelligentQuery, chainOfThoughtQuery, type ReActResult } from './react-agent.js';
import {
  ultraSmartQuery,
  multiAgentDebate,
  treeOfThoughts,
  selfConsistency,
  iterativeRefinement,
  multiExpertPanel,
  expertPersona,
  type SmartLevel,
} from './advanced-reasoning.js';

export type IntelligenceLevel = 'fast' | 'smart' | 'genius' | 'ultra';

export type SmartQueryResult = {
  answer: string;
  method: string;
  confidence: number;
  reasoning?: string[];
  tokensUsed?: number;
};

/**
 * The main intelligence-augmented query function.
 * Use this to ask questions with enhanced reasoning.
 *
 * @param question - The question to answer
 * @param options - Configuration options
 * @param options.level - Intelligence level: fast, smart, genius, ultra
 * @param options.useTools - Enable tool use (calculator, web search)
 * @param options.apiKey - DeepSeek API key
 */
export async function smartQuery(
  question: string,
  options?: {
    apiKey?: string;
    level?: IntelligenceLevel;
    useTools?: boolean;
    taskType?: 'general' | 'code' | 'math' | 'research';
    verbose?: boolean;
  },
): Promise<SmartQueryResult> {
  const apiKey = options?.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const level = options?.level ?? 'smart';

  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY not set. Provide it via options or environment variable.');
  }

  // For 'fast' level, use simple chain-of-thought
  if (level === 'fast') {
    if (options?.useTools) {
      const result = await intelligentQuery(question, apiKey, {
        verbose: options.verbose,
      });
      return {
        answer: result.answer,
        method: 'react-agent',
        confidence: 0.75,
        reasoning: result.steps.map(s => `${s.thought} → ${s.action}`),
      };
    } else {
      const answer = await chainOfThoughtQuery(question, apiKey, {
        taskType: options?.taskType,
      });
      return { answer, method: 'chain-of-thought', confidence: 0.7 };
    }
  }

  // For smart/genius/ultra, use advanced reasoning
  const result = await ultraSmartQuery(question, apiKey, level);

  return {
    answer: result.answer,
    method: result.method,
    confidence: result.confidence,
    reasoning: result.reasoning,
  };
}

/**
 * Quick helper for simple questions (fast, 1 API call)
 */
export async function ask(question: string): Promise<string> {
  const result = await smartQuery(question, { level: 'fast', useTools: false });
  return result.answer;
}

/**
 * Helper for questions that need web search or tools (smart, 3 API calls)
 */
export async function research(question: string): Promise<string> {
  const result = await smartQuery(question, { level: 'smart', useTools: true, taskType: 'research' });
  return result.answer;
}

/**
 * Helper for code-related questions (smart with tools)
 */
export async function codeHelp(question: string): Promise<string> {
  const result = await smartQuery(question, { level: 'smart', useTools: true, taskType: 'code' });
  return result.answer;
}

/**
 * Helper for math problems (smart with calculator)
 */
export async function solveMath(question: string): Promise<string> {
  const result = await smartQuery(question, { level: 'smart', useTools: true, taskType: 'math' });
  return result.answer;
}

/**
 * GENIUS MODE: For complex questions requiring deep analysis
 * Uses Tree of Thoughts + Multi-Agent perspectives
 * ~10 API calls, higher cost but much better results
 */
export async function geniusQuery(question: string, apiKey?: string): Promise<SmartQueryResult> {
  return smartQuery(question, { apiKey, level: 'genius' });
}

/**
 * ULTRA MODE: Maximum intelligence - all techniques combined
 * Uses Multi-Agent Debate + Expert Panel + Iterative Refinement
 * ~20+ API calls, highest cost but best possible results
 */
export async function ultraQuery(question: string, apiKey?: string): Promise<SmartQueryResult> {
  return smartQuery(question, { apiKey, level: 'ultra' });
}

/**
 * Get multiple expert opinions on a question
 */
export async function askExperts(
  question: string,
  domains: string[] = ['scientist', 'strategist', 'programmer'],
  apiKey?: string,
): Promise<{ answer: string; expertOpinions: Record<string, string> }> {
  const key = apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  return multiExpertPanel(question, domains, key);
}

/**
 * Have AI agents debate a question to find the best answer
 */
export async function debate(
  question: string,
  rounds: number = 2,
  apiKey?: string,
): Promise<{ answer: string; debate: string[] }> {
  const key = apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  return multiAgentDebate(question, key, rounds);
}

/**
 * Explore multiple reasoning paths (Tree of Thoughts)
 */
export async function explore(
  question: string,
  apiKey?: string,
): Promise<{ answer: string; paths: string[] }> {
  const key = apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  const result = await treeOfThoughts(question, key, 3, 2);
  return { answer: result.answer, paths: result.bestPath };
}

/**
 * Generate multiple answers and vote on the best (Self-Consistency)
 */
export async function voteOnAnswer(
  question: string,
  samples: number = 5,
  apiKey?: string,
): Promise<{ answer: string; confidence: number }> {
  const key = apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  const result = await selfConsistency(question, key, samples);
  return { answer: result.answer, confidence: result.confidence };
}

/**
 * Iteratively improve an answer through critique cycles
 */
export async function refineAnswer(
  question: string,
  iterations: number = 3,
  apiKey?: string,
): Promise<{ answer: string; improvements: string[] }> {
  const key = apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  return iterativeRefinement(question, key, iterations);
}
