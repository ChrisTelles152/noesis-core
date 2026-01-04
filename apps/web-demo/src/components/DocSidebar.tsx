import { Button } from "@/components/ui/button";

interface DocSidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

export default function DocSidebar({ activeSection, setActiveSection }: DocSidebarProps) {
  const sections = [
    { id: "getting-started", label: "Getting Started" },
    { id: "installation", label: "Installation" },
    { id: "basic-usage", label: "Basic Usage" },
    { id: "attention-tracking", label: "Attention Tracking" },
    { id: "mastery-learning", label: "Mastery Learning" },
    { id: "llm-integration", label: "LLM Integration" },
    { id: "api-reference", label: "API Reference" },
    { id: "examples", label: "Examples" }
  ];

  return (
    <div className="lg:w-64 shrink-0">
      <div className="sticky top-24 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-medium text-slate-900">Documentation</h3>
        </div>
        <nav className="p-2">
          <div className="space-y-1">
            {sections.map((section) => (
              <Button 
                key={section.id}
                variant="ghost" 
                className={`w-full justify-start text-sm px-3 py-2 h-auto rounded-md ${
                  activeSection === section.id 
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </Button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
