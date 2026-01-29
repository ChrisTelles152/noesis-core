/**
 * Documentation Section Components
 *
 * Each section is extracted into its own component to reduce complexity
 * and improve maintainability of the documentation.
 */

import type React from 'react';

export { default as GettingStartedSection } from './GettingStartedSection';
export { default as InstallationSection } from './InstallationSection';
export { default as BasicUsageSection } from './BasicUsageSection';
export { default as AttentionTrackingSection } from './AttentionTrackingSection';
export { default as MasteryLearningSection } from './MasteryLearningSection';
export { default as LLMIntegrationSection } from './LLMIntegrationSection';
export { default as APIReferenceSection } from './APIReferenceSection';
export { default as ExamplesSection } from './ExamplesSection';

// Map of section IDs to components for dynamic rendering
export const sectionComponents: Record<string, React.ComponentType> = {
  'getting-started': GettingStartedSection,
  'installation': InstallationSection,
  'basic-usage': BasicUsageSection,
  'attention-tracking': AttentionTrackingSection,
  'mastery-learning': MasteryLearningSection,
  'llm-integration': LLMIntegrationSection,
  'api-reference': APIReferenceSection,
  'examples': ExamplesSection,
};
