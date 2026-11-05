import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import { writeFileSync, mkdirSync } from 'node:fs'

async function main() {
  const doc = new Document({
    numbering: {
      config: [{ reference: 'bul', levels: [{ level: 0, format: 'bullet', text: '•', alignment: 'left' }] }],
    },
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Sample heading')] }),
        new Paragraph({ children: [new TextRun({ text: 'Bold run', bold: true }), new TextRun(' and plain.')] }),
        new Paragraph({ numbering: { reference: 'bul', level: 0 }, children: [new TextRun('First item')] }),
        new Paragraph({ numbering: { reference: 'bul', level: 0 }, children: [new TextRun('Second item')] }),
      ],
    }],
  })
  mkdirSync('tests/fixtures', { recursive: true })
  writeFileSync('tests/fixtures/sample.docx', await Packer.toBuffer(doc))
  writeFileSync('tests/fixtures/corrupt.docx', Buffer.from([0x13, 0x37, 0xde, 0xad, 0xbe, 0xef, 0x42, 0x99, 0x01, 0x7f]))
}
main()
