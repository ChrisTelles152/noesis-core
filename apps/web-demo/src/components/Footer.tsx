import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="bg-slate-900 py-12">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between">
          <div className="mb-8 md:mb-0">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-primary-600 to-secondary-500 rounded-lg">
                <span className="text-white text-xl font-bold">N</span>
              </div>
              <span className="text-xl font-semibold tracking-tight text-white">Noesis SDK</span>
            </div>
            <p className="mt-4 text-slate-400 max-w-md">
              The universal infrastructure layer for adaptive, attention-aware learning experiences across all platforms.
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Product</h3>
              <ul className="mt-4 space-y-2">
                <li><Link href="/#features" className="text-slate-400 hover:text-white">Features</Link></li>
                <li><Link href="/documentation" className="text-slate-400 hover:text-white">Documentation</Link></li>
                <li><Link href="/demo" className="text-slate-400 hover:text-white">Demo</Link></li>
                <li><Link href="/#getstarted" className="text-slate-400 hover:text-white">Get Started</Link></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Resources</h3>
              <ul className="mt-4 space-y-2">
                <li><a href="https://github.com/noesis-sdk" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white">GitHub</a></li>
                <li><Link href="/documentation" className="text-slate-400 hover:text-white">Examples</Link></li>
                <li><Link href="/documentation" className="text-slate-400 hover:text-white">API Reference</Link></li>
                <li><a href="https://github.com/noesis-sdk/community" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white">Community</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wider uppercase">Company</h3>
              <ul className="mt-4 space-y-2">
                <li><Link href="/about" className="text-slate-400 hover:text-white">About</Link></li>
                <li><Link href="/blog" className="text-slate-400 hover:text-white">Blog</Link></li>
                <li><a href="mailto:contact@noesis-sdk.dev" className="text-slate-400 hover:text-white">Contact</a></li>
                <li><Link href="/careers" className="text-slate-400 hover:text-white">Careers</Link></li>
              </ul>
            </div>
          </div>
        </div>
        
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center">
          <div className="text-slate-400 text-sm">
            &copy; {new Date().getFullYear()} Noesis SDK. All rights reserved.
          </div>
          
          <div className="mt-4 md:mt-0 flex space-x-6">
            <Link href="/terms" className="text-slate-400 hover:text-white">Terms</Link>
            <Link href="/privacy" className="text-slate-400 hover:text-white">Privacy</Link>
            <Link href="/security" className="text-slate-400 hover:text-white">Security</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
