import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import Features from "@/components/Features";
import AIInsights from "@/components/AIInsights";
import DashboardPreview from "@/components/DashboardPreview";
import Integrations from "@/components/Integrations";
import Testimonials from "@/components/Testimonials";
import FAQ from "@/components/FAQ";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <HeroSection />
      <Features />
      <AIInsights />
      <DashboardPreview />
      <Integrations />
      <Testimonials />
      <FAQ />
      <CTASection />
      <Footer />
    </>
  );
}
