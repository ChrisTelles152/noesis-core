import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import CodeBlock from '@/components/CodeBlock';
import spiralEyeUrl from '@/assets/spiral-eye.svg';

export default function Hero() {
  const { t } = useTranslation();
  const codeExample = `// Initialize Noesis SDK with default configuration
import { NoesisSDK } from '@noesis-edu/core';

const noesis = new NoesisSDK({
  apiKey: 'YOUR_API_KEY',
  modules: ['attention', 'mastery', 'orchestration'],
  debug: true
});

// Start tracking learner attention
await noesis.attention.startTracking({
  element: '#learning-content',
  webcam: true,
  onAttentionChange: attentionData => {
    console.log('Attention score:', attentionData.score);
    
    // Adapt learning experience based on attention
    if (attentionData.score < 0.3) {
      noesis.orchestration.suggestEngagement();
    }
  }
});

// Track mastery of learning objectives
noesis.mastery.trackProgress({
  objectives: ['concept_a', 'concept_b', 'application'],
  threshold: 0.8,
  onMasteryUpdate: masteryData => {
    updateUI(masteryData);
  }
});

// Connect to LLM for adaptive feedback
const response = await noesis.orchestration.getNextStep({
  learnerState: noesis.getLearnerState(),
  context: 'struggling with concept_b'
});

console.log('Suggested next step:', response.suggestion);`;

  return (
    <section className="py-12 md:py-20 bg-gradient-to-b from-white to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <img
            src={spiralEyeUrl}
            alt="Noesis"
            className="mx-auto mb-8 h-16 w-16 text-neural-copper"
            aria-label="Noesis spiral-eye logo"
          />
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary-600 to-secondary-500">
              {t('home.headline')}
            </span>{' '}
            {t('home.headlineRest')}
          </h1>
          <p className="mt-6 text-xl text-slate-600 max-w-3xl mx-auto">
            {t('home.subheadline')}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <Button size="lg" asChild>
              <Link href="/#getstarted">
                <a className="w-full sm:w-auto">
                  {t('common.getStarted')}
                  <i className="fas fa-arrow-right ml-2"></i>
                </a>
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/documentation">
                <a className="w-full sm:w-auto">{t('common.documentation')}</a>
              </Link>
            </Button>
          </div>

          <div className="mt-12 text-sm flex items-center justify-center text-slate-600">
            <span className="mr-4">{t('home.openSource')}</span>
            <div className="w-px h-4 bg-slate-300"></div>
            <span className="mx-4">{t('home.mitLicense')}</span>
            <div className="w-px h-4 bg-slate-300"></div>
            <span className="ml-4">{t('home.crossPlatform')}</span>
          </div>
        </div>

        <div className="mt-16 max-w-4xl mx-auto bg-white p-4 rounded-xl shadow-md border border-slate-200">
          <CodeBlock code={codeExample} language="javascript" filename="noesis-sdk-demo.js" />
        </div>
      </div>
    </section>
  );
}
