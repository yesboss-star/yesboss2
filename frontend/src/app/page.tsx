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
import { StandaloneRedirect } from "@/components/StandaloneRedirect";

export default function Home() {
  return (
    <>
      <StandaloneRedirect />
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
