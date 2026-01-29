import { Button } from "@/components/ui/button";
import { sectionComponents } from "@/components/docs";

interface DocContentProps {
  activeSection: string;
}

export default function DocContent({ activeSection }: DocContentProps) {
  const renderContent = () => {
    const SectionComponent = sectionComponents[activeSection];

    if (SectionComponent) {
      return <SectionComponent />;
    }

    return (
      <div className="p-6 text-center">
        <p className="text-slate-600">Select a section from the sidebar to view documentation.</p>
      </div>
    );
  };

  return (
    <div className="flex-1 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6">
        {renderContent()}

        <div className="flex justify-between mt-8 pt-4 border-t border-slate-200">
          <Button variant="ghost" className="text-primary-600 hover:text-primary-700 font-medium text-sm" asChild>
            <a href="#">← Installation</a>
          </Button>
          <Button variant="ghost" className="text-primary-600 hover:text-primary-700 font-medium text-sm" asChild>
            <a href="#">LLM Integration →</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
