import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } from "docx"

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 24 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children: [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Infrastructure Migration Proposal")] }),
      new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun("Executive summary text goes here, multiple sentences to fill a paragraph.")] }),
      new Paragraph({ children: [new TextRun({ text: "Bold inline ", bold: true }), new TextRun("regular text.")] }),
    ],
  }],
})

Packer.toBuffer(doc).then(buf => process.stdout.write(buf.toString("base64")))
