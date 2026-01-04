import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatAttentionFeedback, getFocusStabilityLabel, getCognitiveLoadLabel } from "@/lib/utils";
import { useAttentionTracking } from "@/hooks/useAttentionTracking";
import { useMasteryTracking } from "@/hooks/useMasteryTracking";
import { useNoesisSDK } from "@/hooks/useNoesisSDK";

export default function Demo() {
  const contentRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [webcamEnabled, setWebcamEnabled] = useState(false);
  const [llmSuggestion, setLlmSuggestion] = useState(
    "Based on your attention patterns, would you like me to provide a visual example of how binary search works?"
  );
  
  // Define initial objectives with useRef to prevent recreating on each render
  const initialObjectives = useRef([
    { id: 'search_basics', name: 'Search Algorithms Basics', progress: 0.644 },
    { id: 'binary_search', name: 'Binary Search Implementation', progress: 0.315 },
    { id: 'time_complexity', name: 'Algorithm Time Complexity', progress: 0 }
  ]);
  
  const { startTracking, stopTracking, attentionData } = useAttentionTracking();
  const { recordProgress, masteryData } = useMasteryTracking(initialObjectives.current);
  
  const sdk = useNoesisSDK();

  useEffect(() => {
    document.title = "Noesis SDK - Live Demo";
    
    return () => {
      if (webcamEnabled) stopTracking();
    };
  }, [webcamEnabled, stopTracking]);

  useEffect(() => {
    // Create a ref to the video element to use in the SDK
    if (webcamEnabled && videoRef.current) {
      const videoElement = videoRef.current;
      // This needs to happen after video element is rendered
      const setupStream = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: false 
          });
          videoElement.srcObject = stream;
          videoElement.play();
        } catch (err) {
          console.error("Error accessing webcam:", err);
        }
      };
      setupStream();
    }
  }, [webcamEnabled, videoRef]);

  const toggleWebcam = async () => {
    if (webcamEnabled) {
      stopTracking();
      setWebcamEnabled(false);
      
      // Stop the video stream
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
    } else {
      const success = await startTracking(contentRef.current);
      if (success) {
        setWebcamEnabled(true);
      }
    }
  };

  const handleShowExample = async () => {
    setLlmSuggestion("Loading a visual example of binary search algorithm...");
    
    try {
      const response = await sdk.orchestration.getNextStep({
        learnerState: sdk.getLearnerState(),
        context: 'requested visual example of binary search'
      });
      
      setLlmSuggestion(response.suggestion || "Here's a step-by-step visualization of how binary search works by repeatedly dividing the search interval in half.");
      
      // Record progress for binary search concept
      recordProgress('binary_search', 0.1);
    } catch (error) {
      setLlmSuggestion("I couldn't load the example at this time. Would you like to try a different explanation instead?");
    }
  };

  const handleContinue = () => {
    setLlmSuggestion("Moving on to the next concept: Time Complexity Analysis. Would you like me to explain this concept with examples?");
    recordProgress('time_complexity', 0.1);
  };

  const feedback = formatAttentionFeedback(attentionData.score);

  return (
    <section className="py-16 bg-slate-50">
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
              
              <div className="bg-slate-800 rounded-lg overflow-hidden mb-4 aspect-video flex items-center justify-center relative">
                {webcamEnabled ? (
                  <div className="w-full h-full relative">
                    <video 
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      autoPlay 
                      muted 
                      playsInline
                      id="attention-tracking-video"
                    />
                    <div className="absolute bottom-4 right-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <span className="w-2 h-2 mr-1 bg-green-500 rounded-full animate-pulse"></span>
                        Tracking Active
                      </span>
                    </div>
                    <div className="absolute top-4 right-4 bg-black bg-opacity-50 p-2 rounded-lg text-white text-xs">
                      <p>Attention Score: {Math.round(attentionData.score * 100)}%</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center">
                      <i className="fas fa-video-slash text-slate-500 text-2xl"></i>
                    </div>
                    <p className="text-slate-400 text-sm">
                      Enable camera to track attention
                    </p>
                  </div>
                )}
                <Button 
                  onClick={toggleWebcam}
                  className={`absolute bottom-4 left-4 ${webcamEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'}`}
                >
                  {webcamEnabled ? 'Disable Camera' : 'Enable Camera'}
                </Button>
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">Attention Score</span>
                  <span className="text-sm font-medium text-slate-700">{Math.round(attentionData.score * 100)}%</span>
                </div>
                <Progress value={attentionData.score * 100} className="h-2 bg-slate-200" />
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">Focus Stability</span>
                  <span className="text-sm font-medium text-slate-700">{getFocusStabilityLabel(attentionData.focusStability)}</span>
                </div>
                <Progress value={attentionData.focusStability * 100} className="h-2 bg-slate-200" />
              </div>
              
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">Cognitive Load</span>
                  <span className="text-sm font-medium text-slate-700">{getCognitiveLoadLabel(attentionData.cognitiveLoad)}</span>
                </div>
                <Progress value={attentionData.cognitiveLoad * 100} className="h-2 bg-slate-200" />
              </div>
              
              <div className="mt-6 py-3 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                <i className={`fas ${feedback.icon} mr-2`}></i>
                {feedback.message}
              </div>
            </div>
            
            {/* Learning Content */}
            <div className="p-6 bg-slate-50" ref={contentRef}>
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
                      {llmSuggestion}
                    </p>
                    <div className="mt-3 flex space-x-3">
                      <Button 
                        onClick={handleShowExample}
                        className="text-xs font-medium px-3 py-1 h-auto bg-primary-600 hover:bg-primary-700"
                      >
                        Yes, show example
                      </Button>
                      <Button 
                        onClick={handleContinue}
                        variant="outline" 
                        className="text-xs font-medium px-3 py-1 h-auto text-primary-700 border-primary-300 hover:bg-primary-50"
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
                  {masteryData.map((item) => (
                    <div key={item.id}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-medium text-slate-700">{item.name}</span>
                        <span className={`text-xs font-medium ${
                          item.progress > 0.8 ? 'text-green-600' : 
                          item.progress > 0.4 ? 'text-yellow-600' : 
                          'text-slate-600'
                        }`}>
                          {item.progress > 0 
                            ? `${item.progress > 0.8 ? 'Mastered' : 'In Progress'} (${Math.round(item.progress * 100)}%)` 
                            : 'Not Started (0%)'}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${
                            item.progress > 0.8 ? 'bg-green-500' : 
                            item.progress > 0 ? 'bg-yellow-500' : 
                            'bg-slate-400'
                          } rounded-full`} 
                          style={{ width: `${Math.round(item.progress * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="max-w-3xl mx-auto mt-10 text-center">
          <Button className="bg-primary-600 hover:bg-primary-700" asChild>
            <a href="#getstarted">
              Try the SDK
              <i className="fas fa-arrow-right ml-2"></i>
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
