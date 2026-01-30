/**
 * Advanced Reasoning Techniques for 10x Smarter AI
 *
 * Implements:
 * 1. Multi-Agent Debate - Multiple AI personas argue and reach consensus
 * 2. Tree of Thoughts - Explore multiple reasoning paths
 * 3. Self-Consistency - Generate multiple answers, vote on best
 * 4. Iterative Refinement - Multiple passes to improve
 * 5. Expert Personas - Domain-specific expertise
 */

import { createLogger } from '../logging/logger.js';

const log = createLogger('advanced-reasoning');

// DeepSeek API call helper
async function callDeepSeek(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = await response.json() as any;
  return data.choices[0].message.content;
}

// ============================================================================
// 1. MULTI-AGENT DEBATE
// ============================================================================

type Agent = {
  name: string;
  persona: string;
  style: string;
};

const DEBATE_AGENTS: Agent[] = [
  {
    name: 'Analyst',
    persona: 'You are a logical analyst who focuses on facts, data, and structured reasoning.',
    style: 'analytical, precise, data-driven',
  },
  {
    name: 'Critic',
    persona: 'You are a critical thinker who challenges assumptions and finds flaws in arguments.',
    style: 'skeptical, thorough, devil\'s advocate',
  },
  {
    name: 'Creative',
    persona: 'You are a creative problem solver who thinks outside the box and considers unconventional solutions.',
    style: 'innovative, lateral thinking, creative',
  },
];

/**
 * Multi-Agent Debate: Multiple AI personas discuss and reach consensus
 * This catches errors that a single perspective might miss
 */
export async function multiAgentDebate(
  question: string,
  apiKey: string,
  rounds: number = 2
): Promise<{ answer: string; debate: string[] }> {
  log.info(`Starting multi-agent debate with ${rounds} rounds`);

  const debate: string[] = [];
  const responses: Map<string, string[]> = new Map();

  // Round 1: Initial responses from each agent
  for (const agent of DEBATE_AGENTS) {
    const prompt = `${agent.persona}

Your thinking style is: ${agent.style}

Question: ${question}

Provide your analysis and answer. Be specific and explain your reasoning.`;

    const response = await callDeepSeek(
      [{ role: 'user', content: prompt }],
      apiKey,
      { temperature: 0.7 }
    );

    debate.push(`**${agent.name}**: ${response}`);
    responses.set(agent.name, [response]);
  }

  // Subsequent rounds: Agents respond to each other
  for (let round = 1; round < rounds; round++) {
    for (const agent of DEBATE_AGENTS) {
      const otherResponses = DEBATE_AGENTS
        .filter(a => a.name !== agent.name)
        .map(a => `${a.name}: ${responses.get(a.name)?.slice(-1)[0]}`)
        .join('\n\n');

      const prompt = `${agent.persona}

Original question: ${question}

Other agents' perspectives:
${otherResponses}

Your previous response: ${responses.get(agent.name)?.slice(-1)[0]}

Consider the other perspectives. Do you agree or disagree? Refine your answer based on the discussion. If you see valid points, incorporate them. If you see flaws, point them out.`;

      const response = await callDeepSeek(
        [{ role: 'user', content: prompt }],
        apiKey,
        { temperature: 0.5 }
      );

      debate.push(`**${agent.name} (Round ${round + 1})**: ${response}`);
      responses.get(agent.name)?.push(response);
    }
  }

  // Synthesis: Combine insights into final answer
  const allResponses = Array.from(responses.entries())
    .map(([name, resps]) => `${name}'s final position: ${resps.slice(-1)[0]}`)
    .join('\n\n');

  const synthesisPrompt = `You are a neutral moderator synthesizing a debate.

Original question: ${question}

The debate participants reached these conclusions:
${allResponses}

Synthesize the best answer by:
1. Identifying points of agreement
2. Resolving disagreements with the strongest reasoning
3. Combining the best insights from each perspective

Provide a comprehensive final answer.`;

  const finalAnswer = await callDeepSeek(
    [{ role: 'user', content: synthesisPrompt }],
    apiKey,
    { temperature: 0.3 }
  );

  return { answer: finalAnswer, debate };
}

// ============================================================================
// 2. TREE OF THOUGHTS
// ============================================================================

type ThoughtNode = {
  thought: string;
  score: number;
  children: ThoughtNode[];
};

/**
 * Tree of Thoughts: Explore multiple reasoning paths and pick the best
 * Like a chess player thinking several moves ahead
 */
export async function treeOfThoughts(
  question: string,
  apiKey: string,
  breadth: number = 3,
  depth: number = 2
): Promise<{ answer: string; bestPath: string[] }> {
  log.info(`Starting Tree of Thoughts: breadth=${breadth}, depth=${depth}`);

  // Generate initial thoughts
  const initialPrompt = `Question: ${question}

Generate ${breadth} different initial approaches to solve this problem. For each approach:
1. Describe the approach in one sentence
2. Rate its promise (1-10)

Format each as:
APPROACH: [description]
PROMISE: [1-10]
---`;

  const initialResponse = await callDeepSeek(
    [{ role: 'user', content: initialPrompt }],
    apiKey,
    { temperature: 0.8 }
  );

  // Parse initial thoughts
  const thoughts = parseThoughts(initialResponse);

  // For each promising thought, explore deeper
  const exploredPaths: Array<{ path: string[]; finalAnswer: string; score: number }> = [];

  for (const thought of thoughts.slice(0, breadth)) {
    const path = [thought.thought];
    let currentThought = thought.thought;

    for (let d = 0; d < depth; d++) {
      const continuePrompt = `Question: ${question}

Current reasoning path:
${path.map((p, i) => `Step ${i + 1}: ${p}`).join('\n')}

Continue this line of reasoning. What's the next logical step? Be specific.`;

      const nextStep = await callDeepSeek(
        [{ role: 'user', content: continuePrompt }],
        apiKey,
        { temperature: 0.6 }
      );

      path.push(nextStep);
      currentThought = nextStep;
    }

    // Get final answer for this path
    const finalPrompt = `Question: ${question}

You've reasoned through this path:
${path.map((p, i) => `Step ${i + 1}: ${p}`).join('\n')}

Based on this reasoning, provide your final answer.`;

    const finalAnswer = await callDeepSeek(
      [{ role: 'user', content: finalPrompt }],
      apiKey,
      { temperature: 0.3 }
    );

    // Score this path
    const scorePrompt = `Question: ${question}

Answer: ${finalAnswer}

Rate this answer on a scale of 1-10 for:
1. Correctness
2. Completeness
3. Clarity

Respond with just a number (average of the three).`;

    const scoreResponse = await callDeepSeek(
      [{ role: 'user', content: scorePrompt }],
      apiKey,
      { temperature: 0.1 }
    );

    const score = parseFloat(scoreResponse) || 5;
    exploredPaths.push({ path, finalAnswer, score });
  }

  // Pick the best path
  exploredPaths.sort((a, b) => b.score - a.score);
  const best = exploredPaths[0];

  return { answer: best.finalAnswer, bestPath: best.path };
}

function parseThoughts(response: string): Array<{ thought: string; score: number }> {
  const thoughts: Array<{ thought: string; score: number }> = [];
  const parts = response.split('---');

  for (const part of parts) {
    const approachMatch = part.match(/APPROACH:\s*(.+)/i);
    const promiseMatch = part.match(/PROMISE:\s*(\d+)/i);

    if (approachMatch) {
      thoughts.push({
        thought: approachMatch[1].trim(),
        score: promiseMatch ? parseInt(promiseMatch[1]) : 5,
      });
    }
  }

  return thoughts.sort((a, b) => b.score - a.score);
}

// ============================================================================
// 3. SELF-CONSISTENCY (Voting)
// ============================================================================

/**
 * Self-Consistency: Generate multiple answers and vote on the best
 * Reduces random errors through consensus
 */
export async function selfConsistency(
  question: string,
  apiKey: string,
  samples: number = 5
): Promise<{ answer: string; confidence: number; allAnswers: string[] }> {
  log.info(`Starting self-consistency with ${samples} samples`);

  const prompt = `${question}

Think through this step-by-step and provide your answer.`;

  // Generate multiple responses with higher temperature for diversity
  const responses: string[] = [];
  for (let i = 0; i < samples; i++) {
    const response = await callDeepSeek(
      [{ role: 'user', content: prompt }],
      apiKey,
      { temperature: 0.7 + (i * 0.1) } // Vary temperature for diversity
    );
    responses.push(response);
  }

  // Have the model analyze and pick the best answer
  const votePrompt = `You generated ${samples} different answers to the same question.

Question: ${question}

The answers were:
${responses.map((r, i) => `Answer ${i + 1}: ${r}`).join('\n\n---\n\n')}

Analyze these answers:
1. What do most answers agree on?
2. Which answer is most complete and correct?
3. Synthesize the best final answer combining correct elements.

Provide:
CONSENSUS: [what most agree on]
BEST_ANSWER: [your synthesized best answer]
CONFIDENCE: [1-10 how confident you are]`;

  const voteResponse = await callDeepSeek(
    [{ role: 'user', content: votePrompt }],
    apiKey,
    { temperature: 0.2 }
  );

  // Parse the vote
  const bestMatch = voteResponse.match(/BEST_ANSWER:\s*([\s\S]*?)(?=CONFIDENCE:|$)/i);
  const confMatch = voteResponse.match(/CONFIDENCE:\s*(\d+)/i);

  const answer = bestMatch ? bestMatch[1].trim() : responses[0];
  const confidence = confMatch ? parseInt(confMatch[1]) / 10 : 0.5;

  return { answer, confidence, allAnswers: responses };
}

// ============================================================================
// 4. ITERATIVE REFINEMENT
// ============================================================================

/**
 * Iterative Refinement: Multiple passes to improve the answer
 */
export async function iterativeRefinement(
  question: string,
  apiKey: string,
  iterations: number = 3
): Promise<{ answer: string; improvements: string[] }> {
  log.info(`Starting iterative refinement with ${iterations} iterations`);

  const improvements: string[] = [];

  // Initial answer
  let currentAnswer = await callDeepSeek(
    [{ role: 'user', content: question }],
    apiKey,
    { temperature: 0.7 }
  );
  improvements.push(`Initial: ${currentAnswer}`);

  for (let i = 0; i < iterations; i++) {
    // Critique the current answer
    const critiquePrompt = `Question: ${question}

Current answer: ${currentAnswer}

Critically evaluate this answer:
1. What's good about it?
2. What's missing or incorrect?
3. How can it be improved?

Be specific about weaknesses.`;

    const critique = await callDeepSeek(
      [{ role: 'user', content: critiquePrompt }],
      apiKey,
      { temperature: 0.5 }
    );

    // Improve based on critique
    const improvePrompt = `Question: ${question}

Current answer: ${currentAnswer}

Critique: ${critique}

Improve the answer by addressing the critique. Make it more accurate, complete, and clear.`;

    currentAnswer = await callDeepSeek(
      [{ role: 'user', content: improvePrompt }],
      apiKey,
      { temperature: 0.4 }
    );

    improvements.push(`Iteration ${i + 1}: ${currentAnswer}`);
  }

  return { answer: currentAnswer, improvements };
}

// ============================================================================
// 5. EXPERT PERSONAS
// ============================================================================

const EXPERT_PERSONAS: Record<string, string> = {
  mathematician: `You are a PhD mathematician with expertise in algebra, calculus, statistics, and mathematical proofs. You approach problems rigorously, define terms precisely, and always show your work. You check your calculations multiple times.`,

  programmer: `You are a senior software engineer with 20 years of experience. You write clean, efficient, well-tested code. You consider edge cases, performance, and maintainability. You always explain your code and suggest improvements.`,

  scientist: `You are a research scientist with expertise across physics, chemistry, and biology. You rely on evidence, cite sources when possible, and clearly distinguish between established facts and hypotheses. You think in terms of experiments and falsifiability.`,

  writer: `You are a professional writer and editor with expertise in clear communication. You craft precise, engaging prose. You structure arguments logically and use examples effectively. You eliminate jargon and ambiguity.`,

  strategist: `You are a business strategist and consultant. You analyze problems from multiple angles: market, financial, operational, and human. You use frameworks like SWOT, Porter's Five Forces, and first-principles thinking.`,

  lawyer: `You are an experienced attorney. You analyze arguments for logical consistency, identify assumptions, and consider counterarguments. You're precise with language and careful about claims.`,
};

/**
 * Expert Persona: Answer as a domain expert
 */
export async function expertPersona(
  question: string,
  domain: string,
  apiKey: string
): Promise<string> {
  const persona = EXPERT_PERSONAS[domain.toLowerCase()] || EXPERT_PERSONAS.scientist;

  const prompt = `${persona}

A user asks: ${question}

Provide your expert analysis and answer. Use your specialized knowledge and methodology.`;

  return callDeepSeek(
    [{ role: 'user', content: prompt }],
    apiKey,
    { temperature: 0.5 }
  );
}

/**
 * Multi-Expert Panel: Get perspectives from multiple experts
 */
export async function multiExpertPanel(
  question: string,
  domains: string[],
  apiKey: string
): Promise<{ answer: string; expertOpinions: Record<string, string> }> {
  log.info(`Starting multi-expert panel: ${domains.join(', ')}`);

  const expertOpinions: Record<string, string> = {};

  // Get each expert's opinion
  for (const domain of domains) {
    expertOpinions[domain] = await expertPersona(question, domain, apiKey);
  }

  // Synthesize
  const synthesisPrompt = `Question: ${question}

Expert opinions:
${Object.entries(expertOpinions)
  .map(([domain, opinion]) => `**${domain}**: ${opinion}`)
  .join('\n\n')}

Synthesize these expert perspectives into a comprehensive answer that:
1. Identifies key insights from each expert
2. Resolves any conflicts between viewpoints
3. Provides a balanced, well-rounded answer`;

  const answer = await callDeepSeek(
    [{ role: 'user', content: synthesisPrompt }],
    apiKey,
    { temperature: 0.3 }
  );

  return { answer, expertOpinions };
}

// ============================================================================
// 6. MASTER FUNCTION: ULTRA-SMART QUERY
// ============================================================================

export type SmartLevel = 'fast' | 'smart' | 'genius' | 'ultra';

/**
 * Ultra-Smart Query: Combines all techniques based on complexity
 */
export async function ultraSmartQuery(
  question: string,
  apiKey: string,
  level: SmartLevel = 'smart'
): Promise<{
  answer: string;
  method: string;
  confidence: number;
  reasoning?: string[];
}> {
  log.info(`Ultra-smart query at level: ${level}`);

  switch (level) {
    case 'fast':
      // Just chain-of-thought
      const fastAnswer = await callDeepSeek(
        [{ role: 'user', content: `Think step-by-step:\n\n${question}` }],
        apiKey,
        { temperature: 0.5 }
      );
      return { answer: fastAnswer, method: 'chain-of-thought', confidence: 0.7 };

    case 'smart':
      // Self-consistency (3 samples)
      const smartResult = await selfConsistency(question, apiKey, 3);
      return {
        answer: smartResult.answer,
        method: 'self-consistency',
        confidence: smartResult.confidence,
      };

    case 'genius':
      // Tree of thoughts + self-consistency
      const totResult = await treeOfThoughts(question, apiKey, 3, 2);
      const verifyResult = await selfConsistency(
        `Verify this answer to "${question}":\n\n${totResult.answer}`,
        apiKey,
        3
      );
      return {
        answer: totResult.answer,
        method: 'tree-of-thoughts + verification',
        confidence: verifyResult.confidence,
        reasoning: totResult.bestPath,
      };

    case 'ultra':
      // Full pipeline: Multi-agent debate + Tree of thoughts + Expert panel
      const debateResult = await multiAgentDebate(question, apiKey, 2);
      const experts = await multiExpertPanel(
        question,
        ['scientist', 'strategist', 'critic'],
        apiKey
      );
      const refined = await iterativeRefinement(
        `Combine these insights to answer: ${question}\n\nDebate conclusion: ${debateResult.answer}\n\nExpert panel: ${experts.answer}`,
        apiKey,
        2
      );

      return {
        answer: refined.answer,
        method: 'multi-agent-debate + expert-panel + refinement',
        confidence: 0.95,
        reasoning: debateResult.debate,
      };

    default:
      return ultraSmartQuery(question, apiKey, 'smart');
  }
}
