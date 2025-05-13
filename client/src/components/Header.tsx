import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const isActive = (path: string) => {
    return location === path;
  };

  return (
    <header className={`sticky top-0 z-50 bg-white border-b border-slate-200 ${scrolled ? 'shadow-sm' : ''}`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-3">
            <Link href="/">
              <a className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-primary-600 to-secondary-500 rounded-lg">
                  <span className="text-white text-xl font-bold">N</span>
                </div>
                <span className="text-xl font-semibold tracking-tight text-slate-900">Noesis SDK</span>
              </a>
            </Link>
          </div>
          
          <nav className="hidden md:flex items-center space-x-8">
            <Link href="/#features">
              <a className={`text-slate-600 hover:text-primary-600 transition-colors text-sm font-medium ${isActive('/#features') ? 'text-primary-600' : ''}`}>Features</a>
            </Link>
            <Link href="/documentation">
              <a className={`text-slate-600 hover:text-primary-600 transition-colors text-sm font-medium ${isActive('/documentation') ? 'text-primary-600' : ''}`}>Documentation</a>
            </Link>
            <Link href="/demo">
              <a className={`text-slate-600 hover:text-primary-600 transition-colors text-sm font-medium ${isActive('/demo') ? 'text-primary-600' : ''}`}>Demo</a>
            </Link>
            <a 
              href="https://github.com/noesis-sdk" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-slate-600 hover:text-primary-600 transition-colors text-sm font-medium"
            >
              GitHub
            </a>
          </nav>
          
          <div className="flex items-center space-x-4">
            <a 
              href="https://github.com/noesis-sdk" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hidden sm:flex items-center text-sm font-medium text-slate-700 hover:text-primary-600 transition-colors"
            >
              <i className="fab fa-github text-lg mr-2"></i>
              <span>Star on GitHub</span>
            </a>
            <Button asChild>
              <Link href="/#getstarted">
                <a>Get Started</a>
              </Link>
            </Button>
          </div>
          
          <button 
            className="md:hidden flex items-center" 
            onClick={toggleMobileMenu}
            aria-label="Toggle mobile menu"
          >
            <i className={`fas ${mobileMenuOpen ? 'fa-times' : 'fa-bars'} text-slate-700 text-xl`}></i>
          </button>
        </div>
      </div>
      
      {/* Mobile menu */}
      <div className={`md:hidden bg-white border-b border-slate-200 ${mobileMenuOpen ? 'block' : 'hidden'}`}>
        <div className="container mx-auto px-4 py-3 space-y-1">
          <Link href="/#features">
            <a className="block px-3 py-2 text-slate-600 rounded-md hover:bg-slate-100 hover:text-primary-600 transition-colors">Features</a>
          </Link>
          <Link href="/documentation">
            <a className="block px-3 py-2 text-slate-600 rounded-md hover:bg-slate-100 hover:text-primary-600 transition-colors">Documentation</a>
          </Link>
          <Link href="/demo">
            <a className="block px-3 py-2 text-slate-600 rounded-md hover:bg-slate-100 hover:text-primary-600 transition-colors">Demo</a>
          </Link>
          <a 
            href="https://github.com/noesis-sdk" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block px-3 py-2 text-slate-600 rounded-md hover:bg-slate-100 hover:text-primary-600 transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </header>
  );
}
