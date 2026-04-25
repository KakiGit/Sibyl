import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { ExternalLink } from "lucide-react";

interface WikiLinkContextType {
  navigateToSlug: (slug: string) => void;
  currentPageSlug: string | null;
  existingSlugs: Set<string>;
}

const WikiLinkContext = createContext<WikiLinkContextType | null>(null);

export function useWikiLink() {
  const context = useContext(WikiLinkContext);
  if (!context) {
    if (process.env.NODE_ENV === "development") {
      console.warn("useWikiLink must be used within a WikiLinkProvider");
    }
    return { navigateToSlug: () => {}, currentPageSlug: null, existingSlugs: new Set() };
  }
  return context;
}

export function WikiLinkProvider({
  children,
  onNavigate,
  existingSlugs = [],
}: {
  children: React.ReactNode;
  onNavigate?: (slug: string) => void;
  existingSlugs?: string[];
}) {
  const [currentPageSlug, setCurrentPageSlug] = useState<string | null>(null);
  const slugsSet = useMemo(() => new Set(existingSlugs), [existingSlugs]);

  const navigateToSlug = useCallback(
    (slug: string) => {
      setCurrentPageSlug(slug);
      onNavigate?.(slug);
    },
    [onNavigate]
  );

  return (
    <WikiLinkContext.Provider value={{ navigateToSlug, currentPageSlug, existingSlugs: slugsSet }}>
      {children}
    </WikiLinkContext.Provider>
  );
}

function WikiLink({ slug }: { slug: string }) {
  const { navigateToSlug, existingSlugs } = useWikiLink();
  const exists = existingSlugs.has(slug);

  return (
    <button
      onClick={() => navigateToSlug(slug)}
      className={`inline-flex items-center gap-1 px-1 rounded font-medium transition-colors ${
        exists
          ? "text-blue-600 hover:text-blue-800 hover:bg-blue-50 cursor-pointer"
          : "text-gray-400 hover:text-gray-600 cursor-pointer italic"
      }`}
      title={exists ? `Navigate to ${slug}` : `Create new page: ${slug}`}
    >
      <span className="text-gray-500">[[</span>
      <span className={exists ? "underline" : ""}>{slug}</span>
      <span className="text-gray-500">]]</span>
      {!exists && <ExternalLink className="h-3 w-3 ml-0.5" />}
    </button>
  );
}

export function renderWikiLinks(content: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const slug = match[1];
    parts.push(<WikiLink key={`link-${keyIndex++}`} slug={slug} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [content];
}

export function WikiContentRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const renderedLines: React.ReactNode[] = [];

  let inList = false;
  let listItems: React.ReactNode[] = [];
  let keyIndex = 0;

  for (const line of lines) {
    if (line.startsWith("# ")) {
      if (inList) {
        renderedLines.push(
          <ul key={`list-${keyIndex++}`} className="list-disc ml-4 mb-2">
            {listItems}
          </ul>
        );
        listItems = [];
        inList = false;
      }
      renderedLines.push(
        <h1 key={`h1-${keyIndex++}`} className="text-2xl font-bold mt-6 mb-4">
          {renderWikiLinks(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith("## ")) {
      if (inList) {
        renderedLines.push(
          <ul key={`list-${keyIndex++}`} className="list-disc ml-4 mb-2">
            {listItems}
          </ul>
        );
        listItems = [];
        inList = false;
      }
      renderedLines.push(
        <h2 key={`h2-${keyIndex++}`} className="text-xl font-semibold mt-6 mb-3">
          {renderWikiLinks(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("### ")) {
      if (inList) {
        renderedLines.push(
          <ul key={`list-${keyIndex++}`} className="list-disc ml-4 mb-2">
            {listItems}
          </ul>
        );
        listItems = [];
        inList = false;
      }
      renderedLines.push(
        <h3 key={`h3-${keyIndex++}`} className="text-lg font-semibold mt-4 mb-2">
          {renderWikiLinks(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("- ")) {
      inList = true;
      listItems.push(
        <li key={`li-${keyIndex++}`} className="mb-1">
          {renderWikiLinks(line.slice(2))}
        </li>
      );
    } else if (line.trim() === "") {
      if (inList) {
        renderedLines.push(
          <ul key={`list-${keyIndex++}`} className="list-disc ml-4 mb-2">
            {listItems}
          </ul>
        );
        listItems = [];
        inList = false;
      }
      renderedLines.push(<br key={`br-${keyIndex++}`} />);
    } else {
      if (inList) {
        renderedLines.push(
          <ul key={`list-${keyIndex++}`} className="list-disc ml-4 mb-2">
            {listItems}
          </ul>
        );
        listItems = [];
        inList = false;
      }
      renderedLines.push(
        <p key={`p-${keyIndex++}`} className="mb-2">
          {renderWikiLinks(line)}
        </p>
      );
    }
  }

  if (inList && listItems.length > 0) {
    renderedLines.push(
      <ul key={`list-final`} className="list-disc ml-4 mb-2">
        {listItems}
      </ul>
    );
  }

  return <div className="prose prose-sm max-w-none">{renderedLines}</div>;
}