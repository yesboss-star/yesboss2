"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const faqs = [
  {
    question: "What is YesBoss and how does it work?",
    answer:
      "YesBoss is an AI Business Operating System that uses multiple AI agents to analyze your business data, predict trends, automate workflows, and provide executive-level insights. Simply upload your documents, connect your tools, and the AI builds a comprehensive understanding of your organization.",
  },
  {
    question: "Do I need technical expertise to use YesBoss?",
    answer:
      "Not at all. YesBoss is designed for business leaders, not data scientists. You interact with it through natural language—just ask questions like you would a human analyst. The AI handles all the complexity behind the scenes.",
  },
  {
    question: "How does the AI learn about my business?",
    answer:
      "Through our multi-stage onboarding process: AI analyzes uploaded documents (PDFs, spreadsheets), scrapes your public web presence, engages in conversational intelligence gathering, and continuously learns from your daily operations and decisions.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Absolutely. We use enterprise-grade encryption, role-based access control, and your data is never shared or used to train models for other organizations. We're SOC 2 Type II compliant and GDPR ready.",
  },
  {
    question: "Can employees use YesBoss too?",
    answer:
      "Yes! YesBoss has dedicated employee workspaces with task management, AI assistant, productivity insights, and team collaboration features. Employees get personalized AI support based on their role and department.",
  },
  {
    question: "What happens during the free trial?",
    answer:
      "You get full access to all features for 14 days—no credit card required. The AI will onboard your organization, analyze your data, and start generating insights. You can explore dashboards, chat with the AI assistant, and see the full value before committing.",
  },
  {
    question: "Which AI models does YesBoss use?",
    answer:
      "YesBoss uses a multi-model approach combining GPT-4, Claude, Groq, and Qwen. Our master agent intelligently routes queries to the best model for each task, ensuring optimal accuracy and performance.",
  },
  {
    question: "Can I integrate YesBoss with my existing tools?",
    answer:
      "YesBoss integrates with popular tools like Gmail, Slack, Google Calendar, Google Drive, MongoDB, Supabase, and many more. Our integration library grows constantly, and we offer API access for custom connections.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-24 relative">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-1.5 rounded-full glass-light text-sm text-primary mb-4">
            FAQ
          </span>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Common <span className="gradient-text">Questions</span>
          </h2>
          <p className="text-text-muted max-w-2xl mx-auto text-lg">
            Everything you need to know about YesBoss.
          </p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="glass rounded-xl overflow-hidden card-hover"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
              >
                <span className="font-medium pr-4">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-text-muted flex-shrink-0 transition-transform duration-200 ${
                    openIndex === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openIndex === i && (
                <div className="px-5 pb-5">
                  <p className="text-text-muted text-sm leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
