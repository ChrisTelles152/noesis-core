import { useEffect, useState } from "react";
import DocSidebar from "@/components/DocSidebar";
import DocContent from "@/components/DocContent";

export default function Documentation() {
  const [activeSection, setActiveSection] = useState("getting-started");
  
  useEffect(() => {
    document.title = "Noesis SDK - Documentation";
  }, []);

  return (
    <section className="py-16 bg-white border-t border-b border-slate-200">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900">Documentation</h2>
          <p className="mt-4 text-lg text-slate-600">
            Everything you need to integrate Noesis into your project
          </p>
        </div>
        
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
          <DocSidebar activeSection={activeSection} setActiveSection={setActiveSection} />
          <DocContent activeSection={activeSection} />
        </div>
      </div>
    </section>
  );
}
