import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Architecture() {
  const architectureLayers = [
    {
      layer: "Layer 1",
      icon: "fa-eye",
      title: "Input Adapters",
      description: "Capture and normalize attention signals from webcams, eye tracking, mouse movement, and other input sources.",
      supports: ["Webcam", "Mouse/Touch", "XR Devices"]
    },
    {
      layer: "Layer 2",
      icon: "fa-brain",
      title: "Attention Engine",
      description: "Processes raw inputs into normalized attention scores. Detects focus, cognitive load, and engagement levels.",
      features: ["Focus Detection", "Cognitive Load", "Engagement"]
    },
    {
      layer: "Layer 3",
      icon: "fa-robot",
      title: "Orchestration",
      description: "LLM-powered adaptive learning logic that dynamically adjusts content, pacing, and feedback based on learner state.",
      capabilities: [
        { name: "LLM Integration", primary: true },
        { name: "Mastery Tracking", primary: false },
        { name: "Adaptive Pacing", primary: false }
      ]
    }
  ];

  return (
    <section id="architecture" className="py-16 bg-white border-t border-b border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900">Modular Architecture</h2>
          <p className="mt-4 text-lg text-slate-600">
            Noesis SDK provides a flexible, adaptable learning intelligence layer
            that can be integrated into any application or platform.
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {architectureLayers.map((layer, index) => (
            <div key={index} className="relative bg-white rounded-lg border border-slate-200 shadow-sm p-6 flex flex-col">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary-600 text-white text-xs px-2 py-1 rounded-full">
                {layer.layer}
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-md bg-primary-100 text-primary-600 mb-4">
                <i className={`fas ${layer.icon} text-xl`}></i>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{layer.title}</h3>
              <p className="text-slate-600 text-sm flex-1">
                {layer.description}
              </p>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <span className="text-xs font-medium text-slate-800">
                  {layer.supports ? 'Supports:' : layer.features ? 'Features:' : 'Capabilities:'}
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {layer.supports && layer.supports.map((item, idx) => (
                    <Badge key={idx} variant="secondary" className="bg-slate-100 text-slate-800 hover:bg-slate-200">
                      {item}
                    </Badge>
                  ))}
                  {layer.features && layer.features.map((item, idx) => (
                    <Badge key={idx} variant="secondary" className="bg-slate-100 text-slate-800 hover:bg-slate-200">
                      {item}
                    </Badge>
                  ))}
                  {layer.capabilities && layer.capabilities.map((item, idx) => (
                    <Badge 
                      key={idx} 
                      variant="secondary" 
                      className={item.primary 
                        ? "bg-primary-100 text-primary-600 hover:bg-primary-200" 
                        : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                      }
                    >
                      {item.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-16 max-w-5xl mx-auto bg-slate-50 rounded-lg border border-slate-200 p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900">Open Source Core + Proprietary Services</h3>
              <p className="mt-2 text-slate-600">
                Noesis follows an open-core model, with core SDK components under MIT license, while the LLM orchestration layer is available as a SaaS service.
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <a href="#license" className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium">
                Learn more about licensing
                <i className="fas fa-arrow-right ml-2"></i>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
