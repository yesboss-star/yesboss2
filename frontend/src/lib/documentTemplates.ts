import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { saveAs } from "file-saver";

export interface TemplateMeta {
  title: string;
  category: string;
  whyItHelps: string;
  exampleContents?: string;
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function safeFilename(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 26, color: "4338CA" }),
    ],
  });
}

function labelLine(label: string, hint: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22 }),
      new TextRun({ text: hint, italics: true, size: 22, color: "6B7280" }),
    ],
  });
}

function blankLine(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: "" })],
    spacing: { after: 200 },
  });
}

function promptBox(prompt: string): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 200, after: 80 },
      children: [
        new TextRun({
          text: "Suggested prompts — answer any that apply:",
          bold: true,
          size: 22,
          color: "6B7280",
        }),
      ],
    }),
    ...prompt
      .split("|")
      .map((q) => q.trim())
      .filter(Boolean)
      .map(
        (q) =>
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: `• ${q}`, size: 22, color: "374151" })],
          })
      ),
  ];
}

const CATEGORY_PROMPTS: Record<string, string> = {
  financial:
    "What is your current monthly revenue?|What are your top 3 expenses?|What is your gross margin?|Who are your top 5 customers by spend?",
  products:
    "What products or services do you offer?|What is the price range for each?|Which is your most profitable offering?|What is unique about your product?",
  customers:
    "Who is your ideal customer profile?|How do you currently acquire customers?|What is your typical deal size?|What is your customer retention rate?",
  operations:
    "Describe your day-to-day operations.|Which processes are bottlenecks?|Which tools do you use daily?|Which tasks take the most time?",
  strategy:
    "What are your top 3 goals for the next quarter?|Who are your main competitors?|What is your biggest growth blocker?|What does success look like in 12 months?",
  team:
    "How many people are on your team?|List roles and responsibilities.|Who reports to whom?|Which roles are you hiring for?",
  marketing:
    "Which channels drive the most leads?|What is your customer acquisition cost?|Describe your sales funnel.|What is your current conversion rate?",
  legal:
    "List the key contracts and agreements you have in place.|Any pending legal matters?|What is your entity structure?|Any regulatory requirements?",
  technology:
    "List your core tech stack and tools.|Which systems hold critical business data?|Any planned migrations or upgrades?|Who manages your infrastructure?",
  general:
    "Briefly describe what your company does.|Who do you serve?|What problem do you solve?|What makes you different from competitors?",
};

function categoryPromptBucket(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("finan") || c.includes("revenue") || c.includes("pricing")) return CATEGORY_PROMPTS.financial;
  if (c.includes("product") || c.includes("service") || c.includes("catalog")) return CATEGORY_PROMPTS.products;
  if (c.includes("customer") || c.includes("sales") || c.includes("market")) return CATEGORY_PROMPTS.marketing;
  if (c.includes("oper") || c.includes("process") || c.includes("sop")) return CATEGORY_PROMPTS.operations;
  if (c.includes("goal") || c.includes("strateg") || c.includes("okr")) return CATEGORY_PROMPTS.strategy;
  if (c.includes("team") || c.includes("org") || c.includes("people") || c.includes("hr")) return CATEGORY_PROMPTS.team;
  if (c.includes("legal") || c.includes("contract") || c.includes("compliance")) return CATEGORY_PROMPTS.legal;
  if (c.includes("tech") || c.includes("software") || c.includes("it")) return CATEGORY_PROMPTS.technology;
  return CATEGORY_PROMPTS.general;
}

function buildCoverPage(meta: TemplateMeta, companyName: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: companyName || "Your Company",
          bold: true,
          size: 40,
          color: "4338CA",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: titleCase(meta.title),
          bold: true,
          size: 32,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Category: ${titleCase(meta.category.replace(/_/g, " "))}`,
          italics: true,
          size: 22,
          color: "6B7280",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text:
            "Fill out the sections below so YesBoss can build a sharper picture of your business.",
          italics: true,
          size: 22,
          color: "6B7280",
        }),
      ],
    }),
    blankLine(),
  ];
}

function buildOverviewSection(): Paragraph[] {
  return [
    sectionHeading("1. Overview"),
    labelLine(
      "Purpose of this document",
      "Briefly explain what this captures for your team."
    ),
    blankLine(),
    labelLine(
      "Owner",
      "Who is responsible for keeping this up to date?"
    ),
    blankLine(),
    labelLine(
      "Last updated",
      "Add the date of the most recent revision."
    ),
    blankLine(),
  ];
}

function buildKeyDetailsSection(meta: TemplateMeta): Paragraph[] {
  const bucket = categoryPromptBucket(meta.category);
  return [
    sectionHeading("2. Key Details & Answers"),
    labelLine(
      "Why this matters",
      meta.whyItHelps || "Helps the AI personalise answers for your business."
    ),
    blankLine(),
    ...(meta.exampleContents
      ? [
          labelLine("Example contents", meta.exampleContents),
          blankLine(),
        ]
      : []),
    new Paragraph({
      spacing: { before: 100, after: 120 },
      children: [
        new TextRun({
          text: "Your answers",
          bold: true,
          size: 24,
        }),
      ],
    }),
    ...promptBox(bucket),
    blankLine(),
  ];
}

function buildChecklistSection(): Paragraph[] {
  const checks = [
    "Reviewed by leadership",
    "Numbers verified against source data",
    "Uploaded to YesBoss or pasted into the text box",
    "Next review date set",
  ];
  return [
    sectionHeading("3. Sign-off Checklist"),
    ...checks.map(
      (c) =>
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: `☐  ${c}`, size: 22 })],
        })
    ),
    blankLine(),
  ];
}

function buildSummaryTable(): Table {
  const header = new TableRow({
    children: ["Metric", "Current", "Target"].map(
      (h) =>
        new TableCell({
          width: { size: 33, type: WidthType.PERCENTAGE },
          shading: { fill: "EEF2FF" },
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true, size: 22 })],
            }),
          ],
        })
    ),
  });
  const rows = [1, 2, 3, 4].map(
    () =>
      new TableRow({
        children: ["", "", ""].map(
          (v) =>
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: v, size: 22 })] }),
              ],
            })
        ),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...rows],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
    },
  });
}

function buildMetricsSection(): (Paragraph | Table)[] {
  return [
    sectionHeading("4. Key Metrics"),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: "Track 3–5 numbers that tell the story for this document.",
          italics: true,
          size: 22,
          color: "6B7280",
        }),
      ],
    }),
    buildSummaryTable(),
    blankLine(),
  ];
}

export async function downloadDocumentTemplate(
  meta: TemplateMeta,
  companyName: string
): Promise<void> {
  const doc = new Document({
    creator: "YesBoss AI",
    title: `${meta.title} — ${companyName || "Template"}`,
    description: "AI-generated template. Edit and submit to YesBoss.",
    sections: [
      {
        properties: {},
        children: [
          ...buildCoverPage(meta, companyName),
          ...buildOverviewSection(),
          ...buildKeyDetailsSection(meta),
          ...buildMetricsSection(),
          ...buildChecklistSection(),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 400 },
            children: [
              new TextRun({
                text: "Generated by YesBoss AI · Edit freely before uploading",
                italics: true,
                size: 20,
                color: "9CA3AF",
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${safeFilename(meta.title) || "template"}-${safeFilename(companyName) || "yesboss"}.docx`;
  saveAs(blob, filename);
}
