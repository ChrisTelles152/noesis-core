import { useEffect } from "react";
import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Architecture from "@/components/Architecture";
import DemoSection from "@/components/DemoSection";
import GetStarted from "@/components/GetStarted";
import OpenSource from "@/components/OpenSource";
import CTA from "@/components/CTA";

export default function Home() {
  useEffect(() => {
    document.title = "Noesis Adaptive Learning SDK";
  }, []);

  return (
    <main>
      <Hero />
      <Architecture />
      <Features />
      <DemoSection />
      <GetStarted />
      <OpenSource />
      <CTA />
    </main>
  );
}
