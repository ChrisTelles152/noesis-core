import type { LLMProvider, LLMCompletionOptions, LLMCompletionResult } from '../types';

/**
 * Fallback provider that returns template-based responses
 * Used when no LLM provider is configured
 */
export class FallbackProvider implements LLMProvider {
  name = 'fallback';

  isConfigured(): boolean {
    return true; // Always available
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    // Analyze the messages to determine what kind of response is needed
    const lastUserMessage = options.messages
      .filter(m => m.role === 'user')
      .pop()?.content.toLowerCase() || '';

    let content: string;

    if (lastUserMessage.includes('attention') || lastUserMessage.includes('engagement')) {
      content = JSON.stringify({
        message: this.getEngagementSuggestion(),
        type: 'attention-prompt',
      });
    } else if (lastUserMessage.includes('recommendation') || lastUserMessage.includes('next')) {
      content = JSON.stringify({
        suggestion: this.getLearningRecommendation(),
        explanation: 'This recommendation is based on general learning best practices.',
        resourceLinks: [],
      });
    } else {
      content = JSON.stringify({
        suggestion: 'Continue with your current learning activity.',
        explanation: 'Keep up the good work!',
        resourceLinks: [],
      });
    }

    return {
      content,
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      provider: this.name,
      model: 'template-v1',
    };
  }

  private getEngagementSuggestion(): string {
    const suggestions = [
      "Let's try a quick 30-second break to refresh your focus.",
      "How about we switch to a visual example of this concept?",
      "Would you like to see a real-world application?",
      "Let's make this more interactive with a practice problem.",
      "Sometimes a change of pace helps. Want to try a different approach?",
      "Take a moment to stretch, then we'll continue.",
      "Let's review what we've covered so far.",
      "Would you like me to explain this in a different way?",
    ];
    return suggestions[Math.floor(Math.random() * suggestions.length)];
  }

  private getLearningRecommendation(): string {
    const recommendations = [
      "Based on your progress, I recommend reviewing the fundamentals before moving on.",
      "You're doing well! Let's challenge you with a more advanced topic.",
      "Consider practicing with some exercises to reinforce what you've learned.",
      "Taking a short break can help consolidate your learning.",
      "Try explaining what you've learned in your own words.",
      "Let's revisit some concepts that might need more attention.",
      "You're ready to apply this knowledge to a practical project.",
      "Consider creating flashcards for the key concepts.",
    ];
    return recommendations[Math.floor(Math.random() * recommendations.length)];
  }
}
