declare module "pdf-parse" {
  interface PdfInfo {
    Title?: string;
    Author?: string;
    Subject?: string;
    Creator?: string;
    Producer?: string;
    CreationDate?: string;
    ModDate?: string;
  }

  interface PdfData {
    numpages: number;
    numrender: number;
    info?: PdfInfo;
    metadata?: unknown;
    text: string;
    version?: string;
  }

  interface PdfOptions {
    max?: number;
    pagerender?: (pageData: unknown) => string;
  }

  function pdfParse(dataBuffer: Buffer, options?: PdfOptions): Promise<PdfData>;
  export default pdfParse;
}

declare module "turndown" {
  interface TurndownOptions {
    headingStyle?: "setext" | "atx";
    hr?: string;
    bulletListMarker?: "-" | "+" | "*";
    codeBlockStyle?: "indented" | "fenced";
    fence?: "```" | "~~~";
    emDelimiter?: "_" | "*";
    strongDelimiter?: "__" | "**";
    linkStyle?: "inlined" | "reference";
    linkReferenceStyle?: "full" | "collapsed" | "shortcut";
    preformattedCode?: boolean;
  }

  interface TurndownRule {
    filter: string | string[] | ((node: unknown) => boolean);
    replacement: (content: string, node: unknown) => string;
  }

  class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(html: string): string;
    addRule(key: string, rule: TurndownRule): this;
    keep(selector: string | string[]): this;
    remove(selector: string | string[]): this;
    escape(str: string): string;
    use(plugin: (service: TurndownService) => TurndownService): this;
  }

  export default TurndownService;
}