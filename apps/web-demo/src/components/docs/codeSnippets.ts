/**
 * Shared code snippets for documentation
 */

export const installCode = `# Using npm
npm install @noesis-edu/core

# Using yarn
yarn add @noesis-edu/core`;

export const basicUsageCode = `import { NoesisSDK } from '@noesis-edu/core';

const noesis = new NoesisSDK({
  apiKey: 'YOUR_API_KEY', // Optional for core features
  modules: ['attention', 'mastery'],
  debug: true
});`;

export const attentionTrackingCode = `async function startAttentionTracking() {
  try {
    await noesis.attention.startTracking({
      element: '#learning-content',
      webcam: true,
      trackingInterval: 500, // ms
      onAttentionChange: data => {
        console.log('Attention score:', data.score);

        // Update UI or adapt content based on attention
        updateUIWithAttentionData(data);
      }
    });
  } catch (error) {
    console.error('Error starting attention tracking:', error);
  }
}`;

export const masteryTrackingCode = `// Define learning objectives
const objectives = [
  { id: 'concept_a', name: 'Basic Principles' },
  { id: 'concept_b', name: 'Applied Knowledge' },
  { id: 'concept_c', name: 'Advanced Application' }
];

// Initialize mastery tracking
noesis.mastery.initialize({
  objectives,
  threshold: 0.8, // 80% mastery required
  spacingFactor: 2.5, // For spaced repetition
  onMasteryUpdate: data => {
    console.log('Mastery updated:', data);
    updateProgressUI(data);
  }
});

// Later, when user completes an assessment or task:
noesis.mastery.recordEvent({
  objectiveId: 'concept_a',
  result: 0.75, // 75% correct
  confidence: 0.6 // User's self-reported confidence
});`;
