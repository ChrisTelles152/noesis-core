import { Button } from "@/components/ui/button";

export default function CTA() {
  return (
    <section id="contact" className="bg-gradient-to-b from-primary-600 to-primary-800 py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white">Ready to Integrate Adaptive Learning?</h2>
          <p className="mt-4 text-xl text-primary-100">
            Join our community or get in touch for enterprise solutions
          </p>
          
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <Button variant="secondary" size="lg" className="w-full sm:w-auto text-primary-800" asChild>
              <a 
                href="https://github.com/noesis-sdk" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center"
              >
                <i className="fab fa-github text-lg mr-2"></i>
                Star on GitHub
              </a>
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="w-full sm:w-auto border-primary-300 text-white hover:bg-primary-700" 
              asChild
            >
              <a href="mailto:contact@noesis-sdk.dev" className="inline-flex items-center">
                <i className="fas fa-envelope text-lg mr-2"></i>
                Contact Us
              </a>
            </Button>
          </div>
          
          <div className="mt-8 flex items-center justify-center space-x-6">
            <a href="https://twitter.com/noesis_sdk" target="_blank" rel="noopener noreferrer" className="text-primary-200 hover:text-white">
              <i className="fab fa-twitter text-xl"></i>
              <span className="sr-only">Twitter</span>
            </a>
            <a href="https://discord.gg/noesis-sdk" target="_blank" rel="noopener noreferrer" className="text-primary-200 hover:text-white">
              <i className="fab fa-discord text-xl"></i>
              <span className="sr-only">Discord</span>
            </a>
            <a href="https://linkedin.com/company/noesis-sdk" target="_blank" rel="noopener noreferrer" className="text-primary-200 hover:text-white">
              <i className="fab fa-linkedin text-xl"></i>
              <span className="sr-only">LinkedIn</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
