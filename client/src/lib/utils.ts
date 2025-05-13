import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const calculateAttentionScore = (
  gazeData: any,
  targetElement: HTMLElement | null
): number => {
  if (!targetElement || !gazeData) return 0;
  
  // Simple attention calculation based on if gaze is in the element
  const elementRect = targetElement.getBoundingClientRect();
  const { x, y } = gazeData;
  
  const isInElement = 
    x >= elementRect.left &&
    x <= elementRect.right &&
    y >= elementRect.top &&
    y <= elementRect.bottom;
  
  // Return a score between 0 and 1
  return isInElement ? 0.8 + Math.random() * 0.2 : 0.2 + Math.random() * 0.3;
};

export const estimateGazeFromFace = (faceData: any): { x: number, y: number } => {
  // This is a simple approximation - would use more sophisticated 
  // algorithms in a production system
  if (!faceData || !faceData.landmarks) {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }
  
  // Get eye positions
  const leftEye = faceData.landmarks.leftEye;
  const rightEye = faceData.landmarks.rightEye;
  
  // Estimate gaze direction
  const x = (leftEye.x + rightEye.x) / 2;
  const y = (leftEye.y + rightEye.y) / 2;
  
  return { x, y };
};

export const getFocusStabilityLabel = (stabilityScore: number): string => {
  if (stabilityScore > 0.8) return "High";
  if (stabilityScore > 0.5) return "Medium";
  return "Low";
};

export const getCognitiveLoadLabel = (loadScore: number): string => {
  if (loadScore > 0.7) return "High";
  if (loadScore > 0.4) return "Medium";
  return "Low";
};

export const formatAttentionFeedback = (score: number): { message: string, icon: string } => {
  if (score > 0.75) {
    return {
      message: "Your attention level is excellent. You seem highly engaged with the content.",
      icon: "fa-check-circle text-green-500"
    };
  } else if (score > 0.5) {
    return {
      message: "Your attention level is good. You seem engaged with the content.",
      icon: "fa-info-circle text-blue-500"
    };
  } else {
    return {
      message: "Your attention seems to be drifting. Would you like a different explanation?",
      icon: "fa-exclamation-circle text-yellow-500"
    };
  }
};
