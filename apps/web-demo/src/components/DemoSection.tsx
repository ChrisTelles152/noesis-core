import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";

export default function DemoSection() {
  return (
    <section id="demo" className="py-16 bg-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900">Live Demo</h2>
          <p className="mt-4 text-lg text-slate-600">
            See the Noesis SDK in action with this interactive demonstration
          </p>
        </div>
        
        <div className="max-w-5xl mx-auto bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden">
          <div className="grid md:grid-cols-2">
            {/* Demo Player */}
            <div className="p-6 border-b md:border-b-0 md:border-r border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Attention Tracking Demo</h3>
              
              <div className="bg-slate-800 rounded-lg overflow-hidden mb-4 aspect-video flex items-center justify-center">
                <div className="text-center p-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center">
                    <i className="fas fa-video text-slate-500 text-2xl"></i>
                  </div>
                  <p className="text-slate-400 text-sm">Webcam feed will appear here</p>
                  <Button className="mt-4">
                    Enable Camera
                  </Button>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">Attention Score</span>
                  <span className="text-sm font-medium text-slate-700">75%</span>
                </div>
                <Progress value={75} className="h-2" />
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">Focus Stability</span>
                  <span className="text-sm font-medium text-slate-700">Medium</span>
                </div>
                <Progress value={60} className="h-2" />
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">Cognitive Load</span>
                  <span className="text-sm font-medium text-slate-700">Low</span>
                </div>
                <Progress value={30} className="h-2" />
              </div>
              
              <div className="mt-6 py-3 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                <i className="fas fa-info-circle text-slate-400 mr-2"></i>
                Your attention level is good. You seem engaged with the content.
              </div>
            </div>
            
            {/* Learning Content */}
            <div className="p-6 bg-slate-50">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Learning Content</h3>
                <div className="flex items-center text-sm font-medium text-slate-600">
                  <span>Progress:</span>
                  <span className="ml-2 text-primary-600">2/5</span>
                </div>
              </div>
              
              <div className="bg-white border border-slate-200 rounded-lg p-5 mb-4">
                <h4 className="font-medium text-slate-900 mb-2">Concept: Binary Search Algorithm</h4>
                <p className="text-slate-700 text-sm mb-3">
                  Binary search is an efficient algorithm for finding an item from a sorted list of items. It works by repeatedly dividing in half the portion of the list that could contain the item, until you've narrowed down the possible locations to just one.
                </p>
                
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="bg-slate-50 p-3 rounded text-sm">
                    <div className="font-medium text-slate-900 mb-1">Key points:</div>
                    <ul className="list-disc pl-5 text-slate-700 space-y-1">
                      <li>Works only on sorted arrays</li>
                      <li>O(log n) time complexity</li>
                      <li>More efficient than linear search for large datasets</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              {/* Adaptive learning suggestion from LLM */}
              <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <i className="fas fa-robot text-primary-600"></i>
                    </div>
                  </div>
                  <div className="ml-3">
                    <h4 className="text-sm font-medium text-primary-800">Adaptive Suggestion</h4>
                    <p className="mt-1 text-sm text-primary-700">
                      Based on your attention patterns, would you like me to provide a visual example of how binary search works?
                    </p>
                    <div className="mt-3 flex space-x-3">
                      <Button 
                        className="text-xs font-medium px-3 py-1 h-auto"
                        size="sm"
                      >
                        Yes, show example
                      </Button>
                      <Button 
                        variant="outline" 
                        className="text-xs font-medium px-3 py-1 h-auto text-primary-700 border-primary-300 hover:bg-primary-50"
                        size="sm"
                      >
                        Continue to next concept
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Mastery progress */}
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <h4 className="font-medium text-slate-900 mb-3">Concept Mastery</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">Search Algorithms Basics</span>
                      <span className="text-xs font-medium text-green-600">Mastered (92%)</span>
                    </div>
                    <Progress value={92} className="h-2" />
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">Binary Search Implementation</span>
                      <span className="text-xs font-medium text-yellow-600">In Progress (45%)</span>
                    </div>
                    <Progress value={45} className="h-2 bg-yellow-500" />
                  </div>
                  
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">Algorithm Time Complexity</span>
                      <span className="text-xs font-medium text-slate-600">Not Started (0%)</span>
                    </div>
                    <Progress value={0} className="h-2 bg-slate-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="max-w-3xl mx-auto mt-10 text-center">
          <Button asChild>
            <Link href="/demo">
              <a className="inline-flex items-center">
                Try the Full Demo
                <i className="fas fa-arrow-right ml-2"></i>
              </a>
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
