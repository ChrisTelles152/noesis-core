import { Card, CardContent } from "@/components/ui/card";

export default function Features() {
  const features = [
    {
      icon: "fa-webcam",
      title: "Webcam-Based Attention Tracking",
      description: "Use standard webcams to estimate user attention and engagement through gaze estimation, head pose, and facial expressions."
    },
    {
      icon: "fa-graduation-cap",
      title: "Mastery Learning System",
      description: "Track concept mastery with sophisticated spaced repetition algorithms and adaptive difficulty adjustment."
    },
    {
      icon: "fa-code",
      title: "Cross-Platform SDK",
      description: "JavaScript/TypeScript core works across web, mobile, and desktop platforms with platform-specific adapters."
    },
    {
      icon: "fa-brain",
      title: "LLM Orchestration",
      description: "Connect to LLMs for adaptive learning guidance, content selection, and personalized feedback based on learner state."
    },
    {
      icon: "fa-chart-line",
      title: "Learning Analytics",
      description: "Track engagement, mastery, and learning patterns with built-in analytics tools and visualizations."
    },
    {
      icon: "fa-puzzle-piece",
      title: "Modular Architecture",
      description: "Use only what you need with modular components for attention tracking, mastery learning, and LLM integration."
    }
  ];

  return (
    <section id="features" className="py-16 bg-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900">Key Features</h2>
          <p className="mt-4 text-lg text-slate-600">
            Everything you need to build attention-aware, adaptive learning experiences.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <Card key={index} className="border-slate-200 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary-100 text-primary-600 mb-4">
                  <i className={`fas ${feature.icon} text-xl`}></i>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
