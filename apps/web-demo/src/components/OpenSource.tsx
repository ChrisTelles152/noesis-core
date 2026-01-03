import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function OpenSource() {
  const openSourceComponents = [
    "Core SDK (JavaScript/TypeScript)",
    "Basic attention tracking",
    "Mastery learning logic",
    "Platform adapters",
    "Documentation and examples"
  ];

  const premiumServices = [
    "LLM Orchestration API",
    "Advanced analytics dashboard",
    "A/B testing infrastructure",
    "Enterprise support",
    "Custom integrations"
  ];

  return (
    <section id="license" className="py-16 bg-slate-50 border-t border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-sm">
            <CardContent className="p-6 sm:p-10">
              <div className="flex flex-col sm:flex-row items-start sm:items-center">
                <div className="flex-shrink-0 bg-primary-100 rounded-full p-3 sm:mr-6 mb-4 sm:mb-0">
                  <i className="fab fa-github text-primary-600 text-2xl"></i>
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Open Source Project</h3>
                  <p className="mt-2 text-slate-600">
                    Noesis follows an open-core model, with core SDK components under MIT license
                  </p>
                </div>
              </div>
              
              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-5">
                  <h4 className="font-semibold text-slate-900 mb-2 flex items-center">
                    <i className="fas fa-code text-primary-500 mr-2"></i>
                    Open Source Components
                  </h4>
                  <ul className="mt-2 space-y-2 text-sm">
                    {openSourceComponents.map((component, index) => (
                      <li key={index} className="flex items-start">
                        <i className="fas fa-check text-emerald-500 mt-1 mr-2"></i>
                        <span className="text-slate-700">{component}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <Button variant="ghost" className="text-sm font-medium text-primary-600 hover:text-primary-700 p-0" asChild>
                      <a 
                        href="https://github.com/noesis-sdk" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center"
                      >
                        View on GitHub
                        <i className="fas fa-external-link-alt ml-1 text-xs"></i>
                      </a>
                    </Button>
                  </div>
                </div>
                
                <div className="bg-primary-50 rounded-lg border border-primary-200 p-5">
                  <h4 className="font-semibold text-slate-900 mb-2 flex items-center">
                    <i className="fas fa-puzzle-piece text-primary-500 mr-2"></i>
                    Premium Services
                  </h4>
                  <ul className="mt-2 space-y-2 text-sm">
                    {premiumServices.map((service, index) => (
                      <li key={index} className="flex items-start">
                        <i className="fas fa-star text-amber-500 mt-1 mr-2"></i>
                        <span className="text-slate-700">{service}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 pt-4 border-t border-primary-200">
                    <Button variant="ghost" className="text-sm font-medium text-primary-700 hover:text-primary-800 p-0" asChild>
                      <Link href="#contact">
                        <a className="inline-flex items-center">
                          Contact for enterprise options
                          <i className="fas fa-arrow-right ml-1 text-xs"></i>
                        </a>
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 pt-6 border-t border-slate-200">
                <div className="flex items-start">
                  <div className="flex-shrink-0 mt-1">
                    <i className="fas fa-lightbulb text-amber-500"></i>
                  </div>
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-slate-900">Why Open Core?</h4>
                    <p className="mt-1 text-sm text-slate-600">
                      We believe in open collaboration and transparency while maintaining a sustainable business model that allows us to continuously improve the SDK and provide premium services for enterprise customers.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
