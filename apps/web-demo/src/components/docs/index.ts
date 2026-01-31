/**
 * Documentation Section Components
 *
 * Each section is extracted into its own component to reduce complexity
 * and improve maintainability of the documentation.
 */

import type React from 'react';

// Import components for local use in sectionComponents map
import GettingStartedSection from './GettingStartedSection';
import InstallationSection from './InstallationSection';
import BasicUsageSection from './BasicUsageSection';
import AttentionTrackingSection from './AttentionTrackingSection';
import MasteryLearningSection from './MasteryLearningSection';
import LLMIntegrationSection from './LLMIntegrationSection';
import APIReferenceSection from './APIReferenceSection';
import ExamplesSection from './ExamplesSection';

// Re-export for direct imports
export {
  GettingStartedSection,
  InstallationSection,
  BasicUsageSection,
  AttentionTrackingSection,
  MasteryLearningSection,
  LLMIntegrationSection,
  APIReferenceSection,
  ExamplesSection,
};

// Map of section IDs to components for dynamic rendering
export const sectionComponents: Record<string, React.ComponentType> = {
  'getting-started': GettingStartedSection,
  installation: InstallationSection,
  'basic-usage': BasicUsageSection,
  'attention-tracking': AttentionTrackingSection,
  'mastery-learning': MasteryLearningSection,
  'llm-integration': LLMIntegrationSection,
  'api-reference': APIReferenceSection,
  examples: ExamplesSection,
};
